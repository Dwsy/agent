/**
 * useSelect - Hook for managing selection state
 */
import { useState, useCallback } from "./useState.js";

export interface UseSelectOptions<T> {
	items: T[];
	initialIndex?: number;
	maxVisible?: number;
	getId?: (item: T) => string;
	getLabel?: (item: T) => string;
}

export interface UseSelectReturn<T> {
	selectedIndex: number;
	selectedItem: T | undefined;
	scrollOffset: number;
	setSelectedIndex: (index: number) => void;
	moveUp: () => void;
	moveDown: () => void;
	movePageUp: (pageSize: number) => void;
	movePageDown: (pageSize: number) => void;
	moveToStart: () => void;
	moveToEnd: () => void;
	items: { item: T; index: number }[];
}

export function useSelect<T>(options: UseSelectOptions<T>): UseSelectReturn<T> {
	const { items, initialIndex = 0, maxVisible = 10 } = options;

	const [selectedIndex, setSelectedIndexState] = useState(
		Math.max(0, Math.min(initialIndex, items.length - 1))
	);
	const [scrollOffset, setScrollOffset] = useState(0);

	const setSelectedIndex = useCallback((index: number) => {
		const clamped = Math.max(0, Math.min(index, items.length - 1));
		setSelectedIndexState(clamped);
	}, [items.length]);

	const moveUp = useCallback(() => {
		setSelectedIndex(selectedIndex - 1);
	}, [selectedIndex, setSelectedIndex]);

	const moveDown = useCallback(() => {
		setSelectedIndex(selectedIndex + 1);
	}, [selectedIndex, setSelectedIndex]);

	const movePageUp = useCallback((pageSize: number) => {
		setSelectedIndex(Math.max(0, selectedIndex - pageSize));
	}, [selectedIndex, setSelectedIndex]);

	const movePageDown = useCallback((pageSize: number) => {
		setSelectedIndex(Math.min(items.length - 1, selectedIndex + pageSize));
	}, [items.length, selectedIndex, setSelectedIndex]);

	const moveToStart = useCallback(() => {
		setSelectedIndex(0);
	}, [setSelectedIndex]);

	const moveToEnd = useCallback(() => {
		setSelectedIndex(items.length - 1);
	}, [items.length, setSelectedIndex]);

	// Auto-adjust scroll offset
	const scrollWindow = Math.min(maxVisible, items.length);
	if (selectedIndex < scrollOffset) {
		setScrollOffset(selectedIndex);
	} else if (selectedIndex >= scrollOffset + scrollWindow) {
		setScrollOffset(selectedIndex - scrollWindow + 1);
	}

	const effectiveItems = items.map((item, index) => ({ item, index }));

	return {
		selectedIndex,
		selectedItem: items[selectedIndex],
		scrollOffset,
		setSelectedIndex,
		moveUp,
		moveDown,
		movePageUp,
		movePageDown,
		moveToStart,
		moveToEnd,
		items: effectiveItems,
	};
}
