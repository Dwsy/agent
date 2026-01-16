import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { GameState } from "./types.js";
import {
	GAME_WIDTH,
	GAME_HEIGHT,
	PADDLE_WIDTH,
	PADDLE_HEIGHT,
	BALL_SIZE,
	TICK_MS,
	PONG_SAVE_TYPE,
	COLORS,
	SYMBOLS,
	WIN_SCORE,
} from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

function createInitialState(): GameState {
	return {
		playerY: Math.floor(GAME_HEIGHT / 2) - Math.floor(PADDLE_HEIGHT / 2),
		computerY: Math.floor(GAME_HEIGHT / 2) - Math.floor(PADDLE_HEIGHT / 2),
		ballX: Math.floor(GAME_WIDTH / 2),
		ballY: Math.floor(GAME_HEIGHT / 2),
		ballDX: 1,
		ballDY: 1,
		playerScore: 0,
		computerScore: 0,
		gameOver: false,
		winner: null,
	};
}

function resetBall(state: GameState): void {
	state.ballX = Math.floor(GAME_WIDTH / 2);
	state.ballY = Math.floor(GAME_HEIGHT / 2);
	state.ballDX = Math.random() > 0.5 ? 1 : -1;
	state.ballDY = (Math.random() - 0.5) * 2;
}

function checkWin(state: GameState): void {
	if (state.playerScore >= WIN_SCORE) {
		state.gameOver = true;
		state.winner = "player";
	} else if (state.computerScore >= WIN_SCORE) {
		state.gameOver = true;
		state.winner = "computer";
	}
}

function moveComputer(state: GameState): void {
	const paddleCenter = state.computerY + Math.floor(PADDLE_HEIGHT / 2);
	const targetY = state.ballY;

	if (paddleCenter < targetY - 1) {
		state.computerY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, state.computerY + 1);
	} else if (paddleCenter > targetY + 1) {
		state.computerY = Math.max(0, state.computerY - 1);
	}
}

class PongComponent {
	private state: GameState;
	private interval: ReturnType<typeof setInterval> | null = null;
	private onClose: () => void;
	private tui: { requestRender: () => void };
	private cachedLines: string[] = [];
	private cachedWidth = 0;
	private version = 0;
	private cachedVersion = -1;
	private paused: boolean;

	constructor(
		tui: { requestRender: () => void },
		onClose: () => void,
	) {
		this.tui = tui;
		this.state = createInitialState();
		this.paused = false;
		this.startGame();
		this.onClose = onClose;
	}

	private startGame(): void {
		this.interval = setInterval(() => {
			if (!this.state.gameOver && !this.paused) {
				this.tick();
				this.version++;
				this.tui.requestRender();
			}
		}, TICK_MS);
	}

	private tick(): void {
		let newX = this.state.ballX + this.state.ballDX;
		let newY = this.state.ballY + this.state.ballDY;

		if (newY <= 0 || newY >= GAME_HEIGHT - 1) {
			this.state.ballDY = -this.state.ballDY;
			newY = this.state.ballY + this.state.ballDY;
		}

		if (newX <= 2) {
			if (newY >= this.state.playerY && newY < this.state.playerY + PADDLE_HEIGHT) {
				this.state.ballDX = Math.abs(this.state.ballDX);
				const hitPos = (newY - this.state.playerY) / PADDLE_HEIGHT;
				this.state.ballDY = (hitPos - 0.5) * 2;
				newX = this.state.ballX + this.state.ballDX;
			} else if (newX <= 0) {
				this.state.computerScore++;
				checkWin(this.state);
				if (!this.state.gameOver) {
					resetBall(this.state);
				}
				return;
			}
		}

		if (newX >= GAME_WIDTH - 3) {
			if (newY >= this.state.computerY && newY < this.state.computerY + PADDLE_HEIGHT) {
				this.state.ballDX = -Math.abs(this.state.ballDX);
				const hitPos = (newY - this.state.computerY) / PADDLE_HEIGHT;
				this.state.ballDY = (hitPos - 0.5) * 2;
				newX = this.state.ballX + this.state.ballDX;
			} else if (newX >= GAME_WIDTH - 1) {
				this.state.playerScore++;
				checkWin(this.state);
				if (!this.state.gameOver) {
					resetBall(this.state);
				}
				return;
			}
		}

		this.state.ballX = newX;
		this.state.ballY = newY;

		moveComputer(this.state);
	}

	handleInput(data: string): void {
		if (this.paused) {
			if (matchesKey(data, "escape") || data === "q" || data === "Q") {
				this.dispose();
				this.onClose();
				return;
			}
			this.paused = false;
			this.startGame();
			this.version++;
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "escape") || data === "p" || data === "P") {
			this.paused = true;
			if (this.interval) {
				clearInterval(this.interval);
				this.interval = null;
			}
			this.version++;
			this.tui.requestRender();
			return;
		}

		if (data === "q" || data === "Q") {
			this.dispose();
			this.onClose();
			return;
		}

		if (this.state.gameOver) {
			if (data === "r" || data === "R") {
				this.state = createInitialState();
				this.paused = false;
				this.startGame();
				this.version++;
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "up") || data === "w" || data === "W") {
			this.state.playerY = Math.max(0, this.state.playerY - 2);
			this.version++;
			this.tui.requestRender();
		} else if (matchesKey(data, "down") || data === "s" || data === "S") {
			this.state.playerY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, this.state.playerY + 2);
			this.version++;
			this.tui.requestRender();
		}
	}

	invalidate(): void {
		this.cachedWidth = 0;
	}

	render(width: number): string[] {
		if (width === this.cachedWidth && this.cachedVersion === this.version) {
			return this.cachedLines;
		}

		const lines: string[] = [];

		lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(GAME_WIDTH)}╮`), width));

		const title = `${COLORS.bold(COLORS.cyan("PONG"))} │ Player: ${this.state.playerScore} | Computer: ${this.state.computerScore}`;
		lines.push(padLine(createBoxLine(title, GAME_WIDTH, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(GAME_WIDTH)}┤`), width));

		for (let y = 0; y < GAME_HEIGHT; y++) {
			let row = DEFAULT_COLORS.dim(" │");
			for (let x = 0; x < GAME_WIDTH; x++) {
				let char = SYMBOLS.empty;

				if (x === 1 && y >= this.state.playerY && y < this.state.playerY + PADDLE_HEIGHT) {
					char = SYMBOLS.paddle;
					row += COLORS.green(char);
				} else if (x === GAME_WIDTH - 2 && y >= this.state.computerY && y < this.state.computerY + PADDLE_HEIGHT) {
					char = SYMBOLS.paddle;
					row += COLORS.red(char);
				} else if (Math.round(this.state.ballX) === x && Math.round(this.state.ballY) === y) {
					char = SYMBOLS.ball;
					row += COLORS.yellow(char);
				} else if (x === Math.floor(GAME_WIDTH / 2)) {
					char = SYMBOLS.net;
					row += DEFAULT_COLORS.dim(char);
				} else {
					row += char;
				}
			}
			lines.push(padLine(row + DEFAULT_COLORS.dim("│"), width));
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(GAME_WIDTH)}╯`), width));

		let footer: string;
		if (this.paused) {
			footer = `${COLORS.yellow(COLORS.bold("PAUSED"))} Press any key to continue, ESC save & exit, Q quit`;
		} else if (this.state.gameOver) {
			const winnerText = this.state.winner === "player" ? "YOU WIN!" : "COMPUTER WINS!";
			const winnerColor = this.state.winner === "player" ? COLORS.green : COLORS.red;
			footer = `${winnerColor(COLORS.bold(winnerText))} Press R to restart, ESC save & exit, Q quit`;
		} else {
			footer = `↑↓ or WS to move paddle, P pause, ESC save & exit, Q quit`;
		}
		lines.push(padLine(createBoxLine(footer, GAME_WIDTH, COLORS), width));

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;

		return lines;
	}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}
}

export const handler = async (_args: unknown, ctx: ExtensionAPI): Promise<void> => {
	if (!ctx.hasUI) {
		ctx.ui.notify("Pong requires interactive mode", "error");
		return;
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new PongComponent(
			tui,
			() => done(undefined),
		);
	});
};