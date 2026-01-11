"""
mcp-to-skill SDK
=================
Python SDK for converting MCP servers to Claude Skills.
"""

from .converter import (
    MCPConfig,
    SkillConfig,
    SkillInfo,
    convert_to_skill,
    validate_skill,
    test_skill,
    get_skill_status,
    reset_skill_stats
)

from .executor import (
    MCPExecutor,
    create_executor
)

from .daemon import (
    McpDaemon,
    start_daemon
)

from .client import (
    McpDaemonClient
)

__version__ = "2.2.0"

__all__ = [
    "MCPConfig",
    "SkillConfig",
    "SkillInfo",
    "convert_to_skill",
    "validate_skill",
    "test_skill",
    "get_skill_status",
    "reset_skill_stats",
    "MCPExecutor",
    "create_executor",
    "McpDaemon",
    "start_daemon",
    "McpDaemonClient",
]