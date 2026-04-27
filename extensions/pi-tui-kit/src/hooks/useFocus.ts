/**
 * useFocus - Manage focus across multiple focusable components
 */
import type { Focusable } from "@mariozechner/pi-tui";

export interface FocusableItem {
	component: Focusable;
	id: string;
	enabled?: () => boolean;
}

export interface UseFocusOptions {
	items: FocusableItem[];
	initialIndex?: number;
	wrap?: boolean;
	onChange?: (index: number, item: FocusableItem) => void;
}

export interface UseFocusReturn {
	focusedIndex: number;
	focusedItem: FocusableItem | undefined;
	focusNext: () => void;
	focusPrevious: () => void;
	focusTo: (index: number) => void;
	focusById: (id: string) => void;
	isFocused: (id: string) => boolean;
}

export function useFocus(options: UseFocusOptions): UseFocusReturn {
	let focusedIndex = Math.max(0, Math.min(options.initialIndex ?? 0, options.items.length - 1));
	let items = options.items;
	const wrap = options.wrap ?? true;

	// Filter out disabled items
	const getEnabledItems = (): { item: FocusableItem; originalIndex: number }[] => {
		return items
			.map((item, index) => ({ item, originalIndex: index }))
			.filter(({ item }) => item.enabled?.() !== false);
	};

	const getCurrentEnabledIndex = (): number => {
		const enabled = getEnabledItems();
		return enabled.findIndex(({ originalIndex }) => originalIndex === focusedIndex);
	};

	const updateFocus = (newIndex: number): void => {
		// Defocus all
		for (const item of items) {
			item.component.focused = false;
		}

		// Focus new
		focusedIndex = newIndex;
		const enabled = getEnabledItems();
		const enabledIndex = getCurrentEnabledIndex();

		if (enabledIndex >= 0 && enabledIndex < enabled.length) {
			enabled[enabledIndex].item.component.focused = true;
			options.onChange?.(focusedIndex, enabled[enabledIndex].item);
		}
	};

	const focusNext = (): void => {
		const enabled = getEnabledItems();
		const currentEnabledIndex = getCurrentEnabledIndex();

		if (currentEnabledIndex < 0) {
			// Current not enabled, find next enabled
			const next = enabled.find(({ originalIndex }) => originalIndex > focusedIndex);
			if (next) {
				updateFocus(next.originalIndex);
			} else if (wrap && enabled.length > 0) {
				updateFocus(enabled[0].originalIndex);
			}
			return;
		}

		if (currentEnabledIndex < enabled.length - 1) {
			updateFocus(enabled[currentEnabledIndex + 1].originalIndex);
		} else if (wrap) {
			updateFocus(enabled[0].originalIndex);
		}
	};

	const focusPrevious = (): void => {
		const enabled = getEnabledItems();
		const currentEnabledIndex = getCurrentEnabledIndex();

		if (currentEnabledIndex < 0) {
			// Current not enabled, find previous enabled
			for (let i = enabled.length - 1; i >= 0; i--) {
				if (enabled[i].originalIndex < focusedIndex) {
					updateFocus(enabled[i].originalIndex);
					return;
				}
			}
			if (wrap && enabled.length > 0) {
				updateFocus(enabled[enabled.length - 1].originalIndex);
			}
			return;
		}

		if (currentEnabledIndex > 0) {
			updateFocus(enabled[currentEnabledIndex - 1].originalIndex);
		} else if (wrap) {
			updateFocus(enabled[enabled.length - 1].originalIndex);
		}
	};

	const focusTo = (index: number): void => {
		const clamped = Math.max(0, Math.min(index, items.length - 1));
		const item = items[clamped];
		if (item && item.enabled?.() !== false) {
			updateFocus(clamped);
		}
	};

	const focusById = (id: string): void => {
		const index = items.findIndex((item) => item.id === id);
		if (index >= 0) {
			focusTo(index);
		}
	};

	const isFocused = (id: string): boolean => {
		const index = items.findIndex((item) => item.id === id);
		return index === focusedIndex;
	};

	// Initialize focus
	updateFocus(focusedIndex);

	return {
		focusedIndex,
		get focusedItem() {
			return items[focusedIndex];
		},
		focusNext,
		focusPrevious,
		focusTo,
		focusById,
		isFocused,
	};
}
