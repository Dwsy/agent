const LEADING_ENV_ASSIGNMENT_PATTERN = /^((?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*)/;

export interface LeadingEnvAssignmentSplit {
	envPrefix: string;
	command: string;
}

export function splitLeadingEnvAssignments(input: string): LeadingEnvAssignmentSplit {
	const envPrefix = input.match(LEADING_ENV_ASSIGNMENT_PATTERN)?.[1] ?? "";
	return {
		envPrefix,
		command: input.slice(envPrefix.length),
	};
}
