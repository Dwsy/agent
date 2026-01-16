import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { GameState, Cell } from "./types.js";
import { DIFFICULTY_CONFIGS, DEFAULT_DIFFICULTY, MINESWEEPER_SAVE_TYPE, CELL_WIDTH, COLORS, NUMBER_COLORS, SYMBOLS } from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

function createEmptyBoard(width: number, height: number): Cell[][] {
	return Array(height).fill(null).map(() => Array(width).fill(null).map(() => ({ isMine: false, neighborMines: 0 })));
}

function createRevealedBoard(width: number, height: number): boolean[][] {
	return Array(height).fill(null).map(() => Array(width).fill(false));
}

function createFlaggedBoard(width: number, height: number): boolean[][] {
	return Array(height).fill(null).map(() => Array(width).fill(false));
}

function placeMines(board: Cell[][], width: number, height: number, mineCount: number, excludeX: number, excludeY: number): void {
	let placed = 0;
	while (placed < mineCount) {
		const x = Math.floor(Math.random() * width);
		const y = Math.floor(Math.random() * height);

		if (!board[y][x].isMine && (x !== excludeX || y !== excludeY)) {
			board[y][x].isMine = true;
			placed++;
		}
	}
}

function calculateNeighbors(board: Cell[][], width: number, height: number): void {
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (board[y][x].isMine) continue;

			let count = 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;

					const nx = x + dx;
					const ny = y + dy;

					if (nx >= 0 && nx < width && ny >= 0 && ny < height && board[ny][nx].isMine) {
						count++;
					}
				}
			}
			board[y][x].neighborMines = count;
		}
	}
}

function createInitialState(difficulty: string = DEFAULT_DIFFICULTY): GameState {
	const config = DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY];
	return {
		board: createEmptyBoard(config.width, config.height),
		revealed: createRevealedBoard(config.width, config.height),
		flagged: createFlaggedBoard(config.width, config.height),
		mineCount: config.mines,
		flags: 0,
		gameOver: false,
		won: false,
		gameStarted: false,
	};
}

function reveal(board: Cell[][], revealed: boolean[][], flagged: boolean[][], width: number, height: number, x: number, y: number): boolean {
	if (x < 0 || x >= width || y < 0 || y >= height) return false;
	if (revealed[y][x] || flagged[y][x]) return false;

	revealed[y][x] = true;

	if (board[y][x].isMine) {
		return true;
	}

	if (board[y][x].neighborMines === 0) {
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				reveal(board, revealed, flagged, width, height, x + dx, y + dy);
			}
		}
	}

	return false;
}

function checkWin(revealed: boolean[][], board: Cell[][], width: number, height: number, mineCount: number): boolean {
	let revealedCount = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (revealed[y][x]) revealedCount++;
		}
	}
	return revealedCount === width * height - mineCount;
}

function revealAllMines(board: Cell[][], revealed: boolean[][], width: number, height: number): void {
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (board[y][x].isMine) {
				revealed[y][x] = true;
			}
		}
	}
}

class MinesweeperComponent {
	private state: GameState;
	private width: number;
	private height: number;
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
		this.state = createInitialState(DEFAULT_DIFFICULTY);
		this.width = DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY].width;
		this.height = DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY].height;
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
			this.state = createInitialState(DEFAULT_DIFFICULTY);
			this.width = DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY].width;
			this.height = DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY].height;
			this.version++;
			this.tui.requestRender();
			return;
		}

		if (this.state.gameOver || this.state.won) return;

		if (data === " " || matchesKey(data, "enter")) {
			this.state = createInitialState(DEFAULT_DIFFICULTY);
			this.width = DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY].width;
			this.height = DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY].height;
			this.version++;
			this.tui.requestRender();
			return;
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

		const boxWidth = this.width * (CELL_WIDTH + 1) + 1;
		const maxBoxWidth = width - 4;
		const actualBoxWidth = Math.min(boxWidth, maxBoxWidth);

		lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(actualBoxWidth)}╮`), width));

		const flagsLeft = this.state.mineCount - this.state.flags;
		const title = `${COLORS.bold(COLORS.yellow("MINESWEEPER"))} │ Mines: ${flagsLeft} │ Flags: ${this.state.flags}`;
		lines.push(padLine(createBoxLine(title, boxWidth, COLORS), width));

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		for (let y = 0; y < this.height; y++) {
			let row = DEFAULT_COLORS.dim(" │");
			for (let x = 0; x < this.width; x++) {
				const cell = this.state.board[y][x];
				const revealed = this.state.revealed[y][x];
				const flagged = this.state.flagged[y][x];

				let display: string;
				if (flagged) {
					display = SYMBOLS.flag;
				} else if (!revealed) {
					display = SYMBOLS.hidden;
				} else if (cell.isMine) {
					display = SYMBOLS.mine;
				} else if (cell.neighborMines === 0) {
					display = SYMBOLS.empty;
				} else {
					const colorFn = NUMBER_COLORS[cell.neighborMines] || COLORS.white;
					display = colorFn(String(cell.neighborMines));
				}

				const padding = CELL_WIDTH - display.replace(/\x1b\[[0-9;]*m/g, "").length;
				row += " " + display + " ".repeat(padding) + DEFAULT_COLORS.dim("│");
			}
			lines.push(padLine(row, width));
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(actualBoxWidth)}╯`), width));

		let footer: string;
		if (this.paused) {
			footer = `${COLORS.yellow(COLORS.bold("PAUSED"))} Press any key to continue, ESC save & exit, Q quit`;
		} else if (this.state.won) {
			footer = `${COLORS.green(COLORS.bold("YOU WIN!"))} Press R to restart, ESC save & exit, Q quit`;
		} else if (this.state.gameOver) {
			footer = `${COLORS.red(COLORS.bold("GAME OVER!"))} Press R to restart, ESC save & exit, Q quit`;
		} else {
			footer = `Click to reveal, Right-click to flag (not implemented in TUI), P pause, ESC save & exit, Q quit`;
		}
		lines.push(padLine(createBoxLine(footer, actualBoxWidth, COLORS), width));

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;

		return lines;
	}

	dispose(): void {}
}

export const handler = async (_args: unknown, ctx: ExtensionAPI): Promise<void> => {
	if (!ctx.hasUI) {
		ctx.ui.notify("Minesweeper requires interactive mode", "error");
		return;
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new MinesweeperComponent(
			tui,
			() => done(undefined),
		);
	});
};