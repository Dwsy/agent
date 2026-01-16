import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handler as snakeHandler } from "./snake/index.js";
import { handler as tetrisHandler } from "./tetris/index.js";
import { handler as game2048Handler } from "./2048/index.js";
import { handler as minesweeperHandler } from "./minesweeper/index.js";
import { handler as breakoutHandler } from "./breakout/index.js";
import { handler as pongHandler } from "./pong/index.js";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("snake", {
		description: "Play Snake!",
		handler: snakeHandler,
	});

	pi.registerCommand("tetris", {
		description: "Play Tetris!",
		handler: tetrisHandler,
	});

	pi.registerCommand("2048", {
		description: "Play 2048!",
		handler: game2048Handler,
	});

	pi.registerCommand("minesweeper", {
		description: "Play Minesweeper!",
		handler: minesweeperHandler,
	});

	pi.registerCommand("breakout", {
		description: "Play Breakout!",
		handler: breakoutHandler,
	});

	pi.registerCommand("pong", {
		description: "Play Pong!",
		handler: pongHandler,
	});
}