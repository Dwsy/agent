export type Direction = "up" | "down" | "left" | "right";

export interface Point {
	x: number;
	y: number;
}

export interface GameState {
	snake: Point[];
	food: Point;
	direction: Direction;
	nextDirection: Direction;
	score: number;
	gameOver: boolean;
	highScore: number;
}