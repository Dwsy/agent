/**
 * pi-tui-kit 基础测试
 */
import {
  Box,
  Text,
  Spacer,
  Flex,
  Panel,
  Button,
  List,
  DefaultTheme,
  Borders,
  visibleWidth,
  safeLine,
} from "../src/index.js";

// 测试 Text 组件
function testText() {
  const text = new Text({ content: "Hello" });
  const lines = text.render(10);
  console.assert(lines.length === 1, "Text should render single line");
  console.assert(lines[0].length === 10, "Text line should match width");
  console.log("✓ Text test passed");
}

// 测试 Box 组件
function testBox() {
  const box = new Box({ paddingX: 1, paddingY: 1, border: true });
  box.addChild(new Text({ content: "X" }));
  const lines = box.render(10);
  console.assert(lines.length >= 3, "Box with border should have at least 3 lines");
  console.log("✓ Box test passed");
}

// 测试 Panel 组件
function testPanel() {
  const panel = new Panel({
    title: "Test",
    border: Borders.rounded,
    padding: 1,
  });
  panel.addChild(new Text({ content: "Content" }));
  const lines = panel.render(20);
  console.assert(lines.length >= 3, "Panel should have border lines");
  console.assert(lines[0].includes("Test"), "Panel title should be in first line");
  console.log("✓ Panel test passed");
}

// 测试 List 组件
function testList() {
  const list = new List({
    items: [
      { id: "1", label: "Item 1" },
      { id: "2", label: "Item 2" },
    ],
    maxVisible: 2,
  });
  const lines = list.render(15);
  console.assert(lines.length === 2, "List should render maxVisible lines");
  console.log("✓ List test passed");
}

// 测试 Button 组件
function testButton() {
  const btn = new Button({ label: "OK", width: 10 });
  const lines = btn.render(15);
  console.assert(lines.length === 1, "Button should render single line");
  console.assert(lines[0].length === 15, "Button line should match width");
  console.log("✓ Button test passed");
}

// 测试 Flex 组件
function testFlex() {
  const flex = new Flex({ direction: "row", gap: 1 });
  flex.addChild(new Text({ content: "A" }), 1);
  flex.addChild(new Text({ content: "B" }), 1);
  const lines = flex.render(10);
  console.assert(lines.length >= 1, "Flex row should render at least one line");
  console.log("✓ Flex test passed");
}

// 测试工具函数
function testUtils() {
  const width = visibleWidth("Hello");
  console.assert(width === 5, "visibleWidth should count visible chars");

  const line = safeLine("Hi", 10);
  console.assert(line.length === 10, "safeLine should pad to width");
  console.log("✓ Utils test passed");
}

// 运行所有测试
export function runTests() {
  console.log("Running pi-tui-kit tests...\n");
  testText();
  testBox();
  testPanel();
  testList();
  testButton();
  testFlex();
  testUtils();
  console.log("\nAll tests passed! ✓");
}

// 如果直接运行此文件
if (import.meta.main) {
  runTests();
}
