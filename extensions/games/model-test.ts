/**
 * Model Test Command for Games Extension
 * Usage in pi: /game:test-models
 * TUI-based model speed testing interface
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
		}, 3000);
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
			const proc = spawn("pi", ["--provider", provider, "--model", model]);

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
					proc.kill();
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
					const cleanOutput = out
						.replace(/\x1b\[[0-9;]*m/g, "")
						.replace(/\x1b\]777;[^]+/g, "")
						.trim();

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
		}
	}

	invalidate(): void {
		this.version++;
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const boxWidth = Math.min(100, width - 4);
		const height = 30;

		const header = `${DEFAULT_COLORS.bold(DEFAULT_COLORS.green("MODEL SPEED TEST"))}`;
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

		const statsLine = `Running: ${running} | ✅ Success: ${success} | ❌ Error: ${error} | ⏱️ Timeout: ${timeout}`;
		lines.push(padLine(createBoxLine(statsLine, boxWidth, DEFAULT_COLORS), width));
		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

		if (this.results.length < total) {
			const title = this.finished ? "✅ ALL TESTS COMPLETED" : `⏳ TESTING... (${elapsed}s)`;
			lines.push(padLine(createBoxLine(title, boxWidth, DEFAULT_COLORS), width));
		} else {
			lines.push(padLine(createBoxLine(`✅ COMPLETED in ${elapsed}s`, boxWidth, DEFAULT_COLORS), width));
		}
		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const listHeight = Math.max(5, Math.min(15, height - 12));
		const displayResults = this.results.slice(-listHeight);

		if (displayResults.length === 0) {
			lines.push(padLine(createBoxLine("Waiting for tests to start...", boxWidth, DEFAULT_COLORS), width));
		} else {
			displayResults.forEach((result, idx) => {
				const statusIcon = result.status === "success"
					? "✅"
					: result.status === "timeout"
						? "⏱️"
						: result.status === "running"
							? "⏳"
							: "❌";

				const name = `${result.provider}/${result.model}`;
				const nameTruncated = name.length > 40 ? name.substring(0, 37) + "..." : name;

				const timeText = result.status === "running" ? "..." : `${result.time.toFixed(2)}s`;
				const statusText = `${statusIcon} ${nameTruncated.padEnd(40)} ${timeText.padEnd(8)}`;

				lines.push(padLine(createBoxLine(statusText, boxWidth - 2, DEFAULT_COLORS), width));
			});
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

		const sorted = this.results
			.filter(r => r.status === "success")
			.sort((a, b) => a.time - b.time);

		if (sorted.length > 0) {
			lines.push(padLine(createBoxLine("🏆 Top 3 Fastest:", boxWidth, DEFAULT_COLORS), width));
			sorted.slice(0, 3).forEach((result, idx) => {
				const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
				const line = `${medal} ${result.provider}/${result.model} - ${result.time.toFixed(3)}s`;
				lines.push(padLine(createBoxLine(line, boxWidth, DEFAULT_COLORS), width));
			});
		}

		lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(boxWidth)}╯`), width));

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