/**
 * Development fixture. Loaded only when the page is opened with `?fixture=1`
 * and only after a real fetch has failed, so it never reaches the production
 * path.
 *
 * Sessions are generated first; every aggregate below is summed from them.
 * Nothing here is a hand-written total, because a fixture whose parts do not
 * add up would hide exactly the bugs this UI has to avoid.
 */

const DAYS = 30;
const SESSION_ROOT = "/Users/dev/.pi/agent/sessions";

const PROJECTS = [
	{ cwd: "/Users/dev/work/ledger-api", weight: 0.42 },
	{ cwd: "/Users/dev/work/console-web", weight: 0.28 },
	{ cwd: "/Users/dev/lab/pi-insights", weight: 0.2 },
	{ cwd: "/Users/dev/lab/scratch", weight: 0.1 },
];

const MODELS = [
	{ provider: "anthropic", model: "claude-sonnet-4-6", api: "anthropic-messages", weight: 0.46, price: { input: 3e-6, output: 1.5e-5, cacheRead: 3e-7, cacheWrite: 3.75e-6 } },
	{ provider: "openai", model: "gpt-5-codex", api: "openai-responses", weight: 0.24, price: { input: 1.25e-6, output: 1e-5, cacheRead: 1.25e-7, cacheWrite: 0 } },
	{ provider: "anthropic", model: "claude-haiku-4-5", api: "anthropic-messages", weight: 0.16, price: { input: 8e-7, output: 4e-6, cacheRead: 8e-8, cacheWrite: 1e-6 } },
	{ provider: "3838-completions", model: "ark-code-latest", api: "openai-completions", weight: 0.14, price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
];

const TOOLS = [
	{ name: "read", weight: 0.26, errorRate: 0.012 },
	{ name: "edit", weight: 0.19, errorRate: 0.041 },
	{ name: "bash", weight: 0.17, errorRate: 0.128 },
	{ name: "grep", weight: 0.12, errorRate: 0.008 },
	{ name: "write", weight: 0.09, errorRate: 0.005 },
	{ name: "glob", weight: 0.07, errorRate: 0.004 },
	{ name: "todo_write", weight: 0.05, errorRate: 0 },
	{ name: "web_search", weight: 0.03, errorRate: 0.087 },
	{ name: "task", weight: 0.02, errorRate: 0.03 },
];

const LANGUAGES = [
	{ ext: "ts", label: "TypeScript", weight: 0.4 },
	{ ext: "tsx", label: "TSX", weight: 0.14 },
	{ ext: "css", label: "CSS", weight: 0.12 },
	{ ext: "md", label: "Markdown", weight: 0.14 },
	{ ext: "sql", label: "SQL", weight: 0.08 },
	{ ext: "json", label: "JSON", weight: 0.07 },
	{ ext: "other", label: "other", weight: 0.05 },
];

const TASKS = [
	"cache invalidation on ledger writes",
	"flaky settlement integration test",
	"pagination for the accounts table",
	"migrate scan worker to streaming",
	"dark theme token pass",
	"retry budget for provider calls",
	"session detail drawer",
	"reduce cold start on the report route",
	"schema drift check in CI",
	"idempotency keys for refunds",
	"chart axis rounding",
	"drop the legacy report template",
];

function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

const random = mulberry32(20260811);

function between(min, max) {
	return min + random() * (max - min);
}

function intBetween(min, max) {
	return Math.floor(between(min, max + 1));
}

function pick(entries) {
	const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
	let cursor = random() * total;
	for (const entry of entries) {
		cursor -= entry.weight;
		if (cursor <= 0) return entry;
	}
	return entries[entries.length - 1];
}

function dayKey(date) {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

function emptyUsage() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 0, costUsd: 0, requests: 0 };
}

function emptyEdits() {
	return { filesTouched: 0, writes: 0, edits: 0, linesAdded: 0, linesRemoved: 0 };
}

function addUsage(target, source) {
	for (const key of Object.keys(target)) target[key] += source[key];
	return target;
}

function addEdits(target, source) {
	for (const key of Object.keys(target)) target[key] += source[key];
	return target;
}

/** Working hours with a real evening tail, so the hour histogram is not flat. */
function startHour() {
	const roll = random();
	if (roll < 0.34) return intBetween(9, 12);
	if (roll < 0.72) return intBetween(13, 18);
	if (roll < 0.92) return intBetween(19, 22);
	return intBetween(0, 2);
}

function sessionCountFor(date) {
	const weekend = date.getDay() === 0 || date.getDay() === 6;
	const roll = random();
	if (weekend) return roll < 0.45 ? 0 : roll < 0.85 ? 1 : 2;
	if (roll < 0.08) return 0;
	if (roll < 0.4) return 1;
	if (roll < 0.78) return 2;
	return intBetween(3, 4);
}

function buildSession(startDate, index) {
	const project = pick(PROJECTS);
	const wallMinutes = Math.round(between(6, 190));
	const activeMinutes = Math.max(2, Math.round(wallMinutes * between(0.42, 0.88)));
	const startedAt = new Date(startDate.getTime());
	const endedAt = new Date(startedAt.getTime() + wallMinutes * 60_000);

	const userMessages = Math.max(1, Math.round(activeMinutes / between(3.5, 9)));
	const assistantMessages = Math.round(userMessages * between(2.2, 6.4));
	const toolCalls = Math.round(assistantMessages * between(0.7, 1.9));

	const tools = [];
	let toolErrors = 0;
	let remaining = toolCalls;
	for (const [position, tool] of TOOLS.entries()) {
		const share = position === TOOLS.length - 1 ? remaining : Math.round(toolCalls * tool.weight * between(0.5, 1.6));
		const calls = Math.max(0, Math.min(remaining, share));
		remaining -= calls;
		if (calls === 0) continue;
		const errors = Math.round(calls * tool.errorRate * between(0.3, 2.1));
		toolErrors += errors;
		tools.push({ name: tool.name, calls, errors: Math.min(errors, calls), sessions: 1 });
	}
	tools.sort((a, b) => b.calls - a.calls);

	const writeCalls = tools.find((tool) => tool.name === "write")?.calls ?? 0;
	const editCalls = tools.find((tool) => tool.name === "edit")?.calls ?? 0;
	const files = buildFiles(project.cwd, writeCalls, editCalls);
	const edits = files.reduce(
		(totals, file) => {
			totals.filesTouched += 1;
			totals.writes += file.writes;
			totals.edits += file.edits;
			totals.linesAdded += file.linesAdded;
			totals.linesRemoved += file.linesRemoved;
			return totals;
		},
		emptyEdits(),
	);

	const modelUsage = buildModelUsage(assistantMessages);
	const usage = modelUsage.reduce((totals, entry) => addUsage(totals, entry.usage), emptyUsage());

	const interruptions = random() < 0.42 ? intBetween(1, Math.max(1, Math.round(assistantMessages * 0.06))) : 0;
	const errors = random() < 0.18 ? intBetween(1, 2) : 0;
	const compactions = assistantMessages > 40 && random() < 0.5 ? intBetween(1, 3) : 0;
	const named = random() < 0.78;

	const sessionId = `019f${(index + 1).toString(16).padStart(4, "0")}${Math.floor(random() * 0xffffff).toString(16).padStart(6, "0")}`;
	const projectDir = `-${project.cwd.replaceAll("/", "-")}-`;
	const stamp = `${dayKey(startedAt).replaceAll("-", "")}-${String(startedAt.getHours()).padStart(2, "0")}${String(startedAt.getMinutes()).padStart(2, "0")}`;

	return {
		sessionId,
		filePath: `${SESSION_ROOT}/${projectDir}/${stamp}_${sessionId}.jsonl`,
		name: named ? TASKS[(index + Math.floor(random() * TASKS.length)) % TASKS.length] : undefined,
		cwd: project.cwd,
		project: project.cwd.split("/").pop(),
		startedAt: startedAt.toISOString(),
		endedAt: endedAt.toISOString(),
		wallMinutes,
		activeMinutes,
		userMessages,
		assistantMessages,
		toolCalls: tools.reduce((sum, tool) => sum + tool.calls, 0),
		toolErrors,
		interruptions,
		errors,
		compactions,
		usage,
		edits,
		models: modelUsage.map((entry) => entry.key),
		tools,
		files,
		modelUsage,
	};
}

function buildFiles(cwd, writeCalls, editCalls) {
	const fileCount = Math.max(0, Math.min(writeCalls + editCalls, intBetween(0, 9)));
	const files = [];
	for (let index = 0; index < fileCount; index += 1) {
		const language = pick(LANGUAGES);
		const suffix = language.ext === "other" ? "" : `.${language.ext}`;
		const writes = index < writeCalls ? intBetween(1, 2) : 0;
		const edits = index < editCalls ? intBetween(1, 5) : 0;
		if (writes === 0 && edits === 0) continue;
		files.push({
			path: `${cwd}/src/${["core", "server", "ui", "lib", "test"][index % 5]}/module-${index + 1}${suffix}`,
			ext: language.ext,
			label: language.label,
			writes,
			edits,
			linesAdded: writes * intBetween(20, 180) + edits * intBetween(3, 40),
			linesRemoved: edits * intBetween(1, 26),
		});
	}
	return files.sort((a, b) => b.writes + b.edits - (a.writes + a.edits));
}

function buildModelUsage(assistantMessages) {
	const primary = pick(MODELS);
	const chosen = [primary];
	if (random() < 0.35) {
		const secondary = pick(MODELS);
		if (secondary.model !== primary.model) chosen.push(secondary);
	}
	const split = chosen.length === 1 ? [1] : [0.72, 0.28];
	return chosen.map((entry, index) => {
		const requests = Math.max(1, Math.round(assistantMessages * split[index]));
		const input = Math.round(requests * between(900, 4200));
		const cacheRead = Math.round(requests * between(2400, 21000) * (entry.provider === "3838-completions" ? 0.15 : 1));
		const cacheWrite = Math.round(cacheRead * between(0.03, 0.12));
		const output = Math.round(requests * between(90, 620));
		const reasoning = entry.model.includes("codex") ? Math.round(output * between(0.3, 1.4)) : 0;
		const costUsd =
			input * entry.price.input +
			output * entry.price.output +
			cacheRead * entry.price.cacheRead +
			cacheWrite * entry.price.cacheWrite;
		return {
			key: `${entry.provider}/${entry.model}`,
			provider: entry.provider,
			model: entry.model,
			api: entry.api,
			sessions: 1,
			usage: {
				input,
				output,
				cacheRead,
				cacheWrite,
				reasoning,
				totalTokens: input + output + cacheRead + reasoning,
				costUsd,
				requests,
			},
		};
	});
}

function buildEvents(session) {
	const start = Date.parse(session.startedAt);
	const span = session.wallMinutes * 60_000;
	const events = [{ at: session.startedAt, kind: "start", label: session.project }];
	const userCount = Math.min(session.userMessages, 6);
	for (let index = 0; index < userCount; index += 1) {
		events.push({
			at: new Date(start + (span * (index + 1)) / (userCount + 2)).toISOString(),
			kind: "user",
			label: TASKS[(index * 5 + session.userMessages) % TASKS.length],
		});
	}
	if (session.models.length > 1) {
		events.push({ at: new Date(start + span * 0.5).toISOString(), kind: "model_change", label: session.models[1] });
	}
	for (let index = 0; index < session.compactions; index += 1) {
		events.push({ at: new Date(start + span * (0.6 + index * 0.1)).toISOString(), kind: "compaction", label: "context summarized" });
	}
	if (session.interruptions > 0) {
		events.push({ at: new Date(start + span * 0.72).toISOString(), kind: "interrupt", label: "aborted by user" });
	}
	if (session.errors > 0) {
		events.push({ at: new Date(start + span * 0.8).toISOString(), kind: "error", label: "provider returned an error" });
	}
	events.push({ at: session.endedAt, kind: "end", label: `${session.toolCalls} tool calls` });
	return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function generateSessions() {
	const sessions = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
		const day = new Date(today.getTime() - offset * 86_400_000);
		const count = sessionCountFor(day);
		for (let index = 0; index < count; index += 1) {
			const start = new Date(day.getTime());
			start.setHours(startHour(), intBetween(0, 59), intBetween(0, 59), 0);
			if (start.getTime() > Date.now()) start.setTime(Date.now() - intBetween(5, 240) * 60_000);
			sessions.push(buildSession(start, sessions.length));
		}
	}
	return sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function accumulateDaily(sessions, start, end) {
	const byDay = new Map();
	for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
		byDay.set(dayKey(cursor), {
			date: dayKey(cursor),
			sessions: 0,
			userMessages: 0,
			activeMinutes: 0,
			tokens: 0,
			costUsd: 0,
			linesAdded: 0,
			linesRemoved: 0,
		});
	}
	for (const session of sessions) {
		const point = byDay.get(dayKey(new Date(session.startedAt)));
		if (!point) continue;
		point.sessions += 1;
		point.userMessages += session.userMessages;
		point.activeMinutes += session.activeMinutes;
		point.tokens += session.usage.totalTokens;
		point.costUsd += session.usage.costUsd;
		point.linesAdded += session.edits.linesAdded;
		point.linesRemoved += session.edits.linesRemoved;
	}
	return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function accumulateHourly(sessions) {
	const hourly = new Array(24).fill(0);
	for (const session of sessions) {
		const start = new Date(session.startedAt);
		const spanHours = Math.max(1, Math.ceil(session.wallMinutes / 60));
		for (let index = 0; index < session.userMessages; index += 1) {
			const hour = (start.getHours() + Math.floor((index / session.userMessages) * spanHours)) % 24;
			hourly[hour] += 1;
		}
	}
	return hourly;
}

function accumulateWeekday(sessions) {
	const weekday = new Array(7).fill(0);
	for (const session of sessions) {
		const day = new Date(session.startedAt).getDay();
		weekday[(day + 6) % 7] += session.userMessages;
	}
	return weekday;
}

function accumulateModels(sessions) {
	const byKey = new Map();
	for (const session of sessions) {
		for (const entry of session.modelUsage) {
			const existing = byKey.get(entry.key);
			if (!existing) {
				byKey.set(entry.key, { ...entry, usage: { ...entry.usage }, sessions: 1 });
				continue;
			}
			addUsage(existing.usage, entry.usage);
			existing.sessions += 1;
		}
	}
	return [...byKey.values()].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens);
}

function accumulateTools(sessions) {
	const byName = new Map();
	for (const session of sessions) {
		for (const tool of session.tools) {
			const existing = byName.get(tool.name);
			if (!existing) {
				byName.set(tool.name, { ...tool });
				continue;
			}
			existing.calls += tool.calls;
			existing.errors += tool.errors;
			existing.sessions += 1;
		}
	}
	return [...byName.values()].sort((a, b) => b.calls - a.calls);
}

function accumulateLanguages(sessions) {
	const byExt = new Map();
	for (const session of sessions) {
		for (const file of session.files) {
			const existing = byExt.get(file.ext);
			if (!existing) {
				byExt.set(file.ext, { ext: file.ext, label: file.label, files: 1, linesAdded: file.linesAdded, linesRemoved: file.linesRemoved });
				continue;
			}
			existing.files += 1;
			existing.linesAdded += file.linesAdded;
			existing.linesRemoved += file.linesRemoved;
		}
	}
	return [...byExt.values()].sort((a, b) => b.linesAdded - a.linesAdded);
}

function accumulateProjects(sessions) {
	const byCwd = new Map();
	for (const session of sessions) {
		let entry = byCwd.get(session.cwd);
		if (!entry) {
			entry = {
				cwd: session.cwd,
				name: session.project,
				sessions: 0,
				activeMinutes: 0,
				userMessages: 0,
				toolCalls: 0,
				usage: emptyUsage(),
				edits: emptyEdits(),
				firstAt: session.startedAt,
				lastAt: session.endedAt,
			};
			byCwd.set(session.cwd, entry);
		}
		entry.sessions += 1;
		entry.activeMinutes += session.activeMinutes;
		entry.userMessages += session.userMessages;
		entry.toolCalls += session.toolCalls;
		addUsage(entry.usage, session.usage);
		addEdits(entry.edits, session.edits);
		if (session.startedAt < entry.firstAt) entry.firstAt = session.startedAt;
		if (session.endedAt > entry.lastAt) entry.lastAt = session.endedAt;
	}
	return [...byCwd.values()].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens);
}

function streaks(daily) {
	let longest = 0;
	let running = 0;
	let current = 0;
	const todayKey = dayKey(new Date());
	const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000));
	for (const point of daily) {
		running = point.sessions > 0 ? running + 1 : 0;
		longest = Math.max(longest, running);
		if (point.date === todayKey || point.date === yesterdayKey) current = running;
	}
	const last = daily[daily.length - 1];
	if (last && last.sessions === 0 && last.date === todayKey) {
		const previous = daily[daily.length - 2];
		current = previous && previous.date === yesterdayKey && previous.sessions > 0 ? current : 0;
	}
	return { longest, current };
}

function concurrency(sessions) {
	const events = [];
	for (const session of sessions) {
		events.push({ at: Date.parse(session.startedAt), delta: 1 });
		events.push({ at: Date.parse(session.endedAt), delta: -1 });
	}
	events.sort((a, b) => a.at - b.at || a.delta - b.delta);
	let depth = 0;
	let peak = 0;
	for (const event of events) {
		depth += event.delta;
		peak = Math.max(peak, depth);
	}
	let overlapping = 0;
	for (const session of sessions) {
		const start = Date.parse(session.startedAt);
		const end = Date.parse(session.endedAt);
		const overlaps = sessions.some(
			(other) => other !== session && Date.parse(other.startedAt) < end && Date.parse(other.endedAt) > start,
		);
		if (overlaps) overlapping += 1;
	}
	return { peak, overlapping };
}

function buildSignals(totals, models, tools, projects, sessions, hourly) {
	const signals = [];
	const promptTokens = totals.usage.input + totals.usage.cacheRead;
	if (promptTokens > 0 && totals.cacheHitRate < 0.75) {
		signals.push({
			id: "cache-underused",
			severity: "notice",
			titleKey: "signal.cache-underused",
			values: { rate: `${(totals.cacheHitRate * 100).toFixed(1)}%`, threshold: "75.0%" },
			evidence: [
				{ labelKey: "ev.cacheRead", value: totals.usage.cacheRead.toLocaleString("en-US") },
				{ labelKey: "ev.promptTokens", value: promptTokens.toLocaleString("en-US") },
				{ labelKey: "ev.threshold", value: "75.0%" },
			],
		});
	}

	const worstTool = [...tools].filter((tool) => tool.calls >= 20).sort((a, b) => b.errors / b.calls - a.errors / a.calls)[0];
	if (worstTool && worstTool.errors > 0) {
		signals.push({
			id: "tool-error-spike",
			severity: "warn",
			titleKey: "signal.tool-error-spike",
			values: { tool: worstTool.name, rate: `${((worstTool.errors / worstTool.calls) * 100).toFixed(1)}%` },
			evidence: [
				{ labelKey: "ev.tool", value: worstTool.name },
				{ labelKey: "ev.errors", value: String(worstTool.errors) },
				{ labelKey: "ev.calls", value: worstTool.calls.toLocaleString("en-US") },
				{ labelKey: "ev.sessions", value: String(worstTool.sessions) },
			],
		});
	}

	if (totals.interruptions > 0 && totals.assistantMessages > 0) {
		const rate = totals.interruptions / totals.assistantMessages;
		signals.push({
			id: "interruption-rate",
			severity: rate > 0.05 ? "notice" : "info",
			titleKey: "signal.interruption-rate",
			values: { rate: `${(rate * 100).toFixed(1)}%` },
			evidence: [
				{ labelKey: "ev.interruptions", value: String(totals.interruptions) },
				{ labelKey: "ev.assistantMessages", value: totals.assistantMessages.toLocaleString("en-US") },
			],
		});
	}

	const lateMessages = [22, 23, 0, 1, 2, 3].reduce((sum, hour) => sum + hourly[hour], 0);
	const allMessages = hourly.reduce((sum, value) => sum + value, 0);
	if (allMessages > 0 && lateMessages / allMessages > 0.08) {
		signals.push({
			id: "late-night",
			severity: "info",
			titleKey: "signal.late-night",
			values: { rate: `${((lateMessages / allMessages) * 100).toFixed(1)}%` },
			evidence: [
				{ labelKey: "ev.lateMessages", value: lateMessages.toLocaleString("en-US") },
				{ labelKey: "ev.userMessages", value: allMessages.toLocaleString("en-US") },
				{ labelKey: "ev.window", value: "22:00-04:00" },
			],
		});
	}

	const topModel = models[0];
	if (topModel && totals.usage.totalTokens > 0) {
		const share = topModel.usage.totalTokens / totals.usage.totalTokens;
		signals.push({
			id: "model-concentration",
			severity: "info",
			titleKey: "signal.model-concentration",
			values: { model: topModel.key, share: `${(share * 100).toFixed(1)}%` },
			evidence: [
				{ labelKey: "ev.model", value: topModel.key },
				{ labelKey: "ev.tokens", value: topModel.usage.totalTokens.toLocaleString("en-US") },
				{ labelKey: "ev.share", value: `${(share * 100).toFixed(1)}%` },
			],
		});
	}

	const activeSorted = [...sessions].map((session) => session.activeMinutes).sort((a, b) => a - b);
	if (activeSorted.length > 0) {
		const median = activeSorted[Math.floor(activeSorted.length / 2)];
		const max = activeSorted[activeSorted.length - 1];
		signals.push({
			id: "long-sessions",
			severity: median > 45 ? "notice" : "info",
			titleKey: "signal.long-sessions",
			values: { median: `${median}m`, max: `${max}m` },
			evidence: [
				{ labelKey: "ev.median", value: `${median}m` },
				{ labelKey: "ev.max", value: `${max}m` },
				{ labelKey: "ev.sessions", value: String(activeSorted.length) },
			],
		});
	}

	if (totals.peakConcurrentSessions > 1) {
		signals.push({
			id: "concurrent-sessions",
			severity: "info",
			titleKey: "signal.concurrent-sessions",
			values: { peak: totals.peakConcurrentSessions },
			evidence: [
				{ labelKey: "ev.peak", value: String(totals.peakConcurrentSessions) },
				{ labelKey: "ev.sessions", value: String(totals.concurrentSessions) },
			],
		});
	}

	const topProject = [...projects].sort((a, b) => b.usage.costUsd - a.usage.costUsd)[0];
	if (topProject && totals.usage.costUsd > 0) {
		const share = topProject.usage.costUsd / totals.usage.costUsd;
		signals.push({
			id: "cost-concentration",
			severity: "info",
			titleKey: "signal.cost-concentration",
			values: { project: topProject.name, share: `${(share * 100).toFixed(1)}%` },
			evidence: [
				{ labelKey: "ev.project", value: topProject.name },
				{ labelKey: "ev.cost", value: `$${topProject.usage.costUsd.toFixed(2)}` },
				{ labelKey: "ev.share", value: `${(share * 100).toFixed(1)}%` },
			],
		});
	}

	return signals;
}

/** One session set backs every range, so ranges stay consistent with each other. */
let allSessions;

function sourceSessions() {
	if (!allSessions) allSessions = generateSessions();
	return allSessions;
}

function buildReport(rangeKey) {
	const all = sourceSessions();
	const windowDays = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, all: 3650 }[rangeKey] ?? 30;
	const end = new Date();
	const start = new Date(end.getTime() - windowDays * 86_400_000);
	const sessions = all.filter((session) => Date.parse(session.startedAt) >= start.getTime());

	const startDay = new Date(Math.max(start.getTime(), Date.parse(all[all.length - 1]?.startedAt ?? start.toISOString())));
	startDay.setHours(0, 0, 0, 0);
	const endDay = new Date(end);
	endDay.setHours(0, 0, 0, 0);

	const daily = accumulateDaily(sessions, startDay, endDay);
	const hourly = accumulateHourly(sessions);
	const weekday = accumulateWeekday(sessions);
	const models = accumulateModels(sessions);
	const tools = accumulateTools(sessions);
	const languages = accumulateLanguages(sessions);
	const projects = accumulateProjects(sessions);
	const { longest, current } = streaks(daily);
	const { peak, overlapping } = concurrency(sessions);

	const usage = sessions.reduce((total, session) => addUsage(total, session.usage), emptyUsage());
	const edits = sessions.reduce((total, session) => addEdits(total, session.edits), emptyEdits());
	const sum = (field) => sessions.reduce((total, session) => total + session[field], 0);
	const promptTokens = usage.input + usage.cacheRead;
	const toolCalls = sum("toolCalls");

	const totals = {
		sessions: sessions.length,
		activeDays: daily.filter((point) => point.sessions > 0).length,
		userMessages: sum("userMessages"),
		assistantMessages: sum("assistantMessages"),
		toolCalls,
		toolErrors: sum("toolErrors"),
		interruptions: sum("interruptions"),
		errors: sum("errors"),
		compactions: sum("compactions"),
		activeMinutes: sum("activeMinutes"),
		wallMinutes: sum("wallMinutes"),
		usage,
		edits,
		cacheHitRate: promptTokens > 0 ? usage.cacheRead / promptTokens : 0,
		toolErrorRate: toolCalls > 0 ? sum("toolErrors") / toolCalls : 0,
		longestStreakDays: longest,
		currentStreakDays: current,
		peakConcurrentSessions: peak,
		concurrentSessions: overlapping,
	};

	const bytes = sessions.reduce((total, session) => total + session.assistantMessages * 9_400 + 42_000, 0);
	const report = {
		generatedAt: new Date().toISOString(),
		range: { key: rangeKey, start: start.toISOString(), end: end.toISOString() },
		scan: {
			files: sessions.length + 3,
			parsed: sessions.length,
			skipped: 3,
			badLines: 2,
			bytes,
			durationMs: Math.round(180 + sessions.length * 21.4),
			cached: false,
		},
		totals,
		daily,
		hourly,
		weekday,
		models,
		tools,
		languages,
		projects,
		sessions: sessions.map(toSummary),
		signals: buildSignals(totals, models, tools, projects, sessions, hourly),
	};
	return report;
}

function toSummary(session) {
	const { tools, files, modelUsage, ...summary } = session;
	return summary;
}

function toDetail(session) {
	const languages = new Map();
	for (const file of session.files) {
		const existing = languages.get(file.ext);
		if (!existing) {
			languages.set(file.ext, { ext: file.ext, label: file.label, files: 1, linesAdded: file.linesAdded, linesRemoved: file.linesRemoved });
			continue;
		}
		existing.files += 1;
		existing.linesAdded += file.linesAdded;
		existing.linesRemoved += file.linesRemoved;
	}
	return {
		...toSummary(session),
		tools: session.tools,
		languages: [...languages.values()].sort((a, b) => b.linesAdded - a.linesAdded),
		modelUsage: session.modelUsage,
		events: buildEvents(session),
		files: session.files.map(({ ext, label, ...file }) => file),
	};
}

const reports = new Map();

function forRange(rangeKey) {
	if (!reports.has(rangeKey)) reports.set(rangeKey, buildReport(rangeKey));
	return reports.get(rangeKey);
}

export function fixtureReport(rangeKey = "30d") {
	return structuredClone(forRange(rangeKey));
}

export function fixtureSessionDetail(filePath) {
	const session = sourceSessions().find((entry) => entry.filePath === filePath);
	return session ? structuredClone(toDetail(session)) : undefined;
}

export function fixtureScan() {
	return { ...forRange("30d").scan, cached: false };
}
