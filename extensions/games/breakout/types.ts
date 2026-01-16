export interface GameState {
	paddleX: number;
	ballX: number;
	ballY: number;
	ballDX: number;
	ballDY: number;
	bricks: boolean[][];
	score: number;
	lives: number;
	level: number;
	gameOver: boolean;
	won: boolean;
}

export const BRICK_ROWS = 5;
export const BRICK_COLS = 10;