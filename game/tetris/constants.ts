export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const TICK_MS = 500;

export const CELL_WIDTH = 2;

export const TETRIS_SAVE_TYPE = "tetris-save";

export const COLORS = {
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
	blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export const SYMBOLS = {
	filled: "██",
	empty: "  ",
	ghost: "░░",
};