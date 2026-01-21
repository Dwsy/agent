import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handler as snakeHandler } from "./snake/index.js";
import { handler as tetrisHandler } from "./tetris/index.js";
import { handler as game2048Handler } from "./2048/index.js";
import { handler as minesweeperHandler } from "./minesweeper/index.js";
import { handler as breakoutHandler } from "./breakout/index.js";
import { handler as pongHandler } from "./pong/index.js";
import { handler as modelTestHandler } from "./model-test.js";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("game:snake", {
		description: "Play Snake!",
		handler: snakeHandler,
	});

	pi.registerCommand("game:tetris", {
		description: "Play Tetris!",
		handler: tetrisHandler,
	});

	pi.registerCommand("game:2048", {
		description: "Play 2048!",
		handler: game2048Handler,
	});

	pi.registerCommand("game:minesweeper", {
		description: "Play Minesweeper!",
		handler: minesweeperHandler,
	});

	pi.registerCommand("game:breakout", {
		description: "Play Breakout!",
		handler: breakoutHandler,
	});

	pi.registerCommand("game:pong", {
		description: "Play Pong!",
		handler: pongHandler,
	});

	pi.registerCommand("game:test-models", {
		description: "Test AI models in parallel",
		handler: modelTestHandler,
	});
}