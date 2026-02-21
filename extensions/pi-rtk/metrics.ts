export interface MetricRecord {
	timestamp: string;
	tool: string;
	technique: string;
	originalChars: number;
	filteredChars: number;
	savingsPercent: number;
}

const sessionMetrics: MetricRecord[] = [];

export function trackSavings(
	original: string,
	filtered: string,
	tool: string,
	technique: string
): MetricRecord {
	const originalChars = original.length;
	const filteredChars = filtered.length;
	const savingsPercent =
		originalChars > 0
			? Math.round(((originalChars - filteredChars) / originalChars) * 100 * 100) / 100
			: 0;

	const record: MetricRecord = {
		timestamp: new Date().toISOString(),
		tool,
		technique,
		originalChars,
		filteredChars,
		savingsPercent,
	};

	sessionMetrics.push(record);
	return record;
}

export function getSessionMetrics(): MetricRecord[] {
	return [...sessionMetrics];
}

export function clearMetrics(): void {
	sessionMetrics.length = 0;
}

function progressBar(percent: number, width = 24): string {
	const filled = Math.round((percent / 100) * width);
	const empty = width - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent.toFixed(1)}%`;
}

function col(s: string, width: number): string {
	return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

export function getMetricsSummary(): string {
	if (sessionMetrics.length === 0) {
		return "No metrics recorded yet";
	}

	const totalOriginal = sessionMetrics.reduce((sum, m) => sum + m.originalChars, 0);
	const totalFiltered = sessionMetrics.reduce((sum, m) => sum + m.filteredChars, 0);
	const totalSaved = totalOriginal - totalFiltered;
	const overallPct = totalOriginal > 0 ? (totalSaved / totalOriginal) * 100 : 0;

	const byTool = sessionMetrics.reduce((acc, m) => {
		if (!acc[m.tool]) {
			acc[m.tool] = { count: 0, originalChars: 0, filteredChars: 0 };
		}
		acc[m.tool].count++;
		acc[m.tool].originalChars += m.originalChars;
		acc[m.tool].filteredChars += m.filteredChars;
		return acc;
	}, {} as Record<string, { count: number; originalChars: number; filteredChars: number }>);

	const W = 54;
	const bar = "─".repeat(W);

	let s = `\n`;
	s += `  RTK Token Savings\n`;
	s += `  ${"═".repeat(W)}\n`;
	s += `  Overall  ${progressBar(overallPct, 28)}\n`;
	s += `  ${bar}\n`;
	s += `  ${col("Metric", 22)} ${col("Value", 16)} Notes\n`;
	s += `  ${bar}\n`;
	s += `  ${col("Total calls", 22)} ${col(sessionMetrics.length.toString(), 16)}\n`;
	s += `  ${col("Original chars", 22)} ${col(totalOriginal.toLocaleString(), 16)}\n`;
	s += `  ${col("Filtered chars", 22)} ${col(totalFiltered.toLocaleString(), 16)} ${totalSaved.toLocaleString()} saved\n`;
	s += `  ${bar}\n`;

	s += `\n  By tool:\n`;
	s += `  ${col("Tool", 10)} ${col("Calls", 8)} ${col("Original", 12)} ${col("Filtered", 12)}  Savings\n`;
	s += `  ${"─".repeat(62)}\n`;
	for (const [tool, data] of Object.entries(byTool)) {
		const pct = data.originalChars > 0 ? (1 - data.filteredChars / data.originalChars) * 100 : 0;
		s += `  ${col(tool, 10)} ${col(data.count.toString(), 8)} ${col(data.originalChars.toLocaleString(), 12)} ${col(data.filteredChars.toLocaleString(), 12)}  ${progressBar(pct, 16)}\n`;
	}
	s += `  ${"─".repeat(62)}\n`;

	return s;
}

export function getLastMetrics(n: number): MetricRecord[] {
	return sessionMetrics.slice(-n);
}
