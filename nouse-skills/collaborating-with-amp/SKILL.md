---
name: collaborating-with-amp
description: Delegates tasks to the Amp CLI agent in read-only/research mode. Useful for semantic codebase search, finding code by concept ("how does X work"), and web search. Cannot modify files.
---

# Collaborating with Amp (Search & Research)

## Description
This skill delegates tasks to the Amp CLI agent (`amp`) in a **read-only / research mode**. 
It leverages Amp's semantic search, web search, and codebase exploration capabilities while **disabling file modification** tools.

## When to use
- **Semantic Code Search**: "How does X work?", "Find code related to Y".
- **Concept Discovery**: When you don't know the exact file or symbol.
- **Web Search**: Amp has built-in web search and reading capabilities.
- **Second Opinion**: Ask Amp to analyze a problem or explain code.

## Limitations
- **Read-Only**: Cannot create, edit, or delete files.
- **No Commits**: Cannot create git commits.

## How to use
Run the client script with your natural language query as a single argument.

```bash
~/.pi/agent/skills/collaborating-with-amp/client.ts "your query here"
```

## Examples

### Codebase Search
```bash
~/.pi/agent/skills/collaborating-with-amp/client.ts "How is the user authentication flow implemented?"
```

### Web Search
```bash
~/.pi/agent/skills/collaborating-with-amp/client.ts "Search the web for the latest Next.js 14 features regarding server actions"
```

### Debugging/Analysis
```bash
~/.pi/agent/skills/collaborating-with-amp/client.ts "Analyze the error handling in src/utils/api.ts and suggest improvements"
```
