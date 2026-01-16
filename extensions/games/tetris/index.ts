import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { GameState, Tetromino, TetrominoType, Point } from "./types.js";
import {
	BOARD_WIDTH,
	BOARD_HEIGHT,
	TICK_MS,
	CELL_WIDTH,
	TETRIS_SAVE_TYPE,
	COLORS,
	SYMBOLS,
	TETROMINO_SHAPES,
	TETROMINO_COLORS,
} from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

const TETROMINO_TYPES: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];

function createEmptyBoard(): (string | null)[][] {
	return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
}

function createInitialState(): GameState {
	const piece = spawnPiece();
	return {
		board: createEmptyBoard(),
		currentPiece: piece,
		pieceX: Math.floor((BOARD_WIDTH - piece.shape.length) / 2),
		pieceY: 0,
		score: 0,
		level: 1,
		lines: 0,
		gameOver: false,
		highScore: 0,
	};
}

function spawnPiece(): Tetromino {
	const type = TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)];
	return {
		type,
		shape: TETROMINO_SHAPES[type].map((p) => ({ ...p })),
		color: TETROMINO_COLORS[type],
	};
}

function rotatePiece(piece: Tetromino): Tetromino {
	const rotated: Point[] = piece.shape.map((p) => ({
		x: -p.y,
		y: p.x,
	}));
	return { ...piece, shape: rotated };
}

function isValidPosition(
	board: (string | null)[][],
	piece: Tetromino,
	pieceX: number,
	pieceY: number,
): boolean {
	for (const block of piece.shape) {
		const x = pieceX + block.x;
		const y = pieceY + block.y;

		if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) {
			return false;
		}

		if (y >= 0 && board[y][x] !== null) {
			return false;
		}
	}
	return true;
}

function lockPiece(state: GameState): void {
	for (const block of state.currentPiece.shape) {
		const x = state.pieceX + block.x;
		const y = state.pieceY + block.y;

		if (y >= 0) {
			state.board[y][x] = state.currentPiece.color;
		}
	}
}

function clearLines(state: GameState): void {
	let linesCleared = 0;

	for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
		if (state.board[y].every((cell) => cell !== null)) {
			state.board.splice(y, 1);
			state.board.unshift(Array(BOARD_WIDTH).fill(null));
			linesCleared++;
			y++;
		}
	}

	if (linesCleared > 0) {
		state.lines += linesCleared;
		state.score += linesCleared * 100 * state.level;
		state.level = Math.floor(state.lines / 10) + 1;

		if (state.score > state.highScore) {
			state.highScore = state.score;
		}
	}
}

class TetrisComponent {
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
		}, TICK_MS / Math.sqrt(this.state.level));
	}

	private tick(): void {
		if (isValidPosition(this.state.board, this.state.currentPiece, this.state.pieceX, this.state.pieceY + 1)) {
			this.state.pieceY++;
		} else {
			lockPiece(this.state);
			clearLines(this.state);

			const newPiece = spawnPiece();
			this.state.currentPiece = newPiece;
			this.state.pieceX = Math.floor((BOARD_WIDTH - newPiece.shape.length) / 2);
			this.state.pieceY = 0;

			if (!isValidPosition(this.state.board, this.state.currentPiece, this.state.pieceX, this.state.pieceY)) {
				this.state.gameOver = true;
			}
		}
	}

	private movePiece(dx: number, dy: number): void {
		if (isValidPosition(this.state.board, this.state.currentPiece, this.state.pieceX + dx, this.state.pieceY + dy)) {
			this.state.pieceX += dx;
			this.state.pieceY += dy;
			this.version++;
			this.tui.requestRender();
		}
	}

	private rotate(): void {
		const rotated = rotatePiece(this.state.currentPiece);
		if (isValidPosition(this.state.board, rotated, this.state.pieceX, this.state.pieceY)) {
			this.state.currentPiece = rotated;
			this.version++;
			this.tui.requestRender();
		}
	}

	private drop(): void {
		while (isValidPosition(this.state.board, this.state.currentPiece, this.state.pieceX, this.state.pieceY + 1)) {
			this.state.pieceY++;
		}
		this.tick();
		this.version++;
		this.tui.requestRender();
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
			if (data === "r" || data === "R" || data === " ") {
				const highScore = this.state.highScore;
				this.state = createInitialState();
				this.state.highScore = highScore;
				this.version++;
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "left") || data === "a" || data === "A") {
			this.movePiece(-1, 0);
		} else if (matchesKey(data, "right") || data === "d" || data === "D") {
			this.movePiece(1, 0);
		} else if (matchesKey(data, "down") || data === "s" || data === "S") {
			this.movePiece(0, 1);
		} else if (matchesKey(data, "up") || data === "w" || data === "W") {
			this.rotate();
		} else if (data === " " || data === "x" || data === "X") {
			this.drop();
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

		const boxWidth = BOARD_WIDTH * CELL_WIDTH;

		lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(boxWidth)}╮`), width));

		const scoreText = `Score: ${COLORS.bold(COLORS.yellow(String(this.state.score)))}`;
		const highText = `High: ${COLORS.bold(COLORS.yellow(String(this.state.highScore)))}`;
		const levelText = `Level: ${COLORS.bold(COLORS.cyan(String(this.state.level)))}`;
		const title = `${COLORS.bold(COLORS.magenta("TETRIS"))} │ ${scoreText} │ ${highText} │ ${levelText}`;
		lines.push(padLine(createBoxLine(title, boxWidth, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		for (let y = 0; y < BOARD_HEIGHT; y++) {
			let row = "";
			for (let x = 0; x < BOARD_WIDTH; x++) {
				const isPiece = this.state.currentPiece.shape.some(
					(p) => this.state.pieceX + p.x === x && this.state.pieceY + p.y === y,
				);
				const boardCell = this.state.board[y][x];

				if (isPiece) {
					row += this.state.currentPiece.color + SYMBOLS.filled + "\x1b[0m";
				} else if (boardCell) {
					row += boardCell + SYMBOLS.filled + "\x1b[0m";
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
			footer = `←↓→ move, ↑ rotate, Space drop, ${COLORS.bold("P")} pause, ${COLORS.bold("ESC")} save & exit, ${COLORS.bold("Q")} quit`;
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
		ctx.ui.notify("Tetris requires interactive mode", "error");
		return;
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new TetrisComponent(
			tui,
			() => done(undefined),
		);
	});
};