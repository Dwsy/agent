export const GAME_WIDTH = 40;
export const GAME_HEIGHT = 15;
export const TICK_MS = 100;

export const CELL_WIDTH = 2;

export const SNAKE_SAVE_TYPE = "snake-save";

export const COLORS = {
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export const SYMBOLS = {
	snakeHead: "██",
	snakeBody: "▓▓",
	food: "◆ ",
	empty: "  ",
};