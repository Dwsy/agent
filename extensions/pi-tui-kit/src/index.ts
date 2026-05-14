/**
 * pi-tui-kit - A high-level TUI component library for Pi
 *
 * Inspired by Ratatui, Blessed, and modern UI libraries
 * Built on top of @earendil-works/pi-tui
 *
 * Features:
 * - ✓ Safe width calculations (ANSI-aware)
 * - ✓ Composable components
 * - ✓ Theming support
 * - ✓ Powerline-style segments
 * - ✓ Interactive widgets
 */

// Utils
export {
	visibleWidth,
	truncateToWidth,
	safeLine,
	buildLine,
	center,
	rightAlign,
	leftAlign,
} from "./utils/text.js";

export {
	Borders,
	BorderStyle,
	renderBox,
	renderLine,
	type BoxOptions as BorderBoxOptions,
} from "./utils/border.js";

export {
	DefaultTheme,
	NoColorTheme,
	createTheme,
	ansi,
	type Theme,
	type ColorFunction,
} from "./utils/style.js";

// Core components - Types only exports
export type {
	BoxOptions as ContainerBoxOptions,
} from "./core/Box.js";

export type {
	TextAlign,
	TextOptions,
} from "./core/Text.js";

export type {
	SpacerOptions,
} from "./core/Spacer.js";

export type {
	FlexChild,
	FlexAlign,
	FlexDirection,
	FlexOptions,
} from "./core/Flex.js";

export type {
	StackOptions,
} from "./core/Stack.js";

export type {
	SegmentOptions,
	PowerlineOptions,
} from "./core/Segment.js";

// Core components - Value exports
export { Box } from "./core/Box.js";
export { Text } from "./core/Text.js";
export { Spacer } from "./core/Spacer.js";
export { Flex } from "./core/Flex.js";
export { Stack } from "./core/Stack.js";
export { Segment, Powerline } from "./core/Segment.js";

// Widgets - Types only exports
export type {
	PanelOptions,
} from "./widgets/Panel.js";

export type {
	ButtonOptions,
} from "./widgets/Button.js";

export type {
	ListItem,
	ListOptions,
} from "./widgets/List.js";

export type {
	InputOptions,
} from "./widgets/Input.js";

export type {
	DialogAction,
	DialogOptions,
} from "./widgets/Dialog.js";

export type {
	TabItem,
	TabsOptions,
} from "./widgets/Tabs.js";

export type {
	ProgressBarOptions,
	ProgressStyle,
	StepProgressOptions,
} from "./widgets/ProgressBar.js";

export type {
	ModalOptions,
} from "./widgets/Modal.js";

export type {
	ToastType,
	ToastOptions,
} from "./widgets/Toast.js";

export type {
	TreeNode,
	TreeOptions,
} from "./widgets/Tree.js";

export type {
	TableColumn,
	ColumnAlign,
	TableOptions,
} from "./widgets/Table.js";

// Widgets - Value exports
export { Panel } from "./widgets/Panel.js";
export { Button } from "./widgets/Button.js";
export { List } from "./widgets/List.js";
export { Input } from "./widgets/Input.js";
export { Dialog } from "./widgets/Dialog.js";
export { Tabs } from "./widgets/Tabs.js";
export { ProgressBar, StepProgress } from "./widgets/ProgressBar.js";
export { Modal } from "./widgets/Modal.js";
export { Toast } from "./widgets/Toast.js";
export { Tree } from "./widgets/Tree.js";
export { Table } from "./widgets/Table.js";

// Hooks - Types only exports
export type {
	UseSelectOptions,
	UseSelectReturn,
} from "./hooks/useSelect.js";

export type {
	UseFocusOptions,
	UseFocusReturn,
	FocusableItem,
} from "./hooks/useFocus.js";

export type {
	UseInputOptions,
	UseInputReturn,
} from "./hooks/useInput.js";

// Hooks - Value exports
export { useState, useCallback, clearState } from "./hooks/useState.js";
export { useSelect } from "./hooks/useSelect.js";
export { useFocus } from "./hooks/useFocus.js";
export { useInput } from "./hooks/useInput.js";

// Examples
export { SettingsPanelComponent, showSettingsPanel } from "./examples/settings-panel.js";

// Re-export useful types from pi-tui
export type { Component, Container, Focusable } from "@earendil-works/pi-tui";

/**
 * Quick start:
 *
 * ```typescript
 * import { Panel, List, Button, DefaultTheme, Borders } from "pi-tui-kit";
 *
 * const panel = new Panel({
 *   title: "My App",
 *   border: Borders.rounded,
 *   theme: DefaultTheme
 * });
 *
 * const list = new List({
 *   items: [
 *     { id: "1", label: "Option 1" },
 *     { id: "2", label: "Option 2" },
 *   ],
 *   onSelect: (item) => console.log(item.label)
 * });
 *
 * panel.addChild(list);
 * ```
 */
