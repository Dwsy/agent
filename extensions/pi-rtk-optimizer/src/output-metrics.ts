export interface OutputMetricRecord {
	timestamp: string;
	tool: string;
	techniques: string;
	originalChars: number;
	filteredChars: number;
	savingsPercent: number;
}

const outputMetrics: OutputMetricRecord[] = [];

export function trackOutputSavings(
	original: string,
	filtered: string,
	tool: string,
	techniques: string[],
): OutputMetricRecord {
	const originalChars = original.length;
	const filteredChars = filtered.length;
	const savingsPercent =
		originalChars > 0 ? Math.round((((originalChars - filteredChars) / originalChars) * 100) * 100) / 100 : 0;

	const record: OutputMetricRecord = {
		timestamp: new Date().toISOString(),
		tool,
		techniques: techniques.join(",") || "none",
		originalChars,
		filteredChars,
		savingsPercent,
	};

	outputMetrics.push(record);
	return record;
}

export function clearOutputMetrics(): void {
	outputMetrics.length = 0;
}

export function getOutputMetricsSummary(): string {
	if (outputMetrics.length === 0) {
		return "RTK output compaction metrics: no data yet.";
	}

	const totalOriginal = outputMetrics.reduce((sum, metric) => sum + metric.originalChars, 0);
	const totalFiltered = outputMetrics.reduce((sum, metric) => sum + metric.filteredChars, 0);
	const totalSaved = totalOriginal - totalFiltered;
	const savingsPercent = totalOriginal > 0 ? (totalSaved / totalOriginal) * 100 : 0;

	const byTool = new Map<string, { count: number; originalChars: number; filteredChars: number }>();
	for (const metric of outputMetrics) {
		const existing = byTool.get(metric.tool) ?? { count: 0, originalChars: 0, filteredChars: 0 };
		existing.count += 1;
		existing.originalChars += metric.originalChars;
		existing.filteredChars += metric.filteredChars;
		byTool.set(metric.tool, existing);
	}

	let result = "RTK output compaction metrics\n";
	result += `calls=${outputMetrics.length}, saved=${totalSaved.toLocaleString()} chars (${savingsPercent.toFixed(1)}%)\n`;

	for (const [tool, stats] of byTool.entries()) {
		const toolSaved = stats.originalChars - stats.filteredChars;
		const toolSavingsPercent = stats.originalChars > 0 ? (toolSaved / stats.originalChars) * 100 : 0;
		result += `- ${tool}: ${stats.count} calls, saved ${toolSaved.toLocaleString()} chars (${toolSavingsPercent.toFixed(1)}%)\n`;
	}

	return result.trimEnd();
}
