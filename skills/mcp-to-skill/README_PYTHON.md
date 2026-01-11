# mcp-to-skill Python SDK

Python SDK for converting MCP servers to Claude Skills.

## Installation

```bash
pip install mcp-to-skill
```

## Quick Start

### SDK Usage

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

### CLI Usage

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

## Examples

See the main [README.md](../README.md) for more examples.