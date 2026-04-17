export function stripAnsi(text: string): string {
	return text
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/\x1b\][0-9;]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

export function stripAnsiFast(text: string): string {
	if (!text.includes("\x1b")) {
		return text;
	}
	return stripAnsi(text);
}
