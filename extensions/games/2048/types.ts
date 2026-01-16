export interface GameState {
	board: number[][];
	score: number;
	gameOver: boolean;
	won: boolean;
	moves: number;
}

export type Direction = "up" | "down" | "left" | "right";