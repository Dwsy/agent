/**
 * Content-defined chunking (CDC) for system prompt snapshots.
 *
 * Why not fixed-size chunking: the previous implementation cut whenever the byte
 * counter crossed ~8 KiB. That makes every boundary depend on the absolute offset
 * from the start of the document, so inserting, deleting or reordering anything
 * near the top shifts all later boundaries and rehashes every later chunk. System
 * prompts reorder their dynamic sections (tool lists, MCP server lists) between
 * turns, which invalidated ~100 KiB of near-identical content per capture.
 *
 * Here the boundary decision comes from a rolling "gear" hash over the byte
 * stream, so it only depends on the local neighbourhood of bytes. Boundaries are
 * then snapped forward to the next newline: that keeps chunks line-aligned and
 * readable, and guarantees we never cut a multi-byte UTF-8 code point in half.
 *
 * NOTE: GEAR_TABLE, the size bounds and BOUNDARY_MASK are part of the on-disk
 * storage format. Changing any of them changes every chunk hash, so bump
 * CHUNKER_VERSION and re-run the migration when that is intentional.
 */

export const CHUNKER_VERSION = "cdc-gear-v1";

/** Never cut below this, so a pathological hash hit cannot produce tiny chunks. */
const MIN_CHUNK_BYTES = 512;

/** Hard cap. Also the escape hatch when a section has no newline for a long stretch. */
const MAX_CHUNK_BYTES = 8 * 1024;

/** Hash hits with probability 1/2048 per byte, so chunks average ~2 KiB plus one line. */
const BOUNDARY_MASK = (1 << 11) - 1;

const NEWLINE = 0x0a;

/**
 * Deterministic gear table built from xorshift32. It must stay byte-for-byte
 * stable across runs and machines: chunk ids are hashes of chunk content, and the
 * content depends on where this table says the boundaries are.
 */
const GEAR_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  let state = 0x2545f491;
  for (let i = 0; i < 256; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    table[i] = state;
  }
  return table;
})();

function utf8Width(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead < 0xe0) return 2;
  if (lead < 0xf0) return 3;
  return 4;
}

export function chunkPrompt(prompt: string): string[] {
  if (!prompt) return [""];

  const bytes = Buffer.from(prompt, "utf8");
  const chunks: string[] = [];

  let start = 0;
  let hash = 0;
  let armed = false;
  let index = 0;

  while (index < bytes.length) {
    const end = index + utf8Width(bytes[index]);
    for (let i = index; i < end; i++) hash = ((hash << 1) + GEAR_TABLE[bytes[i]]) >>> 0;

    const size = end - start;
    if (!armed && size >= MIN_CHUNK_BYTES && (hash & BOUNDARY_MASK) === 0) armed = true;

    // `\n` is a complete single-byte code point, so testing the lead byte is exact.
    if (size >= MAX_CHUNK_BYTES || (armed && bytes[index] === NEWLINE)) {
      chunks.push(bytes.subarray(start, end).toString("utf8"));
      start = end;
      hash = 0;
      armed = false;
    }

    index = end;
  }

  if (start < bytes.length) chunks.push(bytes.subarray(start).toString("utf8"));
  return chunks.length > 0 ? chunks : [""];
}
