/**
 * useInput - Manage keyboard input with history and validation
 */
import type { Focusable } from "@mariozechner/pi-tui";

export interface UseInputOptions {
	initialValue?: string;
	placeholder?: string;
	password?: boolean;
	multiline?: boolean;
	validate?: (value: string) => string | undefined; // Returns error message if invalid
	onSubmit?: (value: string) => void;
	onChange?: (value: string) => void;
	history?: string[];
	maxLength?: number;
}

export interface UseInputReturn extends Focusable {
	value: string;
	error: string | undefined;
	cursor: number;
	historyIndex: number;

	// Actions
	setValue: (value: string) => void;
	insert: (text: string) => void;
	deleteChar: () => void;
	backspace: () => void;
	moveCursor: (delta: number) => void;
	moveToStart: () => void;
	moveToEnd: () => void;
	historyPrev: () => void;
	historyNext: () => void;
	clear: () => void;
	submit: () => boolean;

	// For rendering
	getDisplayValue: () => string;
}

export function useInput(options: UseInputOptions = {}): UseInputReturn {
	let value = options.initialValue ?? "";
	let cursor = value.length;
	let error: string | undefined;
	let focused = false;
	let history = options.history ?? [];
	let historyIndex = -1;
	let savedInput = "";

	const maxLength = options.maxLength;
	const validate = options.validate;
	const onSubmit = options.onSubmit;
	const onChange = options.onChange;

	const checkValidation = (): void => {
		error = validate?.(value);
	};

	const triggerChange = (): void => {
		checkValidation();
		onChange?.(value);
	};

	return {
		get focused() {
			return focused;
		},
		set focused(val) {
			focused = val;
		},

		get value() {
			return value;
		},

		get error() {
			return error;
		},

		get cursor() {
			return cursor;
		},

		get historyIndex() {
			return historyIndex;
		},

		setValue(newValue: string): void {
			value = newValue;
			cursor = value.length;
			triggerChange();
		},

		insert(text: string): void {
			if (maxLength && value.length + text.length > maxLength) {
				text = text.slice(0, maxLength - value.length);
			}
			value = value.slice(0, cursor) + text + value.slice(cursor);
			cursor += text.length;
			triggerChange();
		},

		deleteChar(): void {
			if (cursor < value.length) {
				value = value.slice(0, cursor) + value.slice(cursor + 1);
				triggerChange();
			}
		},

		backspace(): void {
			if (cursor > 0) {
				value = value.slice(0, cursor - 1) + value.slice(cursor);
				cursor--;
				triggerChange();
			}
		},

		moveCursor(delta: number): void {
			cursor = Math.max(0, Math.min(cursor + delta, value.length));
		},

		moveToStart(): void {
			cursor = 0;
		},

		moveToEnd(): void {
			cursor = value.length;
		},

		historyPrev(): void {
			if (historyIndex === -1) {
				savedInput = value;
			}
			if (historyIndex < history.length - 1) {
				historyIndex++;
				value = history[history.length - 1 - historyIndex];
				cursor = value.length;
				triggerChange();
			}
		},

		historyNext(): void {
			if (historyIndex > 0) {
				historyIndex--;
				value = history[history.length - 1 - historyIndex];
				cursor = value.length;
				triggerChange();
			} else if (historyIndex === 0) {
				historyIndex = -1;
				value = savedInput;
				cursor = value.length;
				triggerChange();
			}
		},

		clear(): void {
			value = "";
			cursor = 0;
			error = undefined;
			triggerChange();
		},

		submit(): boolean {
			checkValidation();
			if (!error && value.trim()) {
				// Add to history if not duplicate of last
				if (history.length === 0 || history[history.length - 1] !== value) {
					history.push(value);
					if (history.length > 100) {
						history.shift();
					}
				}
				historyIndex = -1;
				onSubmit?.(value);
				return true;
			}
			return false;
		},

		getDisplayValue(): string {
			if (options.password) {
				return "•".repeat(value.length);
			}
			return value;
		},
	};
}
