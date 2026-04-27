/**
 * Style utilities for ANSI color handling
 */

export type ColorFunction = (text: string) => string;

export interface Theme {
	reset: ColorFunction;
	bold: ColorFunction;
	dim: ColorFunction;
	italic: ColorFunction;
	underline: ColorFunction;
	strikethrough: ColorFunction;

	// Foreground colors
	black: ColorFunction;
	red: ColorFunction;
	green: ColorFunction;
	yellow: ColorFunction;
	blue: ColorFunction;
	magenta: ColorFunction;
	cyan: ColorFunction;
	white: ColorFunction;

	// Bright colors
	brightBlack: ColorFunction;
	brightRed: ColorFunction;
	brightGreen: ColorFunction;
	brightYellow: ColorFunction;
	brightBlue: ColorFunction;
	brightMagenta: ColorFunction;
	brightCyan: ColorFunction;
	brightWhite: ColorFunction;

	// Semantic colors
	primary: ColorFunction;
	secondary: ColorFunction;
	accent: ColorFunction;
	success: ColorFunction;
	warning: ColorFunction;
	error: ColorFunction;
	muted: ColorFunction;
	border: ColorFunction;
}

/**
 * Basic ANSI color functions
 */
export const ansi = {
	reset: "\x1b[0m",
	bold: "\x1b[1m", boldOff: "\x1b[22m",
	dim: "\x1b[2m", dimOff: "\x1b[22m",
	italic: "\x1b[3m", italicOff: "\x1b[23m",
	underline: "\x1b[4m", underlineOff: "\x1b[24m",
	strikethrough: "\x1b[9m", strikethroughOff: "\x1b[29m",

	black: "\x1b[30m", red: "\x1b[31m", green: "\x1b[32m",
	yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m",
	cyan: "\x1b[36m", white: "\x1b[37m",

	brightBlack: "\x1b[90m", brightRed: "\x1b[91m", brightGreen: "\x1b[92m",
	brightYellow: "\x1b[93m", brightBlue: "\x1b[94m", brightMagenta: "\x1b[95m",
	brightCyan: "\x1b[96m", brightWhite: "\x1b[97m",
};

function makeColor(on: string, off: string): ColorFunction {
	return (text: string) => `${on}${text}${off}`;
}

/**
 * Default terminal theme
 */
export const DefaultTheme: Theme = {
	reset: makeColor(ansi.reset, ""),
	bold: makeColor(ansi.bold, ansi.boldOff),
	dim: makeColor(ansi.dim, ansi.dimOff),
	italic: makeColor(ansi.italic, ansi.italicOff),
	underline: makeColor(ansi.underline, ansi.underlineOff),
	strikethrough: makeColor(ansi.strikethrough, ansi.strikethroughOff),

	black: makeColor(ansi.black, ansi.reset),
	red: makeColor(ansi.red, ansi.reset),
	green: makeColor(ansi.green, ansi.reset),
	yellow: makeColor(ansi.yellow, ansi.reset),
	blue: makeColor(ansi.blue, ansi.reset),
	magenta: makeColor(ansi.magenta, ansi.reset),
	cyan: makeColor(ansi.cyan, ansi.reset),
	white: makeColor(ansi.white, ansi.reset),

	brightBlack: makeColor(ansi.brightBlack, ansi.reset),
	brightRed: makeColor(ansi.brightRed, ansi.reset),
	brightGreen: makeColor(ansi.brightGreen, ansi.reset),
	brightYellow: makeColor(ansi.brightYellow, ansi.reset),
	brightBlue: makeColor(ansi.brightBlue, ansi.reset),
	brightMagenta: makeColor(ansi.brightMagenta, ansi.reset),
	brightCyan: makeColor(ansi.brightCyan, ansi.reset),
	brightWhite: makeColor(ansi.brightWhite, ansi.reset),

	// Semantic mappings
	primary: makeColor(ansi.blue, ansi.reset),
	secondary: makeColor(ansi.cyan, ansi.reset),
	accent: makeColor(ansi.magenta, ansi.reset),
	success: makeColor(ansi.green, ansi.reset),
	warning: makeColor(ansi.yellow, ansi.reset),
	error: makeColor(ansi.red, ansi.reset),
	muted: makeColor(ansi.dim, ansi.dimOff),
	border: makeColor(ansi.dim, ansi.dimOff),
};

/**
 * Create a custom theme with overrides
 */
export function createTheme(overrides: Partial<Theme>): Theme {
	return { ...DefaultTheme, ...overrides };
}

/**
 * No-color theme (for testing or monochrome terminals)
 */
export const NoColorTheme: Theme = Object.fromEntries(
	Object.keys(DefaultTheme).map((key) => [key, (text: string) => text])
) as unknown as Theme;
