export const GAME_WIDTH = 40;
export const GAME_HEIGHT = 20;
export const PADDLE_WIDTH = 6;
export const PADDLE_HEIGHT = 1;
export const BALL_SIZE = 1;
export const TICK_MS = 50;

export const BREAKOUT_SAVE_TYPE = "breakout-save";

export const COLORS = {
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
	magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	white: (s: string) => `\x1b[37m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export const BRICK_COLORS = ["\x1b[31m", "\x1b[33m", "\x1b[32m", "\x1b[36m", "\x1b[35m"];

export const SYMBOLS = {
	paddle: "▀",
	ball: "●",
	brick: "▀",
	empty: " ",
};