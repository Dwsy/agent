# mcp-to-skill

将任何 MCP 服务器封装为 Claude Skill，支持 stdio/SSE/HTTP 传输协议，提供 CLI 和 Python SDK 双模式。

## Features

- ✅ **双模式支持**: CLI 命令行工具 + Python SDK
- ✅ **多传输协议**: stdio/SSE/HTTP
- ✅ **uv 依赖管理**: 比 pip 快 10-100 倍
- ✅ **自动 introspect**: 自动获取工具列表
- ✅ **一键转换**: 从配置到可用技能
- ✅ **统计追踪**: 工具调用统计和日志
- ✅ **上下文节省**: 96%+ 上下文节省

## Installation

### Python SDK (pip)

```bash
pip install mcp-to-skill
```

### Bun CLI (本地)

```bash
# 确保已安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 使用本地 lib.ts
bun lib.ts convert my-mcp.json
```

## Usage

### Python SDK

```python
from mcp_to_skill import (
    MCPConfig,
    SkillConfig,
    Transport,
    convert_to_skill,
    validate_skill,
    test_skill,
    get_skill_status
)

# Convert MCP server to skill
config = MCPConfig(
    name="github",
    transport=Transport.STDIO,
    command="npx",
    args=["@modelcontextprotocol/server-github"],
    env={"GITHUB_TOKEN": "your-token"}
)

skill_info = convert_to_skill(config)
print(f"Skill created at: {skill_info.path}")

# Validate skill
validation = validate_skill(skill_info.path)
print(f"Valid: {validation['valid']}")
print(f"Tools: {len(validation['tools'])}")

# Get status
status = get_skill_status(skill_info.path)
print(f"Total calls: {status['stats']['total_calls']}")
```

### CLI

```bash
# Convert
mcp-to-skill convert my-mcp.json

# Validate
mcp-to-skill validate ~/.claude/skills/my-mcp

# Test
mcp-to-skill test ~/.claude/skills/my-mcp --mode list

# Status
mcp-to-skill status ~/.claude/skills/my-mcp

# Reset stats
mcp-to-skill reset-stats ~/.claude/skills/my-mcp
```

### Bun CLI (本地)

```bash
# Convert
bun lib.ts convert my-mcp.json

# Validate
bun lib.ts validate ~/.claude/skills/my-mcp

# Test
bun lib.ts test ~/.claude/skills/my-mcp --list
```

## MCP Config Format

```json
{
  "name": "my-mcp",
  "transport": "stdio|sse|http",
  "command": "npx",  // stdio only
  "args": ["@example/mcp-server"],  // stdio only
  "endpoint": "https://...",  // sse/http only
  "env": {"API_KEY": "your-key"},
  "keep_alive": {
    "enabled": true,
    "timeout": 3600
  }
}
```

## Examples

### Example 1: GitHub MCP (stdio)

```python
from mcp_to_skill import MCPConfig, Transport, convert_to_skill

config = MCPConfig(
    name="github",
    transport=Transport.STDIO,
    command="npx",
    args=["-y", "@modelcontextprotocol/server-github"],
    env={"GITHUB_TOKEN": "ghp_your_token"}
)

skill = convert_to_skill(config)
```

### Example 2: DeepWiki (SSE)

```python
from mcp_to_skill import MCPConfig, Transport, convert_to_skill

config = MCPConfig(
    name="deepwiki",
    transport=Transport.SSE,
    endpoint="https://mcp.deepwiki.com/sse"
)

skill = convert_to_skill(config)
```

### Example 3: Enable Process Reuse

```python
from mcp_to_skill import MCPConfig, Transport, convert_to_skill

config = MCPConfig(
    name="my-mcp",
    transport=Transport.STDIO,
    command="npx",
    args=["@example/mcp-server"],
    keep_alive={
        "enabled": True,
        "timeout": 3600,
        "check_interval": 60
    }
)

skill = convert_to_skill(config)
```

## API Reference

### MCPConfig

```python
@dataclass
class MCPConfig:
    name: str
    transport: Transport = Transport.STDIO
    command: Optional[str] = None
    args: Optional[List[str]] = None
    endpoint: Optional[str] = None
    env: Optional[Dict[str, str]] = None
    keep_alive: Optional[Dict[str, Any]] = None
```

### convert_to_skill()

```python
def convert_to_skill(
    mcp_config: MCPConfig,
    skill_config: Optional[SkillConfig] = None
) -> SkillInfo
```

### validate_skill()

```python
def validate_skill(skill_path: str) -> Dict[str, Any]
```

### test_skill()

```python
def test_skill(
    skill_path: str,
    mode: Literal["list", "describe", "call"] = "list",
    tool_name: Optional[str] = None,
    arguments: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]
```

### get_skill_status()

```python
def get_skill_status(skill_path: str) -> Dict[str, Any]
```

### reset_skill_stats()

```python
def reset_skill_stats(skill_path: str) -> Dict[str, Any]
```

## Performance

### Context Savings

| Tools | MCP | Skill | Saved |
|-------|-----|-------|-------|
| 8 | 4000 tokens | 150 tokens | 96% |
| 20 | 10000 tokens | 150 tokens | 98.5% |

### Dependency Management

| Metric | pip | uv | Improvement |
|--------|-----|-----|-------------|
| Install time | 10s+ | <1s | 10x+ |
| Virtual env | Manual | Auto | ✅ |
| Resolution | Slow | Fast | 5x+ |

### Process Reuse

| Scenario | Without Reuse | With Reuse | Improvement |
|----------|---------------|------------|-------------|
| First call | 5s | 5s | - |
| Subsequent calls | 5s | <0.5s | 10x |
| 10 calls | 50s | 5s | 10x |

## Requirements

### Python SDK
- Python 3.10+
- httpx>=0.25.0

### Bun CLI
- Bun runtime
- uv (https://astral.sh/uv)

## Documentation

- [Python SDK Guide](README_PYTHON.md)
- [MCP 规范](https://modelcontextprotocol.io)
- [uv 文档](https://astral.sh/uv)

## License

MIT

## Credits

Based on [mcp-to-skill-converter](https://github.com/GBSOSS/-mcp-to-skill-converter) by GBSOSS