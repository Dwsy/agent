export const DIFFICULTY_CONFIGS: Record<string, { width: number; height: number; mines: number }> = {
	easy: { width: 9, height: 9, mines: 10 },
	medium: { width: 16, height: 16, mines: 40 },
	hard: { width: 30, height: 16, mines: 99 },
};

export const DEFAULT_DIFFICULTY = "medium" as const;

export const MINESWEEPER_SAVE_TYPE = "minesweeper-save";

export const CELL_WIDTH = 3;

export const COLORS = {
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
	magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export const NUMBER_COLORS: Record<number, string> = {
	1: COLORS.blue,
	2: COLORS.green,
	3: COLORS.red,
	4: COLORS.magenta,
	5: COLORS.yellow,
	6: COLORS.cyan,
	7: COLORS.bold(COLORS.red),
	8: COLORS.bold(COLORS.yellow),
};

export const SYMBOLS = {
	hidden: COLORS.dim("■"),
	flag: COLORS.red("F"),
	mine: COLORS.red("*"),
	empty: " ",
};