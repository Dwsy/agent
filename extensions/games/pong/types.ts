export interface GameState {
	playerY: number;
	computerY: number;
	ballX: number;
	ballY: number;
	ballDX: number;
	ballDY: number;
	playerScore: number;
	computerScore: number;
	gameOver: boolean;
	winner: "player" | "computer" | null;
}

export const WIN_SCORE = 5;