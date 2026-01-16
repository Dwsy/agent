import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { GameState, Direction } from "./types.js";
import { BOARD_SIZE, CELL_WIDTH, WIN_VALUE, GAME_2048_SAVE_TYPE, COLORS, CELL_COLORS, CELL_TEXT_COLORS } from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

function createEmptyBoard(): number[][] {
	return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
}

function createInitialState(): GameState {
	const board = createEmptyBoard();
	addRandomTile(board);
	addRandomTile(board);
	return {
		board,
		score: 0,
		gameOver: false,
		won: false,
		moves: 0,
	};
}

function getEmptyCells(board: number[][]): [number, number][] {
	const empty: [number, number][] = [];
	for (let y = 0; y < BOARD_SIZE; y++) {
		for (let x = 0; x < BOARD_SIZE; x++) {
			if (board[y][x] === 0) {
				empty.push([x, y]);
			}
		}
	}
	return empty;
}

function addRandomTile(board: number[][]): boolean {
	const empty = getEmptyCells(board);
	if (empty.length === 0) return false;

	const [x, y] = empty[Math.floor(Math.random() * empty.length)];
	board[y][x] = Math.random() < 0.9 ? 2 : 4;
	return true;
}

function slideRow(row: number[]): number[] {
	const filtered = row.filter((val) => val !== 0);
	const result: number[] = [];

	for (let i = 0; i < filtered.length; i++) {
		if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
			const merged = filtered[i] * 2;
			result.push(merged);
			i++;
		} else {
			result.push(filtered[i]);
		}
	}

	while (result.length < BOARD_SIZE) {
		result.push(0);
	}

	return result;
}

function rotateBoard(board: number[][]): number[][] {
	const rotated: number[][] = [];
	for (let x = 0; x < BOARD_SIZE; x++) {
		const newRow: number[] = [];
		for (let y = BOARD_SIZE - 1; y >= 0; y--) {
			newRow.push(board[y][x]);
		}
		rotated.push(newRow);
	}
	return rotated;
}

function move(board: number[][], direction: Direction): { newBoard: number[][]; moved: boolean } {
	let workingBoard = board.map((row) => [...row]);
	let moved = false;

	const rotations: Record<Direction, number> = {
		left: 0,
		up: 1,
		right: 2,
		down: 3,
	};

	for (let i = 0; i < rotations[direction]; i++) {
		workingBoard = rotateBoard(workingBoard);
	}

	let newBoard = workingBoard.map((row) => {
		const newRow = slideRow(row);
		if (newRow.join(",") !== row.join(",")) {
			moved = true;
		}
		return newRow;
	});

	const remainingRotations = (4 - rotations[direction]) % 4;
	for (let i = 0; i < remainingRotations; i++) {
		newBoard = rotateBoard(newBoard);
	}

	return { newBoard, moved };
}

function checkGameOver(board: number[][]): boolean {
	for (let y = 0; y < BOARD_SIZE; y++) {
		for (let x = 0; x < BOARD_SIZE; x++) {
			if (board[y][x] === 0) return false;

			if (x < BOARD_SIZE - 1 && board[y][x] === board[y][x + 1]) return false;
			if (y < BOARD_SIZE - 1 && board[y][x] === board[y + 1][x]) return false;
		}
	}
	return true;
}

function checkWin(board: number[][]): boolean {
	for (let y = 0; y < BOARD_SIZE; y++) {
		for (let x = 0; x < BOARD_SIZE; x++) {
			if (board[y][x] >= WIN_VALUE) return true;
		}
	}
	return false;
}

function calculateScore(oldBoard: number[][], newBoard: number[][]): number {
	let score = 0;
	for (let y = 0; y < BOARD_SIZE; y++) {
		for (let x = 0; x < BOARD_SIZE; x++) {
			if (newBoard[y][x] > 0) {
				score += newBoard[y][x];
			}
		}
	}
	return score;
}

class Game2048Component {
	private state: GameState;
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
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (this.paused) {
			if (matchesKey(data, "escape") || data === "q" || data === "Q") {
				this.onClose();
				return;
			}
			this.paused = false;
			this.version++;
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "escape") || data === "p" || data === "P") {
			this.paused = true;
			this.version++;
			this.tui.requestRender();
			return;
		}

		if (data === "q" || data === "Q") {
			this.onClose();
			return;
		}

		if ((this.state.gameOver || this.state.won) && (data === "r" || data === "R")) {
			this.state = createInitialState();
			this.version++;
			this.tui.requestRender();
			return;
		}

		if (this.state.gameOver || this.state.won) return;

		let direction: Direction | null = null;

		if (matchesKey(data, "up") || data === "w" || data === "W") {
			direction = "up";
		} else if (matchesKey(data, "down") || data === "s" || data === "S") {
			direction = "down";
		} else if (matchesKey(data, "left") || data === "a" || data === "A") {
			direction = "left";
		} else if (matchesKey(data, "right") || data === "d" || data === "D") {
			direction = "right";
		}

		if (direction) {
			const { newBoard, moved } = move(this.state.board, direction);
			if (moved) {
				this.state.board = newBoard;
				this.state.score = calculateScore(this.state.board, this.state.board);
				this.state.moves++;

				if (!this.state.won && checkWin(this.state.board)) {
					this.state.won = true;
				} else {
					addRandomTile(this.state.board);
					if (checkGameOver(this.state.board)) {
						this.state.gameOver = true;
					}
				}

				this.version++;
				this.tui.requestRender();
			}
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

		const boxWidth = BOARD_SIZE * (CELL_WIDTH + 1) + 1;
		const maxBoxWidth = width - 4;
		const actualBoxWidth = Math.min(boxWidth, maxBoxWidth);

		lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(actualBoxWidth)}╮`), width));

		const title = `${COLORS.bold(COLORS.yellow("2048"))} │ Score: ${this.state.score} │ Moves: ${this.state.moves}`;
		lines.push(padLine(createBoxLine(title, boxWidth, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		for (let y = 0; y < BOARD_SIZE; y++) {
			let row = DEFAULT_COLORS.dim(" │");
			for (let x = 0; x < BOARD_SIZE; x++) {
				const value = this.state.board[y][x];
				const cellBg = CELL_COLORS[value] || CELL_COLORS[0];
				const cellText = CELL_TEXT_COLORS[value] || "\x1b[38;5;15m";
				const displayValue = value === 0 ? "" : String(value);
				const padding = CELL_WIDTH - displayValue.length;

				row += cellBg + " " + cellText + displayValue + " ".repeat(padding) + "\x1b[0m" + DEFAULT_COLORS.dim("│");
			}
			lines.push(padLine(row, width));
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(actualBoxWidth)}╯`), width));

		let footer: string;
		if (this.paused) {
			footer = `${COLORS.yellow(COLORS.bold("PAUSED"))} Press any key to continue, ESC save & exit, Q quit`;
		} else if (this.state.won) {
			footer = `${COLORS.green(COLORS.bold("YOU WIN!"))} Press R to continue playing, ESC save & exit, Q quit`;
		} else if (this.state.gameOver) {
			footer = `${COLORS.red(COLORS.bold("GAME OVER!"))} Press R to restart, ESC save & exit, Q quit`;
		} else {
			footer = `↑↓←→ or WASD to move, P pause, ESC save & exit, Q quit`;
		}
		lines.push(padLine(createBoxLine(footer, boxWidth, COLORS), width));

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;

		return lines;
	}

	dispose(): void {}
}

export const handler = async (_args: unknown, ctx: ExtensionAPI): Promise<void> => {
	if (!ctx.hasUI) {
		ctx.ui.notify("2048 requires interactive mode", "error");
		return;
	}

	const entries = ctx.sessionManager.getEntries();
	let savedState: GameState | undefined;
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "custom" && entry.customType === GAME_2048_SAVE_TYPE) {
			savedState = entry.data as GameState;
			break;
		}
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new Game2048Component(
			tui,
			() => done(undefined),
			(state) => {
				ctx.appendEntry(GAME_2048_SAVE_TYPE, state);
			},
			savedState,
		);
	});
};