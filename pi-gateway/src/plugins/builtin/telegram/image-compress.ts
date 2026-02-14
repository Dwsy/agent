import { createRequire } from "module";
import * as path from "path";
import { fileURLToPath } from "url";
import type { ImageContent } from "../../../core/types.ts";

const require = createRequire(import.meta.url);
const fs = require("fs") as {
  readFileSync: (...args: unknown[]) => unknown;
  existsSync: (p: string) => boolean;
};

const WASM_FILENAME = "photon_rs_bg.wasm";
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024;

export interface TelegramImageCompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
  jpegQuality?: number;
}

export interface TelegramCompressedImage {
  data: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  wasResized: boolean;
}

const DEFAULT_OPTIONS: Required<TelegramImageCompressOptions> = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: DEFAULT_MAX_BYTES,
  jpegQuality: 80,
};

type PhotonModule = {
  PhotonImage: {
    new_from_byteslice: (bytes: Uint8Array) => {
      get_width: () => number;
      get_height: () => number;
      free: () => void;
    };
  };
  SamplingFilter: { Lanczos3: number };
  resize: (
    image: { free: () => void },
    width: number,
    height: number,
    filter: number,
  ) => {
    get_bytes: () => Uint8Array;
    get_bytes_jpeg: (quality: number) => Uint8Array;
    free: () => void;
  };
};

let photonModule: PhotonModule | null = null;
let loadPromise: Promise<PhotonModule | null> | null = null;

function pathOrNull(file: unknown): string | null {
  if (typeof file === "string") return file;
  if (file instanceof URL) return fileURLToPath(file);
  return null;
}

function getFallbackWasmPaths(): string[] {
  const execDir = path.dirname(process.execPath);
  return [
    path.join(execDir, WASM_FILENAME),
    path.join(execDir, "photon", WASM_FILENAME),
    path.join(process.cwd(), WASM_FILENAME),
  ];
}

function patchPhotonWasmRead(): () => void {
  const originalReadFileSync = fs.readFileSync.bind(fs) as (...args: unknown[]) => unknown;
  const fallbackPaths = getFallbackWasmPaths();

  const patchedReadFileSync = (...args: unknown[]): unknown => {
    const file = args[0];
    const options = args[1];
    const resolvedPath = pathOrNull(file);

    if (!resolvedPath?.endsWith(WASM_FILENAME)) {
      return originalReadFileSync(...args);
    }

    try {
      return originalReadFileSync(...args);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code && err.code !== "ENOENT") throw error;

      for (const fallbackPath of fallbackPaths) {
        if (!fs.existsSync(fallbackPath)) continue;
        if (options === undefined) return originalReadFileSync(fallbackPath);
        return originalReadFileSync(fallbackPath, options);
      }
      throw error;
    }
  };

  try {
    fs.readFileSync = patchedReadFileSync;
  } catch {
    Object.defineProperty(fs, "readFileSync", {
      value: patchedReadFileSync,
      writable: true,
      configurable: true,
    });
  }

  return () => {
    try {
      fs.readFileSync = originalReadFileSync;
    } catch {
      Object.defineProperty(fs, "readFileSync", {
        value: originalReadFileSync,
        writable: true,
        configurable: true,
      });
    }
  };
}

async function loadPhoton(): Promise<PhotonModule | null> {
  if (photonModule) return photonModule;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const restoreReadFileSync = patchPhotonWasmRead();
    try {
      const mod = (await import("@silvia-odwyer/photon-node")) as unknown as PhotonModule;
      photonModule = mod;
      return photonModule;
    } catch {
      photonModule = null;
      return null;
    } finally {
      restoreReadFileSync();
    }
  })();

  return loadPromise;
}

function pickSmaller(
  a: { buffer: Uint8Array; mimeType: "image/png" | "image/jpeg" },
  b: { buffer: Uint8Array; mimeType: "image/png" | "image/jpeg" },
): { buffer: Uint8Array; mimeType: "image/png" | "image/jpeg" } {
  return a.buffer.length <= b.buffer.length ? a : b;
}

export async function compressImageForAgent(
  imageContent: ImageContent,
  options?: TelegramImageCompressOptions,
): Promise<TelegramCompressedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const inputBuffer = Buffer.from(imageContent.data, "base64");

  const photon = await loadPhoton();
  if (!photon) {
    return {
      data: imageContent.data,
      mimeType: imageContent.mimeType,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
      wasResized: false,
    };
  }

  let image: ReturnType<PhotonModule["PhotonImage"]["new_from_byteslice"]> | null = null;

  try {
    image = photon.PhotonImage.new_from_byteslice(new Uint8Array(inputBuffer));
    const originalWidth = image.get_width();
    const originalHeight = image.get_height();

    if (
      originalWidth <= opts.maxWidth &&
      originalHeight <= opts.maxHeight &&
      inputBuffer.length <= opts.maxBytes
    ) {
      return {
        data: imageContent.data,
        mimeType: imageContent.mimeType,
        originalWidth,
        originalHeight,
        width: originalWidth,
        height: originalHeight,
        wasResized: false,
      };
    }

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > opts.maxWidth) {
      targetHeight = Math.round((targetHeight * opts.maxWidth) / targetWidth);
      targetWidth = opts.maxWidth;
    }
    if (targetHeight > opts.maxHeight) {
      targetWidth = Math.round((targetWidth * opts.maxHeight) / targetHeight);
      targetHeight = opts.maxHeight;
    }

    const tryBothFormats = (width: number, height: number, jpegQuality: number) => {
      const resized = photon.resize(image!, width, height, photon.SamplingFilter.Lanczos3);
      try {
        const pngBuffer = resized.get_bytes();
        const jpegBuffer = resized.get_bytes_jpeg(jpegQuality);
        return pickSmaller(
          { buffer: pngBuffer, mimeType: "image/png" },
          { buffer: jpegBuffer, mimeType: "image/jpeg" },
        );
      } finally {
        resized.free();
      }
    };

    const qualitySteps = [85, 70, 55, 40];
    const scaleSteps = [1, 0.75, 0.5, 0.35, 0.25];

    let finalWidth = targetWidth;
    let finalHeight = targetHeight;
    let best = tryBothFormats(targetWidth, targetHeight, opts.jpegQuality);

    if (best.buffer.length <= opts.maxBytes) {
      return {
        data: Buffer.from(best.buffer).toString("base64"),
        mimeType: best.mimeType,
        originalWidth,
        originalHeight,
        width: finalWidth,
        height: finalHeight,
        wasResized: true,
      };
    }

    for (const quality of qualitySteps) {
      best = tryBothFormats(targetWidth, targetHeight, quality);
      if (best.buffer.length <= opts.maxBytes) {
        return {
          data: Buffer.from(best.buffer).toString("base64"),
          mimeType: best.mimeType,
          originalWidth,
          originalHeight,
          width: finalWidth,
          height: finalHeight,
          wasResized: true,
        };
      }
    }

    for (const scale of scaleSteps) {
      finalWidth = Math.round(targetWidth * scale);
      finalHeight = Math.round(targetHeight * scale);
      if (finalWidth < 100 || finalHeight < 100) break;

      for (const quality of qualitySteps) {
        best = tryBothFormats(finalWidth, finalHeight, quality);
        if (best.buffer.length <= opts.maxBytes) {
          return {
            data: Buffer.from(best.buffer).toString("base64"),
            mimeType: best.mimeType,
            originalWidth,
            originalHeight,
            width: finalWidth,
            height: finalHeight,
            wasResized: true,
          };
        }
      }
    }

    return {
      data: Buffer.from(best.buffer).toString("base64"),
      mimeType: best.mimeType,
      originalWidth,
      originalHeight,
      width: finalWidth,
      height: finalHeight,
      wasResized: true,
    };
  } catch {
    return {
      data: imageContent.data,
      mimeType: imageContent.mimeType,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
      wasResized: false,
    };
  } finally {
    image?.free();
  }
}
