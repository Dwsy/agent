/**
 * useState - Minimal state hook for TUI components
 * Simplified React-like state management
 */

export type Setter<T> = (value: T | ((prev: T) => T)) => void;

export interface UseStateReturn<T> {
	get: () => T;
	set: Setter<T>;
}

class StateCell<T> {
	private value: T;
	private listeners: Set<(value: T) => void> = new Set();

	constructor(initialValue: T) {
		this.value = initialValue;
	}

	get(): T {
		return this.value;
	}

	set(next: T | ((prev: T) => T)): void {
		const prev = this.value;
		this.value = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
		if (this.value !== prev) {
			Array.from(this.listeners).forEach((listener) => {
				listener(this.value);
			});
		}
	}

	subscribe(listener: (value: T) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

const stateRegistry = new Map<string, StateCell<unknown>>();

export function useState<T>(initialValue: T, key?: string): [T, Setter<T>] {
	if (key) {
		let cell = stateRegistry.get(key) as StateCell<T> | undefined;
		if (!cell) {
			cell = new StateCell(initialValue);
			stateRegistry.set(key, cell as StateCell<unknown>);
		}
		return [cell.get(), (v) => cell!.set(v)];
	}

	// Local state (no key) - create new cell each time
	const cell = new StateCell(initialValue);
	return [cell.get(), (v) => cell.set(v)];
}

export function useCallback<T extends (...args: unknown[]) => unknown>(
	fn: T,
	deps: unknown[]
): T {
	// Simplified - in real implementation would cache based on deps
	return fn;
}

export function clearState(key?: string): void {
	if (key) {
		stateRegistry.delete(key);
	} else {
		stateRegistry.clear();
	}
}
