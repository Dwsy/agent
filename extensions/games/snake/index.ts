import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { GameState, Direction, Point } from "./types.js";
import { GAME_WIDTH, GAME_HEIGHT, TICK_MS, CELL_WIDTH, SNAKE_SAVE_TYPE, COLORS, SYMBOLS } from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

function createInitialState(): GameState {
	const startX = Math.floor(GAME_WIDTH / 2);
	const startY = Math.floor(GAME_HEIGHT / 2);
	return {
		snake: [
			{ x: startX, y: startY },
			{ x: startX - 1, y: startY },
			{ x: startX - 2, y: startY },
		],
		food: spawnFood([{ x: startX, y: startY }]),
		direction: "right",
		nextDirection: "right",
		score: 0,
		gameOver: false,
		highScore: 0,
	};
}

function spawnFood(snake: Point[]): Point {
	let food: Point;
	do {
		food = {
			x: Math.floor(Math.random() * GAME_WIDTH),
			y: Math.floor(Math.random() * GAME_HEIGHT),
		};
	} while (snake.some((s) => s.x === food.x && s.y === food.y));
	return food;
}

class SnakeComponent {
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
			if (!this.state.gameOver) {
				this.tick();
				this.version++;
				this.tui.requestRender();
			}
		}, TICK_MS);
	}

	private tick(): void {
		this.state.direction = this.state.nextDirection;

		const head = this.state.snake[0];
		let newHead: Point;

		switch (this.state.direction) {
			case "up":
				newHead = { x: head.x, y: head.y - 1 };
				break;
			case "down":
				newHead = { x: head.x, y: head.y + 1 };
				break;
			case "left":
				newHead = { x: head.x - 1, y: head.y };
				break;
			case "right":
				newHead = { x: head.x + 1, y: head.y };
				break;
		}

		if (newHead.x < 0 || newHead.x >= GAME_WIDTH || newHead.y < 0 || newHead.y >= GAME_HEIGHT) {
			this.state.gameOver = true;
			return;
		}

		if (this.state.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
			this.state.gameOver = true;
			return;
		}

		this.state.snake.unshift(newHead);

		if (newHead.x === this.state.food.x && newHead.y === this.state.food.y) {
			this.state.score += 10;
			if (this.state.score > this.state.highScore) {
				this.state.highScore = this.state.score;
			}
			this.state.food = spawnFood(this.state.snake);
		} else {
			this.state.snake.pop();
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

		if (matchesKey(data, "up") || data === "w" || data === "W") {
			if (this.state.direction !== "down") this.state.nextDirection = "up";
		} else if (matchesKey(data, "down") || data === "s" || data === "S") {
			if (this.state.direction !== "up") this.state.nextDirection = "down";
		} else if (matchesKey(data, "right") || data === "d" || data === "D") {
			if (this.state.direction !== "left") this.state.nextDirection = "right";
		} else if (matchesKey(data, "left") || data === "a" || data === "A") {
			if (this.state.direction !== "right") this.state.nextDirection = "left";
		}

		if (this.state.gameOver && (data === "r" || data === "R" || data === " ")) {
			const highScore = this.state.highScore;
			this.state = createInitialState();
			this.state.highScore = highScore;
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

		const effectiveWidth = Math.min(GAME_WIDTH, Math.floor((width - 4) / CELL_WIDTH));
		const effectiveHeight = GAME_HEIGHT;

		const boxWidth = effectiveWidth * CELL_WIDTH;

		lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(boxWidth)}╮`), width));

		const scoreText = `Score: ${COLORS.bold(COLORS.yellow(String(this.state.score)))}`;
		const highText = `High: ${COLORS.bold(COLORS.yellow(String(this.state.highScore)))}`;
		const title = `${COLORS.bold(COLORS.green("SNAKE"))} │ ${scoreText} │ ${highText}`;
		lines.push(padLine(createBoxLine(title, boxWidth, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		for (let y = 0; y < effectiveHeight; y++) {
			let row = "";
			for (let x = 0; x < effectiveWidth; x++) {
				const isHead = this.state.snake[0].x === x && this.state.snake[0].y === y;
				const isBody = this.state.snake.slice(1).some((s) => s.x === x && s.y === y);
				const isFood = this.state.food.x === x && this.state.food.y === y;

				if (isHead) {
					row += COLORS.green(SYMBOLS.snakeHead);
				} else if (isBody) {
					row += COLORS.green(SYMBOLS.snakeBody);
				} else if (isFood) {
					row += COLORS.red(SYMBOLS.food);
				} else {
					row += SYMBOLS.empty;
				}
			}
			lines.push(padLine(DEFAULT_COLORS.dim(" │") + row + DEFAULT_COLORS.dim("│"), width));
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		let footer: string;
		if (this.paused) {
			footer = `${COLORS.yellow(COLORS.bold("PAUSED"))} Press any key to continue, ${COLORS.bold("ESC")} save & exit, ${COLORS.bold("Q")} quit`;
		} else if (this.state.gameOver) {
			footer = `${COLORS.red(COLORS.bold("GAME OVER!"))} Press ${COLORS.bold("R")} to restart, ${COLORS.bold("Q")} to quit`;
		} else {
			footer = `↑↓←→ or WASD to move, ${COLORS.bold("P")} pause, ${COLORS.bold("ESC")} save & exit, ${COLORS.bold("Q")} quit`;
		}
		lines.push(padLine(createBoxLine(footer, boxWidth, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(boxWidth)}╯`), width));

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
		ctx.ui.notify("Snake requires interactive mode", "error");
		return;
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new SnakeComponent(
			tui,
			() => done(undefined),
		);
	});
};