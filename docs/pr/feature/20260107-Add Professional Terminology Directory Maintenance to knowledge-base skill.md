# Pull Request: Add Professional Terminology Directory Maintenance (Glossary)

> Add `glossary` command to generate a consolidated terminology table and `term` alias for creating concepts.

## 背景与目的 (Why)
To provide a consolidated view of all professional terms/concepts in the knowledge base, addressing the user's request for a "Professional Terminology Directory".

## 变更内容概述 (What)
- **Feature**: Added `glossary` command to `lib.ts`.
- **Feature**: Added `term` alias to `create` command (maps to `concept`).
- **Docs**: Updated `SKILL.md` with new command and examples.

## 关联 Issue 与 ToDo 条目 (Links)
- **Issues:** `docs/issues/feature/20260107-Add Professional Terminology Directory Maintenance to knowledge-base skill.md`

## 测试与验证结果 (Test Result)
- [x] Manual verification: `bun lib.ts glossary` generates `GLOSSARY.md` correctly.
- [x] Manual verification: `bun lib.ts create term ...` creates a concept file.

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `lib.ts` | 修改 | Added `generateGlossary`, updated `create`, updated help. |
| `SKILL.md` | 修改 | Added documentation for `glossary` and `term`. |

## 元数据

| 字段 | 内容 |
|------|------|
| **状态** | ✅ 已合并 |
| **类型** | ✨ Feature |
