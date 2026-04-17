import { splitLeadingEnvAssignments } from "./shell-env-prefix.js";

interface ParsedPipeline {
	segments: string[];
	separators: string[];
}

interface ProducerRewritePlan {
	command: string;
	captureStderr: boolean;
}

function isTopLevelQuoteCharacter(character: string): character is '"' | "'" | "`" {
	return character === '"' || character === "'" || character === "`";
}

function parseSimpleTopLevelPipeline(command: string): ParsedPipeline | null {
	const segments: string[] = [];
	const separators: string[] = [];
	let quote: '"' | "'" | "`" | null = null;
	let escaped = false;
	let segmentStart = 0;

	for (let index = 0; index < command.length; index += 1) {
		const character = command[index] ?? "";
		const nextCharacter = command[index + 1] ?? "";
		const previousCharacter = index > 0 ? (command[index - 1] ?? "") : "";

		if (escaped) {
			escaped = false;
			continue;
		}

		if (quote !== null) {
			if (character === "\\" && quote !== "'") {
				escaped = true;
				continue;
			}
			if (character === quote) {
				quote = null;
			}
			continue;
		}

		if (character === "\\") {
			escaped = true;
			continue;
		}

		if (isTopLevelQuoteCharacter(character)) {
			quote = character;
			continue;
		}

		if (character === "|" && nextCharacter === "|") {
			return null;
		}

		if (character === "|" && previousCharacter !== ">") {
			const separatorLength = nextCharacter === "&" ? 2 : 1;
			segments.push(command.slice(segmentStart, index));
			separators.push(command.slice(index, index + separatorLength));
			segmentStart = index + separatorLength;
			if (separatorLength === 2) {
				index += 1;
			}
			continue;
		}

		if (character === "&" && nextCharacter === "&") {
			return null;
		}

		if (character === "&" && nextCharacter !== ">" && previousCharacter !== ">" && previousCharacter !== "<") {
			return null;
		}

		if (character === ";") {
			return null;
		}
	}

	if (separators.length === 0) {
		return null;
	}

	segments.push(command.slice(segmentStart));
	return { segments, separators };
}

function extractProducerRewritePlan(segment: string, firstSeparator: string): ProducerRewritePlan | null {
	const trimmed = segment.trim();
	const { envPrefix, command: commandWithOptionalRedirect } = splitLeadingEnvAssignments(trimmed);
	if (!/^rtk\s+/i.test(commandWithOptionalRedirect)) {
		return null;
	}

	const stderrMergeMatch = commandWithOptionalRedirect.match(/^(.*?)(?:\s+)?2>\s*&1\s*$/u);
	if (stderrMergeMatch) {
		const command = stderrMergeMatch[1]?.trimEnd() ?? "";
		return command ? { command: `${envPrefix}${command}`.trim(), captureStderr: true } : null;
	}

	return {
		command: `${envPrefix}${commandWithOptionalRedirect}`.trim(),
		captureStderr: firstSeparator === "|&",
	};
}

function buildBufferedPipelineCommand(
	producer: ProducerRewritePlan,
	remainder: string,
): string {
	const tempFileVariable = "__pi_rtk_pipe_tmp";
	const statusVariable = "__pi_rtk_pipe_status";
	const producerRedirect = producer.captureStderr ? `> "$${tempFileVariable}" 2>&1` : `> "$${tempFileVariable}"`;
	const cleanupTrap = `rm -f "$${tempFileVariable}"`;

	return [
		"{",
		`${tempFileVariable}="$(mktemp)" || exit $?;`,
		`${statusVariable}=0;`,
		`trap '${cleanupTrap}' EXIT HUP INT TERM;`,
		`${producer.command} ${producerRedirect};`,
		`${statusVariable}=$?;`,
		`if [ $${statusVariable} -eq 0 ]; then (${remainder}) < "$${tempFileVariable}"; ${statusVariable}=$?; fi;`,
		`exit $${statusVariable};`,
		"}",
	].join(" ");
}

export function applyRewrittenCommandShellSafetyFixups(command: string): string {
	if (process.platform !== "win32") {
		return command;
	}

	const parsedPipeline = parseSimpleTopLevelPipeline(command);
	if (!parsedPipeline) {
		return command;
	}

	const producer = extractProducerRewritePlan(parsedPipeline.segments[0] ?? "", parsedPipeline.separators[0] ?? "");
	if (!producer) {
		return command;
	}

	const remainder = parsedPipeline.segments
		.slice(1)
		.map((segment, index) => `${index === 0 ? "" : (parsedPipeline.separators[index] ?? "")}${segment}`)
		.join("")
		.trim();
	if (!remainder) {
		return command;
	}

	return buildBufferedPipelineCommand(producer, remainder);
}
