export const GAME_WIDTH = 40;
export const GAME_HEIGHT = 15;
export const PADDLE_WIDTH = 1;
export const PADDLE_HEIGHT = 4;
export const BALL_SIZE = 1;
export const TICK_MS = 80;

export const PONG_SAVE_TYPE = "pong-save";

export const COLORS = {
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export const SYMBOLS = {
	paddle: "█",
	ball: "●",
	net: "·",
	empty: " ",
};