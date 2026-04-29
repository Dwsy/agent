export interface BaseGameState {
	score: number;
	highScore: number;
	gameOver: boolean;
	paused: boolean;
}

export interface GameConfig {
	width: number;
	height: number;
	tickMs: number;
	cellWidth: number;
}

export interface GameColors {
	dim: (s: string) => string;
	green: (s: string) => string;
	red: (s: string) => string;
	yellow: (s: string) => string;
	blue: (s: string) => string;
	bold: (s: string) => string;
}

export interface GameSymbols {
	empty: string;
	wall: string;
	[key: string]: string;
}