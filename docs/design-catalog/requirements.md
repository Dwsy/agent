# Requirements: Pi Session Manager

## Project Overview
Create a standalone desktop application for managing Pi coding agent sessions, built with Tauri2.

## Business Goals
1. **Searchability**: Enable quick access to past conversations through fuzzy search
2. **Browseability**: View sessions using Pi's existing HTML export templates
3. **Independence**: Run as a separate application from Pi itself
4. **Performance**: Fast search and browsing experience

## Actors
| Actor | Description | Goals |
|-------|-------------|-------|
| **Developer** | Primary user who works with Pi | Find past conversations, review AI responses, search for specific topics |
| **Application** | Pi Session Manager (Tauri app) | Read session files, provide search, render HTML views |

## Functional Requirements

### Core Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| FR-1 | Session List | Display all sessions from `~/.pi/agent/sessions/` | P0 |
| FR-2 | Search Messages | Fuzzy search across user and AI messages | P0 |
| FR-3 | Render Session | Display session using Pi's HTML template | P0 |
| FR-4 | Sort Sessions | Sort by date (created/modified) or message count | P1 |
| FR-5 | Filter Tool Calls | Toggle inclusion of tool call results in search | P1 |
| FR-6 | Session Metadata | Show session info (id, cwd, message count, etc.) | P1 |

### Non-Functional Requirements
| ID | Requirement | Description |
|----|-------------|-------------|
| NFR-1 | Performance | Search results should appear within 2 seconds for 1000+ sessions |
| NFR-2 | Memory | Efficient memory usage for large session collections |
| NFR-3 | Startup | Application should start within 3 seconds |
| NFR-4 | Responsiveness | UI should remain responsive during file I/O |

## Constraints

### Technical Constraints
- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust (Tauri2)
- **Data Source**: JSONL files in `~/.pi/agent/sessions/` (no SQLite)
- **HTML Rendering**: Reuse Pi's export-html templates (template.html + template.css + template.js)
- **Search**: In-memory fuzzy search (no external search engine)

### Data Constraints
- Read-only access to session files (no modification)
- Session files are JSONL format (one JSON object per line)
- Must handle various SessionEntry types (Message, ThinkingLevelChange, ModelChange, etc.)

## Data Structures

### SessionInfo
```typescript
interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
  allMessagesText: string;
}
```

### SessionEntry Types
- SessionMessageEntry (user/assistant/toolResult messages)
- ThinkingLevelChangeEntry
- ModelChangeEntry
- CompactionEntry
- BranchSummaryEntry
- CustomEntry
- CustomMessageEntry
- LabelEntry
- SessionInfoEntry

## Success Criteria
1. User can find any session within 5 seconds
2. Search results are accurate and relevant
3. HTML rendering matches Pi's export format
4. Application runs smoothly with 1000+ sessions

## Open Questions (Hotspots)
- **HOTSPOT 1**: Session scale - How many sessions typically? (Affects indexing strategy)
- **HOTSPOT 2**: Search algorithm - Which fuzzy search implementation? (fuse.js vs custom)
- **HOTSPOT 3**: Incremental loading - How to handle lazy loading for large session lists?
- **HOTSPOT 4**: Template integration - How to inject session data into Pi's HTML templates?