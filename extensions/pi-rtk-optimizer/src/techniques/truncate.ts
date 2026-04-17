export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	if (maxLength < 3) {
		return "...";
	}

	return `${text.slice(0, maxLength - 3)}...`;
}
