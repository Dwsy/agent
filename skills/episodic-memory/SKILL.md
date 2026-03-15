---
name: episodic-memory
description: Search past conversations for context, decisions, and patterns. Use when the user references previous work or when you encounter familiar problems.
---

# Episodic Memory

You have access to a searchable index of all past pi conversations across all projects.

## When to Search

- User says "like we did before", "remember when", "how did we solve X", "what did we try"
- User references a past session, project, or decision
- You encounter an error or pattern that might have been addressed previously
- Starting work on a feature similar to something done before
- User asks about project history or past decisions

## How to Search

Use the `episodic_memory_search` tool:

```
// Semantic search (finds by meaning, not just keywords)
{ "query": "authentication middleware implementation" }

// Multi-concept AND search (results must match ALL concepts)
{ "query": ["React Router", "authentication", "JWT"] }

// Filter by date
{ "query": "database migration", "after": "2025-01-01" }

// Text search for exact phrases
{ "query": "useAuth hook", "mode": "text" }
```

## Tips for Good Queries

- Use descriptive phrases, not single keywords
- Try the problem description, not just the solution
- If first search doesn't find it, try rephrasing or broadening
- Use multi-concept search when looking for a specific intersection of topics

## Viewing Full Conversations

If a search result snippet isn't enough context, use `episodic_memory_show` with the session file path from the search results to see the full conversation.

## Important

- Search results are snippets (chunks of ~4 turns). They show the relevant part, not the whole conversation.
- Results include a relevance score — higher is better.
- The project name in results shows which directory the session was in.
- Don't search for every query — only when past context would genuinely help.
