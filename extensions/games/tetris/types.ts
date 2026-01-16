export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export interface Point {
	x: number;
	y: number;
}

export interface Tetromino {
	type: TetrominoType;
	shape: Point[];
	color: string;
}

export interface GameState {
	board: (string | null)[][];
	currentPiece: Tetromino;
	pieceX: number;
	pieceY: number;
	score: number;
	level: number;
	lines: number;
	gameOver: boolean;
	highScore: number;
}

export const TETROMINO_SHAPES: Record<TetrominoType, Point[]> = {
	I: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
	O: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
	T: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
	S: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
	Z: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
	J: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
	L: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
};

export const TETROMINO_COLORS: Record<TetrominoType, string> = {
	I: "\x1b[36m", // Cyan
	O: "\x1b[33m", // Yellow
	T: "\x1b[35m", // Magenta
	S: "\x1b[32m", // Green
	Z: "\x1b[31m", // Red
	J: "\x1b[34m", // Blue
	L: "\x1b[33m", // Orange (using yellow)
};