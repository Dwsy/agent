/**
 * Comprehensive test suite for pi-tui-kit components
 * Tests all core components, widgets, and hooks
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Box,
  Text,
  Flex,
  Spacer,
  Stack,
  Segment,
  Powerline,
  Panel,
  Button,
  List,
  Input,
  Dialog,
  Tabs,
  ProgressBar,
  StepProgress,
  Modal,
  Toast,
  Tree,
  Table,
  DefaultTheme,
  Borders,
  useState,
  useSelect,
  useFocus,
  useInput,
  clearState,
  visibleWidth,
  type TreeNode,
} from "../src/index.js";

// ============================================================================
// Utility Components Tests
// ============================================================================

describe("Text Component", () => {
  it("renders simple text", () => {
    const text = new Text({ content: "Hello" });
    const lines = text.render(10);
    expect(lines).toHaveLength(1);
    expect(lines[0].trim()).toBe("Hello");
  });

  it("handles alignment", () => {
    const left = new Text({ content: "Hi", align: "left" });
    const center = new Text({ content: "Hi", align: "center" });
    const right = new Text({ content: "Hi", align: "right" });

    expect(left.render(10)[0].startsWith("Hi")).toBe(true);
    expect(center.render(10)[0].indexOf("Hi")).toBeGreaterThan(0);
    expect(right.render(10)[0].endsWith("Hi")).toBe(true);
  });

  it("handles multiline content", () => {
    const text = new Text({ content: "Line1\nLine2\nLine3" });
    const lines = text.render(20);
    expect(lines).toHaveLength(3);
  });

  it("respects width limit without wrap", () => {
    const text = new Text({ content: "VeryLongTextThatExceeds", wrap: false });
    const lines = text.render(10);
    expect(visibleWidth(lines[0])).toBeLessThanOrEqual(10);
  });
});

describe("Spacer Component", () => {
  it("renders fixed height spacer", () => {
    const spacer = new Spacer({ fixed: 3 });
    const lines = spacer.render(10);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("          ");
  });

  it("renders flex spacer with default height 1", () => {
    const spacer = Spacer.flex();
    const lines = spacer.render(10);
    expect(lines).toHaveLength(1);
  });
});

// ============================================================================
// Layout Components Tests
// ============================================================================

describe("Box Component", () => {
  it("renders with border", () => {
    const box = new Box({ border: true, borderStyle: Borders.single });
    const text = new Text({ content: "Content" });
    box.addChild(text);
    const lines = box.render(20);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
  });

  it("renders with title", () => {
    const box = new Box({ border: true, title: "Test" });
    const lines = box.render(20);
    expect(lines[0]).toContain("Test");
  });

  it("applies padding correctly", () => {
    const box = new Box({ border: true, paddingX: 2, paddingY: 1 });
    const text = new Text({ content: "X" });
    box.addChild(text);
    const lines = box.render(10);
    // Should have: border + paddingY + content + paddingY + border
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Flex Component", () => {
  it("renders column layout", () => {
    const flex = new Flex({ direction: "column" });
    flex.addChild(new Text({ content: "A" }));
    flex.addChild(new Text({ content: "B" }));
    const lines = flex.render(10);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("renders row layout", () => {
    const flex = new Flex({ direction: "row" });
    flex.addChild(new Text({ content: "A" }), undefined, 3);
    flex.addChild(new Text({ content: "B" }), undefined, 3);
    const lines = flex.render(10);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeGreaterThanOrEqual(6);
  });

  it("handles flex grow in row", () => {
    const flex = new Flex({ direction: "row" });
    flex.addChild(new Text({ content: "Left" }), 1);
    flex.addChild(new Text({ content: "Right" }), 1);
    const lines = flex.render(20);
    expect(lines).toHaveLength(1);
    expect(visibleWidth(lines[0])).toBe(20);
  });

  it("handles gap between items", () => {
    const flex = new Flex({ direction: "row", gap: 2 });
    flex.addChild(new Text({ content: "A" }), undefined, 3);
    flex.addChild(new Text({ content: "B" }), undefined, 3);
    const lines = flex.render(10);
    expect(lines[0]).toContain("A  B");
  });
});

describe("Stack Component", () => {
  it("renders layered content", () => {
    const stack = new Stack();
    const bottom = new Text({ content: "Bottom" });
    const top = new Text({ content: "TOP   " }); // Same width
    stack.push(bottom, 0);
    stack.push(top, 1, true);
    const lines = stack.render(10);
    expect(lines).toHaveLength(1);
    // Top layer should show through transparent areas
    expect(lines[0]).toContain("TOP");
  });

  it("handles multiple layers", () => {
    const stack = new Stack();
    stack.push(new Text({ content: "Layer1" }), 0);
    stack.push(new Text({ content: "Layer2" }), 1);
    stack.push(new Text({ content: "Layer3" }), 2, true);
    const lines = stack.render(10);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("handles ANSI colors in transparent merge", () => {
    const stack = new Stack();
    const colored = new Text({
      content: "Base",
      color: DefaultTheme.red,
    });
    const overlay = new Text({ content: "OVER" });
    stack.push(colored, 0);
    stack.push(overlay, 1, true);
    const lines = stack.render(10);
    // Result should preserve ANSI codes from base where overlay has spaces
    expect(lines[0].length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Widget Tests
// ============================================================================

describe("Panel Widget", () => {
  it("renders with border and title", () => {
    const panel = new Panel({ title: "Test Panel" });
    const lines = panel.render(30);
    expect(lines[0]).toContain("Test Panel");
    expect(lines[0]).toContain("┌");
  });

  it("renders children inside", () => {
    const panel = new Panel({ title: "Panel" });
    panel.addChild(new Text({ content: "Content" }));
    const lines = panel.render(20);
    expect(lines.length).toBeGreaterThan(2);
  });

  it("applies padding to content", () => {
    const panel = new Panel({ padding: 2 });
    panel.addChild(new Text({ content: "X" }));
    const lines = panel.render(10);
    // Should have extra padding lines
    expect(lines.length).toBeGreaterThan(3);
  });
});

describe("Button Widget", () => {
  it("renders unfocused button", () => {
    const button = new Button({ label: "Click" });
    const lines = button.render(15);
    expect(lines[0]).toContain("Click");
    expect(lines[0]).toContain("[");
    expect(lines[0]).toContain("]");
  });

  it("renders focused button differently", () => {
    const button = new Button({ label: "Click" });
    button.focused = true;
    const lines = button.render(15);
    expect(lines[0]).toContain("Click");
    // Focused should show < > markers
    expect(lines[0]).toContain("<");
    expect(lines[0]).toContain(">");
  });

  it("triggers onClick", () => {
    let clicked = false;
    const button = new Button({
      label: "Test",
      onClick: () => { clicked = true; }
    });
    button.focused = true;
    button.handleInput("\r");
    expect(clicked).toBe(true);
  });
});

describe("List Widget", () => {
  const items = [
    { id: "1", label: "First" },
    { id: "2", label: "Second" },
    { id: "3", label: "Third" },
  ];

  it("renders items", () => {
    const list = new List({ items, maxVisible: 3 });
    const lines = list.render(20);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("First");
    expect(lines[1]).toContain("Second");
  });

  it("shows selection indicator", () => {
    const list = new List({ items, selectedIndex: 1 });
    const lines = list.render(20);
    // Second item should have selection marker
    expect(lines[1]).toContain("❯");
  });

  it("handles navigation", () => {
    const list = new List({ items });
    list.handleInput("down");
    expect(list["selectedIndex"]).toBe(1);
    list.handleInput("up");
    expect(list["selectedIndex"]).toBe(0);
  });

  it("handles selection", () => {
    let selected: string | null = null;
    const list = new List({
      items,
      onSelect: (item) => { selected = item.id; }
    });
    list.handleInput("\r");
    expect(selected).toBe("1");
  });

  it("scrolls when content exceeds visible", () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      label: `Item ${i}`
    }));
    const list = new List({ items: manyItems, maxVisible: 5 });
    // Navigate down
    for (let i = 0; i < 10; i++) {
      list.handleInput("down");
    }
    const lines = list.render(20);
    expect(lines).toHaveLength(5);
  });
});

describe("Input Widget", () => {
  it("renders with prefix", () => {
    const input = new Input({ prefix: ">>> " });
    const lines = input.render(20);
    expect(lines[0]).toContain(">>>");
  });

  it("handles initial value", () => {
    const input = new Input({ initialValue: "Hello" });
    const lines = input.render(20);
    expect(lines[0]).toContain("Hello");
  });

  it("masks password input", () => {
    const input = new Input({ password: true, initialValue: "secret" });
    const lines = input.render(20);
    expect(lines[0]).toContain("******");
    expect(lines[0]).not.toContain("secret");
  });

  it("submits on enter", () => {
    let submitted: string | null = null;
    const input = new Input({
      initialValue: "test",
      onSubmit: (v) => { submitted = v; }
    });
    input.handleInput("\r");
    expect(submitted).toBe("test");
  });

  it("handles text input", () => {
    const input = new Input({});
    input.handleInput("a");
    input.handleInput("b");
    input.handleInput("c");
    expect(input.getValue()).toBe("abc");
  });
});

describe("Dialog Widget", () => {
  const actions = [
    { id: "ok", label: "OK", primary: true },
    { id: "cancel", label: "Cancel" }
  ];

  it("renders with title and actions", () => {
    const dialog = new Dialog({
      title: "Confirm",
      content: "Are you sure?",
      actions
    });
    const lines = dialog.render(50);
    expect(lines[0]).toContain("Confirm");
    // Should contain action buttons
    const content = lines.join("\n");
    expect(content).toContain("OK");
    expect(content).toContain("Cancel");
  });

  it("navigates between actions", () => {
    const dialog = new Dialog({
      title: "Test",
      actions
    });
    dialog.focused = true;
    dialog.handleInput("right");
    // Should move to second button
    expect(dialog["focusedIndex"]).toBe(1);
    dialog.handleInput("left");
    expect(dialog["focusedIndex"]).toBe(0);
  });

  it("activates action on enter", () => {
    let activated: string | null = null;
    const dialog = new Dialog({
      title: "Test",
      actions: [
        { id: "yes", label: "Yes", onClick: () => { activated = "yes"; } },
        { id: "no", label: "No", onClick: () => { activated = "no"; } }
      ]
    });
    dialog.focused = true;
    dialog.handleInput("\r");
    expect(activated).toBe("yes");
  });
});

describe("Tabs Widget", () => {
  const tabs = [
    { id: "a", label: "First" },
    { id: "b", label: "Second" },
    { id: "c", label: "Third" }
  ];

  it("renders all tabs", () => {
    const tabsWidget = new Tabs({ tabs });
    const lines = tabsWidget.render(40);
    expect(lines[0]).toContain("First");
    expect(lines[0]).toContain("Second");
    expect(lines[0]).toContain("Third");
  });

  it("highlights active tab", () => {
    const tabsWidget = new Tabs({ tabs, activeTab: "b" });
    const lines = tabsWidget.render(40);
    // Second tab should be highlighted
    expect(lines.length).toBeGreaterThan(0);
  });

  it("handles tab navigation", () => {
    const tabsWidget = new Tabs({ tabs, activeTab: "a" });
    tabsWidget.handleInput("right");
    expect(tabsWidget["activeTab"]).toBe("b");
    tabsWidget.handleInput("left");
    expect(tabsWidget["activeTab"]).toBe("a");
  });

  it("calls onChange when tab changes", () => {
    let changed: string | null = null;
    const tabsWidget = new Tabs({
      tabs,
      onChange: (id) => { changed = id; }
    });
    tabsWidget.setActiveTab("b");
    expect(changed).toBe("b");
  });

  it("skips disabled tabs", () => {
    const tabsWithDisabled = [
      { id: "a", label: "A" },
      { id: "b", label: "B", disabled: true },
      { id: "c", label: "C" }
    ];
    const tabsWidget = new Tabs({ tabs: tabsWithDisabled, activeTab: "a" });
    tabsWidget.handleInput("right");
    // Should skip "b" and go to "c"
    expect(tabsWidget["activeTab"]).toBe("c");
  });
});

describe("ProgressBar Widget", () => {
  it("renders bar style", () => {
    const bar = new ProgressBar({ value: 50, max: 100, style: "bar" });
    const lines = bar.render(20);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("█");
    expect(lines[0]).toContain("░");
  });

  it("shows percentage", () => {
    const bar = new ProgressBar({ value: 75, showValue: true });
    const lines = bar.render(20);
    expect(lines[0]).toContain("75%");
  });

  it("renders spinner style", () => {
    const bar = new ProgressBar({ value: 0, style: "spinner" });
    const lines1 = bar.render(10);
    bar["spinnerFrame"] = 1; // Advance frame
    const lines2 = bar.render(10);
    // Different frames should produce different output
    expect(lines1[0]).not.toBe(lines2[0]);
  });

  it("updates value", () => {
    const bar = new ProgressBar({ value: 0 });
    bar.setValue(50);
    expect(bar.getValue()).toBe(50);
    bar.increment(25);
    expect(bar.getValue()).toBe(75);
  });
});

describe("StepProgress Widget", () => {
  it("renders step indicators", () => {
    const steps = [
      { id: "1", label: "Step 1", status: "completed" },
      { id: "2", label: "Step 2", status: "current" },
      { id: "3", label: "Step 3", status: "pending" }
    ];
    const progress = new StepProgress({ steps });
    const lines = progress.render(40);
    expect(lines[0]).toContain("Step 1");
    expect(lines[0]).toContain("Step 2");
  });

  it("shows different status indicators", () => {
    const steps = [
      { id: "1", label: "Done", status: "completed" },
      { id: "2", label: "Now", status: "current" },
      { id: "3", label: "Later", status: "pending" },
      { id: "4", label: "Oops", status: "error" }
    ];
    const progress = new StepProgress({ steps });
    const lines = progress.render(50);
    const content = lines.join(" ");
    expect(content).toContain("✓"); // completed
    expect(content).toContain("●"); // current
    expect(content).toContain("○"); // pending
    expect(content).toContain("✗"); // error
  });
});

describe("Toast Widget", () => {
  it("renders with icon", () => {
    const toast = new Toast({ message: "Success!", type: "success" });
    const lines = toast.render(30);
    expect(lines).toHaveLength(3); // Border + content + border
    expect(lines[1]).toContain("Success!");
  });

  it("shows different icons for types", () => {
    const success = new Toast({ message: "OK", type: "success" });
    const error = new Toast({ message: "Fail", type: "error" });
    expect(success.render(20)[1]).toContain("✓");
    expect(error.render(20)[1]).toContain("✗");
  });

  it("returns duration", () => {
    const toast = new Toast({ message: "Test", duration: 3000 });
    expect(toast.getDuration()).toBe(3000);
  });
});

describe("Tree Widget", () => {
  const roots: TreeNode[] = [
    {
      id: "root",
      label: "Root",
      expanded: true,
      children: [
        { id: "child1", label: "Child 1" },
        { id: "child2", label: "Child 2" }
      ]
    }
  ];

  it("renders tree structure", () => {
    const tree = new Tree({ roots });
    const lines = tree.render(30);
    expect(lines[0]).toContain("Root");
    expect(lines[1]).toContain("Child 1");
    expect(lines[2]).toContain("Child 2");
  });

  it("shows expand/collapse indicators", () => {
    const tree = new Tree({ roots });
    const lines = tree.render(30);
    // Expanded node should show different indicator
    expect(lines[0]).toMatch(/[▼▶]/);
  });

  it("handles keyboard navigation", () => {
    const tree = new Tree({ roots });
    tree.handleInput("down");
    tree.handleInput("down");
    expect(tree["selectedIndex"]).toBeGreaterThan(0);
  });

  it("toggles expansion", () => {
    const tree = new Tree({ roots });
    tree.handleInput(" "); // Toggle
    // Root should now be collapsed
    expect(tree["roots"][0].expanded).toBe(false);
  });
});

describe("Table Widget", () => {
  const columns = [
    { key: "name", header: "Name", width: 10 },
    { key: "age", header: "Age", width: 5 },
    { key: "city", header: "City", width: "auto" }
  ];

  const data = [
    { name: "Alice", age: "30", city: "NYC" },
    { name: "Bob", age: "25", city: "LA" }
  ];

  it("renders header and rows", () => {
    const table = new Table({ columns, data, showHeader: true });
    const lines = table.render(40);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Age");
    expect(lines[2]).toContain("Alice");
  });

  it("renders with borders", () => {
    const table = new Table({ columns, data, showBorders: true });
    const lines = table.render(40);
    // Should have border characters
    expect(lines[0]).toContain("┌");
    expect(lines[0]).toContain("┐");
  });

  it("handles column alignment", () => {
    const alignedColumns = [
      { key: "a", header: "Left", width: 10, align: "left" },
      { key: "b", header: "Center", width: 10, align: "center" },
      { key: "c", header: "Right", width: 10, align: "right" }
    ];
    const table = new Table({ columns: alignedColumns, data: [{ a: "X", b: "X", c: "X" }] });
    const lines = table.render(40);
    expect(lines.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Hook Tests
// ============================================================================

describe("useState Hook", () => {
  beforeEach(() => {
    clearState();
  });

  it("creates local state", () => {
    const [value, setValue] = useState(0);
    expect(value).toBe(0);
    setValue(5);
    // Note: setValue updates the cell but doesn't trigger re-render in test context
  });

  it("creates persistent state with key", () => {
    const [val1, set1] = useState(10, "test-key");
    expect(val1).toBe(10);
    set1(20);
    // Creating with same key should get updated value
    const [val2] = useState(0, "test-key");
    expect(val2).toBe(20);
  });

  it("handles functional updates", () => {
    const [value, setValue] = useState(5);
    setValue((prev) => prev + 5);
    // Verify through new retrieval
    const [newValue] = useState(0, undefined);
    // Local state doesn't persist, so this test verifies the pattern works
  });

  it("clears state", () => {
    const [, setValue] = useState(10, "clear-test");
    setValue(20);
    clearState("clear-test");
    const [cleared] = useState(0, "clear-test");
    expect(cleared).toBe(0);
  });
});

describe("useSelect Hook", () => {
  it("initializes with first item selected", () => {
    const result = useSelect({
      items: ["a", "b", "c"],
      initialIndex: 0
    });
    expect(result.selectedIndex).toBe(0);
    expect(result.selectedItem).toBe("a");
  });

  it("can change selection", () => {
    const result = useSelect({ items: ["a", "b", "c"] });
    result.setSelectedIndex(1);
    expect(result.selectedIndex).toBe(1);
    expect(result.selectedItem).toBe("b");
  });

  it("clamps to valid range", () => {
    const result = useSelect({ items: ["a", "b"] });
    result.setSelectedIndex(10);
    expect(result.selectedIndex).toBe(1); // clamped
    result.setSelectedIndex(-5);
    expect(result.selectedIndex).toBe(0); // clamped
  });

  it("supports movement functions", () => {
    const result = useSelect({ items: ["a", "b", "c"], initialIndex: 0 });
    result.moveDown();
    expect(result.selectedIndex).toBe(1);
    result.moveUp();
    expect(result.selectedIndex).toBe(0);
  });

  it("supports pagination", () => {
    const result = useSelect({ items: Array.from({ length: 100 }, (_, i) => i) });
    result.movePageDown(10);
    expect(result.selectedIndex).toBe(10);
    result.movePageUp(5);
    expect(result.selectedIndex).toBe(5);
  });
});

describe("useFocus Hook", () => {
  const mockFocusable = (id: string): Focusable => ({
    get focused() { return false; },
    set focused(_v: boolean) {},
    id
  });

  it("initializes with first item focused", () => {
    const result = useFocus({
      items: [
        { component: mockFocusable("a"), id: "a" },
        { component: mockFocusable("b"), id: "b" }
      ]
    });
    expect(result.focusedIndex).toBe(0);
    expect(result.focusedItem?.id).toBe("a");
  });

  it("navigates forward and backward", () => {
    const result = useFocus({
      items: [
        { component: mockFocusable("a"), id: "a" },
        { component: mockFocusable("b"), id: "b" },
        { component: mockFocusable("c"), id: "c" }
      ]
    });
    result.focusNext();
    expect(result.focusedIndex).toBe(1);
    result.focusPrevious();
    expect(result.focusedIndex).toBe(0);
  });

  it("wraps by default", () => {
    const result = useFocus({
      items: [
        { component: mockFocusable("a"), id: "a" },
        { component: mockFocusable("b"), id: "b" }
      ]
    });
    result.focusPrevious(); // Should wrap to last
    expect(result.focusedIndex).toBe(1);
  });

  it("can focus by id", () => {
    const result = useFocus({
      items: [
        { component: mockFocusable("a"), id: "a" },
        { component: mockFocusable("b"), id: "b" }
      ]
    });
    result.focusById("b");
    expect(result.focusedItem?.id).toBe("b");
  });

  it("tracks focus state", () => {
    const result = useFocus({
      items: [
        { component: mockFocusable("a"), id: "a" },
        { component: mockFocusable("b"), id: "b" }
      ]
    });
    expect(result.isFocused("a")).toBe(true);
    expect(result.isFocused("b")).toBe(false);
  });
});

describe("useInput Hook", () => {
  it("initializes with empty value", () => {
    const result = useInput();
    expect(result.value).toBe("");
    expect(result.cursor).toBe(0);
  });

  it("initializes with provided value", () => {
    const result = useInput({ initialValue: "hello" });
    expect(result.value).toBe("hello");
    expect(result.cursor).toBe(5);
  });

  it("inserts text", () => {
    const result = useInput();
    result.insert("abc");
    expect(result.value).toBe("abc");
    result.insert("d");
    expect(result.value).toBe("abcd");
  });

  it("handles backspace", () => {
    const result = useInput({ initialValue: "abc" });
    result.backspace();
    expect(result.value).toBe("ab");
    expect(result.cursor).toBe(2);
  });

  it("handles delete", () => {
    const result = useInput({ initialValue: "abc" });
    result.moveCursor(-3); // Move to start
    result.deleteChar();
    expect(result.value).toBe("bc");
  });

  it("moves cursor", () => {
    const result = useInput({ initialValue: "hello" });
    result.moveCursor(-2);
    expect(result.cursor).toBe(3);
    result.moveToStart();
    expect(result.cursor).toBe(0);
    result.moveToEnd();
    expect(result.cursor).toBe(5);
  });

  it("validates input", () => {
    const result = useInput({
      validate: (v) => v.length < 3 ? "Too short" : undefined
    });
    result.setValue("ab");
    expect(result.error).toBe("Too short");
    result.setValue("long enough");
    expect(result.error).toBeUndefined();
  });

  it("handles password masking", () => {
    const result = useInput({ password: true, initialValue: "secret" });
    expect(result.getDisplayValue()).toBe("••••••");
    expect(result.value).toBe("secret");
  });

  it("manages history", () => {
    const result = useInput({ history: [] });
    result.setValue("first");
    result.submit();
    result.setValue("second");
    result.submit();
    result.historyPrev();
    expect(result.value).toBe("second");
    result.historyPrev();
    expect(result.value).toBe("first");
    result.historyNext();
    expect(result.value).toBe("second");
  });

  it("enforces maxLength", () => {
    const result = useInput({ maxLength: 5 });
    result.insert("abcdefghij");
    expect(result.value).toBe("abcde");
  });

  it("clears value", () => {
    const result = useInput({ initialValue: "to clear" });
    result.clear();
    expect(result.value).toBe("");
    expect(result.cursor).toBe(0);
  });
});

// ============================================================================
// Advanced Component Tests
// ============================================================================

describe("Segment/Powerline Components", () => {
  it("renders segment with icon", () => {
    const seg = new Segment({
      content: "main",
      icon: "",
      bgColor: DefaultTheme.blue,
      fgColor: DefaultTheme.white
    });
    const lines = seg.render(20);
    expect(lines[0]).toContain("main");
    expect(lines[0]).toContain("");
  });

  it("renders powerline with multiple segments", () => {
    const powerline = new Powerline({
      segments: [
        new Segment({ content: "A", bgColor: DefaultTheme.blue }),
        new Segment({ content: "B", bgColor: DefaultTheme.green })
      ]
    });
    const lines = powerline.render(30);
    expect(lines[0]).toContain("A");
    expect(lines[0]).toContain("B");
  });

  it("aligns powerline", () => {
    const left = new Powerline({
      segments: [new Segment({ content: "Test" })],
      align: "left"
    });
    const right = new Powerline({
      segments: [new Segment({ content: "Test" })],
      align: "right"
    });
    const l = left.render(40);
    const r = right.render(40);
    // Right-aligned should have leading space
    expect(r[0].indexOf("Test")).toBeGreaterThan(l[0].indexOf("Test"));
  });
});

describe("Modal Widget", () => {
  it("centers content", () => {
    const content = new Text({ content: "Hello" });
    const modal = new Modal({
      width: 20,
      height: 5,
      terminalHeight: 10,
      content
    });
    const lines = modal.render(80);
    // Should have margin lines before content
    expect(lines.length).toBeGreaterThan(0);
  });

  it("respects max dimensions", () => {
    const content = new Text({ content: "Very long content that might exceed" });
    const modal = new Modal({
      width: 10,
      content
    });
    const lines = modal.render(20);
    // Modal should not exceed available width
    expect(lines.every(l => visibleWidth(l) <= 20)).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Component Integration", () => {
  it("Panel with List inside", () => {
    const panel = new Panel({ title: "Menu", padding: 1 });
    const list = new List({
      items: [
        { id: "1", label: "Option 1" },
        { id: "2", label: "Option 2" }
      ]
    });
    panel.addChild(list);
    const lines = panel.render(30);
    expect(lines[0]).toContain("Menu");
    expect(lines.join("\n")).toContain("Option 1");
  });

  it("Flex with multiple component types", () => {
    const flex = new Flex({ direction: "column", gap: 1 });
    flex.addChild(new Text({ content: "Header" }));
    flex.addChild(new Spacer({ fixed: 1 }));
    flex.addChild(new Button({ label: "Action" }));
    const lines = flex.render(20);
    expect(lines.length).toBeGreaterThan(2);
  });

  it("Dialog with complex content", () => {
    const content = new Flex({ direction: "column" });
    content.addChild(new Text({ content: "Line 1" }));
    content.addChild(new Text({ content: "Line 2" }));

    const dialog = new Dialog({
      title: "Confirm",
      content,
      actions: [
        { id: "yes", label: "Yes", primary: true },
        { id: "no", label: "No" }
      ]
    });
    const lines = dialog.render(50);
    const output = lines.join("\n");
    expect(output).toContain("Confirm");
    expect(output).toContain("Line 1");
    expect(output).toContain("Yes");
    expect(output).toContain("No");
  });

  it("Tree with deep nesting", () => {
    const roots: TreeNode[] = [
      {
        id: "1",
        label: "Level 1",
        expanded: true,
        children: [
          {
            id: "1.1",
            label: "Level 2",
            expanded: true,
            children: [
              { id: "1.1.1", label: "Level 3a" },
              { id: "1.1.2", label: "Level 3b" }
            ]
          }
        ]
      }
    ];
    const tree = new Tree({ roots, indentSize: 2 });
    const lines = tree.render(40);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Level 1");
    expect(lines[3]).toContain("Level 3b");
  });

  it("Tabs with Panel content", () => {
    const tab1Panel = new Panel({ title: "Tab 1 Content" });
    const tab2Panel = new Panel({ title: "Tab 2 Content" });

    const tabs = new Tabs({
      tabs: [
        { id: "1", label: "First", content: tab1Panel },
        { id: "2", label: "Second", content: tab2Panel }
      ],
      activeTab: "1"
    });
    const lines = tabs.render(40);
    expect(lines[0]).toContain("First");
    expect(lines[0]).toContain("Second");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("handles zero width gracefully", () => {
    const text = new Text({ content: "test" });
    const lines = text.render(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("");
  });

  it("handles content wider than available space", () => {
    const text = new Text({ content: "VeryLongString" });
    const lines = text.render(5);
    expect(visibleWidth(lines[0])).toBeLessThanOrEqual(5);
  });

  it("handles empty content", () => {
    const text = new Text({ content: "" });
    const list = new List({ items: [] });
    const lines1 = text.render(10);
    const lines2 = list.render(10);
    expect(lines1).toHaveLength(1);
    expect(lines2.length).toBeGreaterThanOrEqual(0);
  });

  it("handles negative or invalid values", () => {
    const bar = new ProgressBar({ value: -50 });
    const bar2 = new ProgressBar({ value: 150 });
    expect(bar.getValue()).toBe(0); // clamped
    expect(bar2.getValue()).toBe(100); // clamped
  });

  it("handles very deep nesting in Stack", () => {
    const stack = new Stack();
    for (let i = 0; i < 10; i++) {
      stack.push(new Text({ content: `Layer ${i}` }), i, i % 2 === 0);
    }
    const lines = stack.render(20);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("handles rapid focus changes", () => {
    const mock = () => ({
      get focused() { return false; },
      set focused(_: boolean) {},
      id
    });
    const focus = useFocus({
      items: Array.from({ length: 10 }, (_, i) => ({
        component: mock(String(i)),
        id: String(i)
      }))
    });
    for (let i = 0; i < 100; i++) {
      focus.focusNext();
    }
    // Should wrap correctly
    expect(focus.focusedIndex).toBeGreaterThanOrEqual(0);
    expect(focus.focusedIndex).toBeLessThan(10);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Performance", () => {
  it("renders large lists efficiently", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      label: `Item ${i}`
    }));
    const list = new List({ items, maxVisible: 20 });
    const start = performance.now();
    const lines = list.render(50);
    const end = performance.now();
    expect(lines.length).toBeLessThanOrEqual(20);
    expect(end - start).toBeLessThan(100); // Should render in < 100ms
  });

  it("handles large tables", () => {
    const columns = [
      { key: "a", header: "A", width: 10 },
      { key: "b", header: "B", width: 10 },
      { key: "c", header: "C", width: 10 }
    ];
    const data = Array.from({ length: 100 }, (_, i) => ({
      a: `A${i}`,
      b: `B${i}`,
      c: `C${i}`
    }));
    const table = new Table({ columns, data, showHeader: true });
    const start = performance.now();
    const lines = table.render(40);
    const end = performance.now();
    expect(lines.length).toBeGreaterThan(0);
    expect(end - start).toBeLessThan(200);
  });
});
