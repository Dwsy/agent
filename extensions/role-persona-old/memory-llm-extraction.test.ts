import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 我们需要直接访问 extractJsonObject 和 parseAutoMemoryResponse 函数
// 由于它们不是导出的，我们需要在测试文件中重新定义它们（与 memory-llm.ts 保持同步）

function extractJsonObject(text: string): string | null {
  let trimmed = text.trim();

  // 剥离 <think>...</think> 标签（thinking models 的思考过程）
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 剥离 markdown 代码块（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    trimmed = codeBlockMatch[1].trim();
  }

  // 尝试提取 JSON 对象
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseAutoMemoryResponse(text: string): { learnings?: Array<{ text?: string }>; preferences?: Array<{ text?: string; category?: string }> } | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as { learnings?: Array<{ text?: string }>; preferences?: Array<{ text?: string; category?: string }> };
  } catch {
    return null;
  }
}

test("memory extraction system prompt defines the JSON response contract", () => {
  const source = readFileSync(new URL("./memory-llm.ts", import.meta.url), "utf-8");
  const systemPrompt = source.match(/const MEMORY_EXTRACTION_SYSTEM_PROMPT = `([\s\S]*?)`;/)?.[1];

  assert.ok(systemPrompt, "System prompt should be present");
  assert.match(systemPrompt, /Return exactly one JSON object matching this schema/);
  assert.match(systemPrompt, /with both arrays present/);
  assert.match(systemPrompt, /\$\{AUTO_MEMORY_RESPONSE_SCHEMA\}/);
  assert.match(source, /const AUTO_MEMORY_RESPONSE_SCHEMA = '\{"learnings"/);
});

test("parseAutoMemoryResponse handles <think> tags before JSON", () => {
  const input = `<think>Let me analyze this conversation carefully to extract durable learnings...

I notice the user mentioned several patterns about tmux and deployment.
</think>

{
  "learnings": [
    { "text": "tmux session name should use dynamic prefix" }
  ],
  "preferences": []
}`;

  const result = parseAutoMemoryResponse(input);
  assert.ok(result !== null, "Should parse successfully despite <think> tags");
  assert.equal(result?.learnings?.length, 1);
  assert.equal(result?.learnings?.[0]?.text, "tmux session name should use dynamic prefix");
});

test("parseAutoMemoryResponse handles markdown json code blocks", () => {
  const input = `\`\`\`json
{
  "learnings": [
    { "text": "edit tool parameter structure fix" }
  ],
  "preferences": [
    { "text": "prefer two-step UX pattern", "category": "Workflow" }
  ]
}
\`\`\``;

  const result = parseAutoMemoryResponse(input);
  assert.ok(result !== null, "Should parse successfully despite markdown code block");
  assert.equal(result?.learnings?.length, 1);
  assert.equal(result?.preferences?.length, 1);
});

test("parseAutoMemoryResponse handles <think> + markdown code block combined", () => {
  const input = `<think>The user wants me to extract durable learnings...

Looking at the conversation, I see patterns about Rust domain refactoring.
</think>

\`\`\`json
{
  "learnings": [
    { "text": "Moving business logic into domain reduces file sizes" }
  ],
  "preferences": []
}
\`\`\``;

  const result = parseAutoMemoryResponse(input);
  assert.ok(result !== null, "Should parse successfully despite combined noise");
  assert.equal(result?.learnings?.length, 1);
});

test("parseAutoMemoryResponse handles plain JSON without wrapping", () => {
  const input = `{
  "learnings": [
    { "text": "direct json learning" }
  ],
  "preferences": []
}`;

  const result = parseAutoMemoryResponse(input);
  assert.ok(result !== null, "Should parse plain JSON");
  assert.equal(result?.learnings?.length, 1);
});

test("parseAutoMemoryResponse returns null for invalid JSON", () => {
  const input = "This is just text with no JSON at all";
  const result = parseAutoMemoryResponse(input);
  assert.equal(result, null, "Should return null for non-JSON input");
});

test("parseAutoMemoryResponse returns null for malformed JSON", () => {
  const input = `{ broken json: }`;
  const result = parseAutoMemoryResponse(input);
  assert.equal(result, null, "Should return null for malformed JSON");
});

test("extractJsonObject handles multiple <think> tags", () => {
  const input = `<think>First thinking block</think>
Some text in between
<think>Second thinking block</think>
{"learnings": [], "preferences": []}`;

  const result = extractJsonObject(input);
  assert.ok(result !== null, "Should extract JSON despite multiple <think> tags");
  assert.ok(result.startsWith("{"), "Should start with {");
});

test("parseAutoMemoryResponse handles minimax-style response from logs", () => {
  // This is the actual format that was failing in the logs
  const input = `<think>Let me analyze this conversation carefully to extract durable cross-session learnings and stable user preferences.

Looking at the conversation:
1. User mentioned tmux session operations
2. User discussed edit tool parameter structure
3. User prefers two-step UX pattern

Now I'll extract the learnings and preferences.
</think>

{
  "learnings": [
    { "text": "tmux resume command handles session cwd extraction" },
    { "text": "edit tool path should be outer property" }
  ],
  "preferences": [
    { "text": "two-step UX pattern is clearer", "category": "Workflow" }
  ]
}`;

  const result = parseAutoMemoryResponse(input);
  assert.ok(result !== null, "Should parse minimax-style response");
  assert.equal(result?.learnings?.length, 2);
  assert.equal(result?.preferences?.length, 1);
});
