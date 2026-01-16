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
	BREAKOUT_SAVE_TYPE,
	COLORS,
	BRICK_COLORS,
	SYMBOLS,
	BRICK_ROWS,
	BRICK_COLS,
} from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

function createBricks(): boolean[][] {
	return Array(BRICK_ROWS).fill(null).map(() => Array(BRICK_COLS).fill(true));
}

function createInitialState(): GameState {
	return {
		paddleX: Math.floor(GAME_WIDTH / 2) - Math.floor(PADDLE_WIDTH / 2),
		ballX: Math.floor(GAME_WIDTH / 2),
		ballY: GAME_HEIGHT - 3,
		ballDX: 1,
		ballDY: -1,
		bricks: createBricks(),
		score: 0,
		lives: 3,
		level: 1,
		gameOver: false,
		won: false,
	};
}

function resetBall(state: GameState): void {
	state.ballX = Math.floor(GAME_WIDTH / 2);
	state.ballY = GAME_HEIGHT - 3;
	state.ballDX = Math.random() > 0.5 ? 1 : -1;
	state.ballDY = -1;
}

function checkBrickCollision(state: GameState): boolean {
	const brickWidth = Math.floor((GAME_WIDTH - 2) / BRICK_COLS);
	const brickHeight = 2;

	const ballLeft = state.ballX;
	const ballRight = state.ballX + BALL_SIZE;
	const ballTop = state.ballY;
	const ballBottom = state.ballY + BALL_SIZE;

	for (let row = 0; row < BRICK_ROWS; row++) {
		for (let col = 0; col < BRICK_COLS; col++) {
			if (!state.bricks[row][col]) continue;

			const brickLeft = col * brickWidth + 1;
			const brickRight = brickLeft + brickWidth - 1;
			const brickTop = row * brickHeight + 2;
			const brickBottom = brickTop + brickHeight - 1;

			if (ballRight >= brickLeft && ballLeft <= brickRight && ballBottom >= brickTop && ballTop <= brickBottom) {
				state.bricks[row][col] = false;
				state.score += 10 * (BRICK_ROWS - row);

				if (state.ballX < brickLeft || state.ballX > brickRight) {
					state.ballDX = -state.ballDX;
				} else {
					state.ballDY = -state.ballDY;
				}

				return true;
			}
		}
	}

	return false;
}

function checkWin(state: GameState): boolean {
	return state.bricks.every((row) => row.every((cell) => !cell));
}

class BreakoutComponent {
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
			if (!this.state.gameOver && !this.state.won && !this.paused) {
				this.tick();
				this.version++;
				this.tui.requestRender();
			}
		}, TICK_MS);
	}

	private tick(): void {
		let newX = this.state.ballX + this.state.ballDX;
		let newY = this.state.ballY + this.state.ballDY;

		if (newX <= 0 || newX >= GAME_WIDTH - 1) {
			this.state.ballDX = -this.state.ballDX;
			newX = this.state.ballX + this.state.ballDX;
		}

		if (newY <= 1) {
			this.state.ballDY = -this.state.ballDY;
			newY = this.state.ballY + this.state.ballDY;
		}

		if (newY >= GAME_HEIGHT - 2) {
			if (newX >= this.state.paddleX && newX <= this.state.paddleX + PADDLE_WIDTH) {
				this.state.ballDY = -Math.abs(this.state.ballDY);
				const hitPos = (newX - this.state.paddleX) / PADDLE_WIDTH;
				this.state.ballDX = (hitPos - 0.5) * 2;
				newY = this.state.ballY + this.state.ballDY;
			} else if (newY >= GAME_HEIGHT - 1) {
				this.state.lives--;
				if (this.state.lives <= 0) {
					this.state.gameOver = true;
					if (this.interval) {
						clearInterval(this.interval);
						this.interval = null;
					}
					return;
				}
				resetBall(this.state);
				this.paused = true;
				this.version++;
				this.tui.requestRender();
				return;
			}
		}

		this.state.ballX = newX;
		this.state.ballY = newY;

		checkBrickCollision(this.state);

		if (checkWin(this.state)) {
			this.state.won = true;
			if (this.interval) {
				clearInterval(this.interval);
				this.interval = null;
			}
		}
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

		if (this.state.gameOver || this.state.won) {
			if (data === "r" || data === "R") {
				this.state = createInitialState();
				this.paused = false;
				this.startGame();
				this.version++;
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "left") || data === "a" || data === "A") {
			this.state.paddleX = Math.max(0, this.state.paddleX - 2);
			this.version++;
			this.tui.requestRender();
		} else if (matchesKey(data, "right") || data === "d" || data === "D") {
			this.state.paddleX = Math.min(GAME_WIDTH - PADDLE_WIDTH, this.state.paddleX + 2);
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

		const title = `${COLORS.bold(COLORS.cyan("BREAKOUT"))} │ Score: ${this.state.score} │ Lives: ${this.state.lives}`;
		lines.push(padLine(createBoxLine(title, GAME_WIDTH, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(GAME_WIDTH)}┤`), width));

		for (let y = 0; y < GAME_HEIGHT; y++) {
			let row = DEFAULT_COLORS.dim(" │");
			for (let x = 0; x < GAME_WIDTH; x++) {
				let char = SYMBOLS.empty;

				if (y === GAME_HEIGHT - 2 && x >= this.state.paddleX && x < this.state.paddleX + PADDLE_WIDTH) {
					char = SYMBOLS.paddle;
					row += COLORS.green(char);
				} else if (Math.round(this.state.ballX) === x && Math.round(this.state.ballY) === y) {
					char = SYMBOLS.ball;
					row += COLORS.yellow(char);
				} else if (y >= 2 && y < 2 + BRICK_ROWS * 2) {
					const brickRow = Math.floor((y - 2) / 2);
					const brickWidth = Math.floor((GAME_WIDTH - 2) / BRICK_COLS);
					const brickCol = Math.floor((x - 1) / brickWidth);

					if (brickRow < BRICK_ROWS && brickCol < BRICK_COLS && this.state.bricks[brickRow][brickCol]) {
						char = SYMBOLS.brick;
						const brickColor = BRICK_COLORS[brickRow] || COLORS.white;
						row += brickColor(char);
					} else {
						row += char;
					}
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
		} else if (this.state.won) {
			footer = `${COLORS.green(COLORS.bold("YOU WIN!"))} Press R to restart, ESC save & exit, Q quit`;
		} else if (this.state.gameOver) {
			footer = `${COLORS.red(COLORS.bold("GAME OVER!"))} Press R to restart, ESC save & exit, Q quit`;
		} else {
			footer = `←→ or AD to move paddle, P pause, ESC save & exit, Q quit`;
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
		ctx.ui.notify("Breakout requires interactive mode", "error");
		return;
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new BreakoutComponent(
			tui,
			() => done(undefined),
		);
	});
};