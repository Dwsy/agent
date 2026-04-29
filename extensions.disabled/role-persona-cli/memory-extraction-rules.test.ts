import test from "node:test";
import assert from "node:assert/strict";

import {
  filterAutoExtractedLearnings,
  filterAutoExtractedPreferences,
} from "./memory-extraction-rules.ts";

test("filterAutoExtractedLearnings removes derivable repo facts", () => {
  const result = filterAutoExtractedLearnings([
    "路径重构需全局搜索验证，确保无遗漏旧路径引用",
    "修复 .gitignore 配置后需验证实际路径忽略效果",
    "用户在疲惫或情绪低落时更需要温暖、简洁的回应",
    "函数定义后残留代码会导致语法错误，需确保函数体完整闭合",
  ]);

  assert.deepEqual(result, [
    "用户在疲惫或情绪低落时更需要温暖、简洁的回应",
  ]);
});

test("filterAutoExtractedPreferences removes derivable codebase facts but keeps durable user preferences", () => {
  const result = filterAutoExtractedPreferences([
    { category: "Code", text: "kilo.ts 文件中未包含余额显示逻辑，需检查 pi 框架内置组件或状态栏机制" },
    { category: "Tools", text: "Ace tool 依赖 .env 配置，缺少 ACE_BASE_URL 和 ACE_API_KEY 会导致守护进程启动失败" },
    { category: "Workflow", text: "提交策略应按关注点原子化，避免巨型混合commit" },
  ]);

  assert.deepEqual(result, [
    { category: "Workflow", text: "提交策略应按关注点原子化，避免巨型混合commit" },
  ]);
});
