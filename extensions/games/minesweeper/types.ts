export interface GameState {
	board: Cell[][];
	revealed: boolean[][];
	flagged: boolean[][];
	mineCount: number;
	flags: number;
	gameOver: boolean;
	won: boolean;
	gameStarted: boolean;
}

export interface Cell {
	isMine: boolean;
	neighborMines: number;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyConfig {
	width: number;
	height: number;
	mines: number;
}