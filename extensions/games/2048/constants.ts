export const BOARD_SIZE = 4;
export const CELL_WIDTH = 8;
export const WIN_VALUE = 2048;

export const GAME_2048_SAVE_TYPE = "2048-save";

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
	bg: (s: string, bg: string) => `${bg}${s}\x1b[49m`,
};

export const CELL_COLORS: Record<number, string> = {
	0: "\x1b[48;5;238m", // Dark gray
	2: "\x1b[48;5;250m", // Light gray
	4: "\x1b[48;5;252m", // White-ish
	8: "\x1b[48;5;214m", // Orange
	16: "\x1b[48;5;208m", // Darker orange
	32: "\x1b[48;5;202m", // Red-orange
	64: "\x1b[48;5;196m", // Red
	128: "\x1b[48;5;226m", // Yellow
	256: "\x1b[48;5;190m", // Light yellow
	512: "\x1b[48;5;154m", // Light green
	1024: "\x1b[48;5;46m", // Green
	2048: "\x1b[48;5;51m", // Cyan
};

export const CELL_TEXT_COLORS: Record<number, string> = {
	2: "\x1b[38;5;0m",
	4: "\x1b[38;5;0m",
	8: "\x1b[38;5;15m",
	16: "\x1b[38;5;15m",
	32: "\x1b[38;5;15m",
	64: "\x1b[38;5;15m",
	128: "\x1b[38;5;0m",
	256: "\x1b[38;5;0m",
	512: "\x1b[38;5;0m",
	1024: "\x1b[38;5;15m",
	2048: "\x1b[38;5;0m",
};