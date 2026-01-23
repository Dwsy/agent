/**
 * Model Test Command for Games Extension
 * Usage in pi: /game:test-models
 * Pure model speed testing without tools/skills/extensions
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import { padLine, createBoxLine, DEFAULT_COLORS } from "./shared/utils.js";

const PROMPT = "用一句话介绍你自己，不超过50字。";
const TIMEOUT_MS = 30000;
const CONCURRENT_LIMIT = 5;

interface ModelConfig {
	provider: string;
	model: string;
}

interface ModelResult {
	provider: string;
	model: string;
	time: number;
	output: string;
	status: "success" | "error" | "timeout" | "running";
	errorMsg?: string;
}

const MODELS: ModelConfig[] = [
	{ provider: "proxypal", model: "deepseek-r1" },
	{ provider: "proxypal", model: "qwen3-coder-plus" },
	{ provider: "proxypal", model: "qwen3-max" },
	{ provider: "proxypal", model: "minimax-m2.1" },
	{ provider: "proxypal", model: "glm-4.7" },
	{ provider: "proxypal", model: "kimi-k2-thinking" },
	{ provider: "nvidia", model: "minimaxai/minimax-m2.1" },
	{ provider: "nvidia", model: "z-ai/glm4.7" },
	{ provider: "modelscope", model: "Qwen/Qwen3-VL-235B-A22B-Instruct" },
	{ provider: "x-aio", model: "GLM-4.7" },
	{ provider: "x-aio", model: "MiniMax-M2.1" },
	{ provider: "x-aio", model: "XAIO-G-3-Flash-Preview" },
	{ provider: "xiaomimimo", model: "mimo-v2-flash" },
];

class ModelTestComponent {
	private results: ModelResult[] = [];
	private startTime: number;
	private onComplete: () => void;
	private tui: { requestRender: () => void };
	private version = 0;
	private finished = false;
	private selectedIndex = -1;
	private showDetails = false;
	private scrollOffset = 0;

	constructor(
		tui: { requestRender: () => void },
		onComplete: () => void,
	) {
		this.tui = tui;
		this.onComplete = onComplete;
		this.startTime = Date.now();
		this.startTests();
	}

	private async startTests(): Promise<void> {
		const tasks = MODELS.map(({ provider, model }, index) => () =>
			this.testModel(provider, model, index),
		);

		await this.runWithConcurrency(tasks, CONCURRENT_LIMIT);

		this.finished = true;
		this.version++;
		this.tui.requestRender();

		setTimeout(() => {
			this.onComplete();
		}, 5000);
	}

	private async testModel(
		provider: string,
		model: string,
		index: number,
	): Promise<void> {
		const resultIndex = this.results.length;
		this.results.push({
			provider,
			model,
			time: 0,
			output: "",
			status: "running",
		});
		this.version++;
		this.tui.requestRender();

		const startTime = Date.now();

		try {
			const args = [
				"--provider", provider,
				"--model", model,
				"--no-tools",
				"--no-skills",
				"--no-extensions",
				"--no-session",
				"--print",
			];

			const proc = spawn("pi", args);

			let stdout = "";
			let stderr = "";

			proc.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			proc.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			proc.stdin?.write(PROMPT);
			proc.stdin?.end();

			const timeoutPromise = new Promise<null>((_, reject) =>
				setTimeout(() => {
					proc.kill("SIGKILL");
					reject(new Error("Timeout"));
				}, TIMEOUT_MS),
			);

			const result = await Promise.race([
				new Promise<{ exitCode: number; stdout: string; stderr: string }>(
					(resolve) => {
						proc.on("close", (exitCode) => {
							resolve({ exitCode: exitCode || 0, stdout, stderr });
						});
					},
				),
				timeoutPromise,
			]);

			if (result === null) {
				this.results[resultIndex] = {
					provider,
					model,
					time: (Date.now() - startTime) / 1000,
					output: "TIMEOUT",
					status: "timeout",
				};
			} else {
				const { exitCode, stdout: out, stderr: err } = result;
				const duration = (Date.now() - startTime) / 1000;

				if (exitCode !== 0) {
					this.results[resultIndex] = {
						provider,
						model,
						time: duration,
						output: err || out || "ERROR",
						status: "error",
						errorMsg: err || out,
					};
				} else {
					const cleanOutput = this.cleanOutput(out);

					if (!cleanOutput) {
						this.results[resultIndex] = {
							provider,
							model,
							time: duration,
							output: "No output",
							status: "error",
							errorMsg: "Model returned no output",
						};
					} else {
						this.results[resultIndex] = {
							provider,
							model,
							time: duration,
							output: cleanOutput,
							status: "success",
						};
					}
				}
			}
		} catch (error: any) {
			this.results[resultIndex] = {
				provider,
				model,
				time: (Date.now() - startTime) / 1000,
				output: error.message || "ERROR",
				status: "error",
				errorMsg: error.message,
			};
		}

		this.version++;
		this.tui.requestRender();
	}

	private cleanOutput(text: string): string {
		return text
			.replace(/\x1b\[[0-9;]*m/g, "")
			.replace(/\x1b\]777;[^]+/g, "")
			.replace(/\x1b\]0;[^\x07]+\x07/g, "")
			.trim()
			.substring(0, 200);
	}

	private async runWithConcurrency<T>(
		tasks: (() => Promise<T>)[],
		limit: number,
	): Promise<T[]> {
		const results: T[] = [];
		const executing: Promise<void>[] = [];

		for (const task of tasks) {
			const promise = task().then((result) => {
				results.push(result);
				executing.splice(executing.indexOf(promise), 1);
			});

			executing.push(promise);

			if (executing.length >= limit) {
				await Promise.race(executing);
			}
		}

		await Promise.all(executing);
		return results;
	}

	handleInput(data: string): void {
		if (data === "q" || data === "Q" || data === "escape") {
			this.onComplete();
			return;
		}

		if (this.finished) {
			if (data === "up" || data === "k") {
				this.selectedIndex = Math.max(-1, this.selectedIndex - 1);
				this.showDetails = this.selectedIndex >= 0;
				this.version++;
				this.tui.requestRender();
			} else if (data === "down" || data === "j") {
				this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + 1);
				this.showDetails = this.selectedIndex >= 0;
				this.version++;
				this.tui.requestRender();
			} else if (data === "escape") {
				this.selectedIndex = -1;
				this.showDetails = false;
				this.version++;
				this.tui.requestRender();
			}
		}
	}

	invalidate(): void {
		this.version++;
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const boxWidth = Math.min(100, width - 4);
		const height = 35;

		const header = DEFAULT_COLORS.bold(DEFAULT_COLORS.green("MODEL SPEED TEST"));
		lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(boxWidth)}╮`), width));
		lines.push(padLine(createBoxLine(header, boxWidth, DEFAULT_COLORS), width));
		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const configLine = `Prompt: "${PROMPT}" | Timeout: ${TIMEOUT_MS}ms | Concurrency: ${CONCURRENT_LIMIT}`;
		lines.push(padLine(createBoxLine(configLine, boxWidth, DEFAULT_COLORS), width));
		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const total = MODELS.length;
		const completed = this.results.length;
		const running = this.results.filter(r => r.status === "running").length;
		const success = this.results.filter(r => r.status === "success").length;
		const error = this.results.filter(r => r.status === "error").length;
		const timeout = this.results.filter(r => r.status === "timeout").length;

		const progress = Math.floor((completed / total) * 100);
		const progressFilled = Math.floor((progress / 100) * (boxWidth - 2));
		const progressEmpty = boxWidth - 2 - progressFilled;

		const progressLine = `Progress: [${"█".repeat(progressFilled)}${"░".repeat(progressEmpty)}] ${progress}% (${completed}/${total})`;
		lines.push(padLine(createBoxLine(progressLine, boxWidth, DEFAULT_COLORS), width));

		const statsLine = `Running: ${running} | [OK] Success: ${success} | [X] Error: ${error} | [T] Timeout: ${timeout}`;
		lines.push(padLine(createBoxLine(statsLine, boxWidth, DEFAULT_COLORS), width));
		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

		if (this.results.length < total) {
			const title = this.finished ? "[OK] ALL TESTS COMPLETED" : `[*] TESTING... (${elapsed}s)`;
			lines.push(padLine(createBoxLine(title, boxWidth, DEFAULT_COLORS), width));
		} else {
			lines.push(padLine(createBoxLine(`[OK] COMPLETED in ${elapsed}s`, boxWidth, DEFAULT_COLORS), width));
		}
		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		if (this.showDetails && this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
			const result = this.results[this.selectedIndex];
			const statusColor = result.status === "success"
				? DEFAULT_COLORS.green
				: result.status === "timeout"
					? DEFAULT_COLORS.yellow
					: DEFAULT_COLORS.red;

			lines.push(padLine(createBoxLine(`[DETAILS] ${result.provider}/${result.model}`, boxWidth, DEFAULT_COLORS), width));
			lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

			const statusLine = `Status: ${statusColor(result.status.toUpperCase())} | Time: ${result.time.toFixed(3)}s`;
			lines.push(padLine(createBoxLine(statusLine, boxWidth, DEFAULT_COLORS), width));
			lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

			const outputLines = this.wrapText(result.output, boxWidth - 4);
			outputLines.forEach(line => {
				lines.push(padLine(createBoxLine(line, boxWidth, DEFAULT_COLORS), width));
			});

			if (result.errorMsg) {
				lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));
				const errorLines = this.wrapText(`Error: ${result.errorMsg}`, boxWidth - 4);
				errorLines.forEach(line => {
					lines.push(padLine(createBoxLine(DEFAULT_COLORS.red(line), boxWidth, DEFAULT_COLORS), width));
				});
			}

			lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));
			lines.push(padLine(createBoxLine("Press ESC to return to list, Q to quit", boxWidth, DEFAULT_COLORS), width));
		} else {
			const listHeight = Math.max(5, Math.min(15, height - 14));
			const displayResults = this.results.slice(-listHeight);

			if (displayResults.length === 0) {
				lines.push(padLine(createBoxLine("Waiting for tests to start...", boxWidth, DEFAULT_COLORS), width));
			} else {
				displayResults.forEach((result, idx) => {
					const actualIdx = this.results.length - displayResults.length + idx;
					const statusIcon = result.status === "success"
						? "[OK]"
						: result.status === "timeout"
							? "[T]"
							: result.status === "running"
								? "[*]"
								: "[X]";

					const name = `${result.provider}/${result.model}`;
					const nameTruncated = name.length > 40 ? name.substring(0, 37) + "..." : name;

					const timeText = result.status === "running" ? "..." : `${result.time.toFixed(2)}s`;
					const statusText = `${statusIcon} ${nameTruncated.padEnd(40)} ${timeText.padEnd(8)}`;

					const isSelected = actualIdx === this.selectedIndex;
					const line = isSelected ? DEFAULT_COLORS.dim("> ") + DEFAULT_COLORS.bold(statusText) : `  ${statusText}`;

					lines.push(padLine(createBoxLine(line, boxWidth - 2, DEFAULT_COLORS), width));
				});
			}
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const sorted = this.results
			.filter(r => r.status === "success")
			.sort((a, b) => a.time - b.time);

		if (sorted.length > 0) {
			lines.push(padLine(createBoxLine("[TOP] Top 3 Fastest:", boxWidth, DEFAULT_COLORS), width));
			sorted.slice(0, 3).forEach((result, idx) => {
				const rank = idx === 0 ? "1st" : idx === 1 ? "2nd" : "3rd";
				const line = `#${rank} ${result.provider}/${result.model} - ${result.time.toFixed(3)}s`;
				lines.push(padLine(createBoxLine(line, boxWidth, DEFAULT_COLORS), width));
			});
		}

		if (this.finished) {
			const avgTime = this.results.length > 0
				? (this.results.reduce((sum, r) => sum + r.time, 0) / this.results.length).toFixed(3)
				: "0.000";

			const avgSuccess = success > 0
				? (this.results
					.filter(r => r.status === "success")
					.reduce((sum, r) => sum + r.time, 0) / success).toFixed(3)
				: "0.000";

			lines.push(padLine(createBoxLine(`[AVG] All: ${avgTime}s | Success only: ${avgSuccess}s`, boxWidth, DEFAULT_COLORS), width));
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(boxWidth)}╯`), width));

		if (this.finished) {
			const footerLine = "[UP/DOWN] Select | [ESC] Deselect | [Q] Quit";
			lines.push(padLine(DEFAULT_COLORS.dim("  " + footerLine), width));
		}

		return lines;
	}

	private wrapText(text: string, maxWidth: number): string[] {
		if (!text) return [""];
		const lines: string[] = [];
		let currentLine = "";
		for (const char of text) {
			if (currentLine.length >= maxWidth) {
				lines.push(currentLine);
				currentLine = "";
			}
			currentLine += char;
		}
		if (currentLine) {
			lines.push(currentLine);
		}
		return lines;
	}

	dispose(): void {
	}
}

export const handler = async (_args: unknown, ctx: ExtensionAPI): Promise<void> => {
	if (!ctx.hasUI) {
		ctx.ui.notify("Model test requires interactive mode", "error");
		return;
	}

	await ctx.ui.custom((tui, _theme, _kb, done) => {
		return new ModelTestComponent(
			tui,
			() => done(undefined),
		);
	});
}