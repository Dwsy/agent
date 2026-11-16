/**
 * Minimal terminal key decoder. Kept dependency-free so unit tests can run
 * without pi-tui; index.ts feeds raw `handleInput` chunks through parseKeys().
 */

export type KeyName =
	| "char"
	| "enter"
	| "backspace"
	| "esc"
	| "left"
	| "right"
	| "up"
	| "down"
	| "home"
	| "end"
	| "delete"
	| "unknown";

export interface KeyEvent {
	t: KeyName;
	ch?: string;
	alt?: boolean;
	shift?: boolean;
	ctrl?: boolean;
}

const FINAL_BY_TILDE: Record<number, KeyName> = {
	1: "home",
	3: "delete",
	4: "end",
	7: "home",
	8: "end",
};

const ARROW_BY_LETTER: Record<string, KeyName> = {
	A: "up",
	B: "down",
	C: "right",
	D: "left",
	H: "home",
	F: "end",
};

function withModifiers(base: KeyName, modifierParam: number | undefined): KeyEvent {
	// XTerm modifier param: 1 + (shift=1, alt=2, ctrl=4).
	const mask = (modifierParam ?? 1) - 1;
	return {
		t: base,
		alt: (mask & 2) !== 0,
		shift: (mask & 1) !== 0,
		ctrl: (mask & 4) !== 0,
	};
}

/**
 * Decode one input chunk into semantic key events.
 * A chunk may carry several keys (paste, fast typing) — callers iterate.
 */
export function parseKeys(data: string): KeyEvent[] {
	const out: KeyEvent[] = [];
	let i = 0;

	while (i < data.length) {
		const ch = data[i]!;

		if (ch === "\x1b") {
			const next = data[i + 1];
			if (next === undefined) {
				out.push({ t: "esc" });
				i += 1;
				continue;
			}
			if (next === "[") {
				const consumed = parseCsi(data, i, out);
				if (consumed > 0) {
					i += consumed;
					continue;
				}
			}
			if (next === "O") {
				const letter = data[i + 2];
				const key = letter ? ARROW_BY_LETTER[letter] : undefined;
				out.push(key ? withModifiers(key, undefined) : { t: "unknown" });
				i += 3;
				continue;
			}
			// ESC + char → Alt+char (terminal meta prefix).
			out.push({ t: "char", ch: next, alt: true });
			i += 2;
			continue;
		}

		if (ch === "\r" || ch === "\n") {
			out.push({ t: "enter" });
		} else if (ch === "\x7f" || ch === "\b") {
			out.push({ t: "backspace" });
		} else if (ch >= " ") {
			out.push({ t: "char", ch });
		}
		// Remaining control chars (tab handled as char above is fine) are dropped.
		i += 1;
	}

	return out;
}

/** Parse a CSI sequence at data[i]; returns consumed length or 0 when unknown. */
function parseCsi(data: string, i: number, out: KeyEvent[]): number {
	let j = i + 2;
	let params = "";
	while (j < data.length && /[0-9;]/.test(data[j]!)) {
		params += data[j];
		j += 1;
	}
	const final = data[j];
	if (final === undefined) return 0;
	const seqLen = j - i + 1;

	// Bracketed paste markers carry no keys of their own.
	if (params === "200" || params === "201") return seqLen;

	const nums = params.split(";").map((p) => (p === "" ? undefined : Number(p)));
	const modifierParam = nums.length > 1 ? nums[1] : undefined;

	const arrow = ARROW_BY_LETTER[final];
	if (arrow) {
		out.push(withModifiers(arrow, modifierParam));
		return seqLen;
	}
	if (final === "~") {
		const key = FINAL_BY_TILDE[nums[0] ?? -1];
		out.push(key ? withModifiers(key, modifierParam) : { t: "unknown" });
		return seqLen;
	}
	out.push({ t: "unknown" });
	return seqLen;
}
