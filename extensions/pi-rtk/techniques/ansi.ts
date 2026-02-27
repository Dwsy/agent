export function stripAnsi(text: string): string {
	// eslint-disable-next-line no-control-regex
	return (
		text
			// Standard ANSI escape sequences
			.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
			// OSC sequences
			.replace(/\x1b\][0-9;]*(?:\x07|\x1b\\)/g, "")
			// Other escape sequences
			.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
	);
}

export function stripAnsiFast(text: string): string {
	if (!text.includes("\x1b")) {
		return text;
	}
	return stripAnsi(text);
}
