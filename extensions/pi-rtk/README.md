# RTK Plugin for Pi-Coding-Agent

A token reduction plugin for pi-coding-agent that intelligently filters tool output to reduce token consumption by 60-90% while preserving essential information.

Based on the RTK (Rust Token Killer) specification from [RTK](https://github.com/rtk-ai/rtk).

## Features

- **Source Code Filtering**: Remove comments and normalize whitespace (minimal) or keep only signatures (aggressive)
- **Build Output Filtering**: Remove compilation noise, keep only errors and warnings
- **Test Output Aggregation**: Summarize test results, show failures only
- **Git Compaction**: Compact diffs, status, and log output
- **Search Result Grouping**: Group grep results by file with counts
- **Linter Aggregation**: Summarize lint errors by rule and file
- **ANSI Stripping**: Remove color codes and formatting
- **Smart Truncation**: Intelligently truncate large outputs

## Installation

Recommended: install the package via the pi package manager.

### Using pi install (recommended)

```bash
pi install npm:pi-rtk
```

Or add the package to your pi agent config to load automatically. Edit ~/.pi/agent/settings.json and include:

```json
{
  "packages": [
    "npm:pi-rtk"
  ]
}
```

If you need to install manually (older pi versions), you can clone into the extensions directory:

```bash
git clone https://github.com/mcowger/pi-rtk ~/.pi/agent/extensions/pi-rtk
```

## Configuration

Create `~/.pi/agent/rtk-config.json`:

```json
{
  "enabled": true,
  "logSavings": true,
  "showUpdateEvery": 10,
  "techniques": {
    "ansiStripping": true,
    "truncation": { "enabled": true, "maxChars": 10000 },
    "sourceCodeFiltering": "minimal",
    "smartTruncation": { "enabled": true, "maxLines": 200 },
    "testOutputAggregation": true,
    "buildOutputFiltering": true,
    "gitCompaction": true,
    "searchResultGrouping": true,
    "linterAggregation": true
  }
}
```

### Filter Levels

- `none`: No filtering applied
- `minimal`: Remove comments, normalize whitespace
- `aggressive`: Keep only signatures and structure

## Commands

- `/rtk-stats` - Show token savings statistics
- `/rtk-toggle` - Enable/disable token reduction
- `/rtk-clear` - Clear metrics history

## Supported Languages

- TypeScript/JavaScript
- Python
- Rust
- Go
- Java
- C/C++

## Token Savings

| Output Type | Expected Savings |
|-------------|------------------|
| Source code | 60-90% (aggressive mode) |
| Build output | 70-90% |
| Test results | 50-80% |
| Git output | 60-80% |
| Search results | 40-60% |

## Architecture

The plugin intercepts `tool_result` events and applies appropriate filtering based on:
- Tool type (bash, read, grep)
- Command context (build, test, git, etc.)
- File extension for source code

Metrics are tracked in-memory and can be viewed with `/rtk-stats`.

## License

MIT - Based on the RTK specification
