/**
 * Border styles and rendering utilities
 */
import { safeLine } from "./text.js";

export interface BorderStyle {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  h: string;
  v: string;
  tj?: string;
  bj?: string;
  lj?: string;
  rj?: string;
  cj?: string;
}

export const Borders: Record<string, BorderStyle> = {
  rounded: {
    tl: "╭", tr: "╮", bl: "╰", br: "╯",
    h: "─", v: "│",
    tj: "┬", bj: "┴", lj: "├", rj: "┤", cj: "┼",
  },
  single: {
    tl: "┌", tr: "┐", bl: "└", br: "┘",
    h: "─", v: "│",
    tj: "┬", bj: "┴", lj: "├", rj: "┤", cj: "┼",
  },
  double: {
    tl: "╔", tr: "╗", bl: "╚", br: "╝",
    h: "═", v: "║",
  },
  thick: {
    tl: "┏", tr: "┓", bl: "┗", br: "┛",
    h: "━", v: "┃",
    tj: "┳", bj: "┻", lj: "┣", rj: "┫", cj: "╋",
  },
  none: {
    tl: " ", tr: " ", bl: " ", br: " ",
    h: " ", v: " ",
  },
};

export interface BoxOptions {
  width: number;
  height?: number;
  border?: BorderStyle;
  title?: string;
  titleAlign?: "left" | "center" | "right";
}

export function renderBox(options: BoxOptions): string[] {
  const { width, height = 3, border = Borders.single, title, titleAlign = "center" } = options;
  const inner = Math.max(0, width - 2);
  const lines: string[] = [];

  if (title && inner > 0) {
    const titleWidth = Math.min(title.length, inner - 2);
    const titleText = title.slice(0, titleWidth);
    const pad = inner - titleWidth;
    let left: number, right: number;
    if (titleAlign === "left") {
      left = 1;
      right = pad - 1;
    } else if (titleAlign === "right") {
      left = pad - 1;
      right = 1;
    } else {
      left = Math.floor(pad / 2);
      right = pad - left;
    }
    lines.push(
      border.tl + border.h.repeat(left) + " " + titleText + " " + border.h.repeat(right) + border.tr
    );
  } else {
    lines.push(border.tl + border.h.repeat(inner) + border.tr);
  }

  for (let i = 0; i < height - 2; i++) {
    lines.push(border.v + " ".repeat(inner) + border.v);
  }

  lines.push(border.bl + border.h.repeat(inner) + border.br);

  return lines;
}

export function renderLine(width: number, border: BorderStyle = Borders.single, withJunctions = false): string {
  const inner = Math.max(0, width - 2);
  if (withJunctions && border.lj && border.rj) {
    return border.lj + border.h.repeat(inner) + border.rj;
  }
  return border.h.repeat(width);
}
