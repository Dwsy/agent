"""
MCP to Skill Converter SDK
============================
Core conversion logic for converting MCP servers to Claude Skills.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional, Literal
from dataclasses import dataclass, asdict
from enum import Enum


class Transport(str, Enum):
    """Supported transport types."""
    STDIO = "stdio"
    SSE = "sse"
    HTTP = "http"


@dataclass
class MCPConfig:
    """MCP server configuration."""
    name: str
    transport: Transport = Transport.STDIO
    command: Optional[str] = None
    args: Optional[List[str]] = None
    endpoint: Optional[str] = None
    env: Optional[Dict[str, str]] = None
    keep_alive: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = asdict(self)
        data['transport'] = self.transport.value
        return data


@dataclass
class SkillConfig:
    """Skill generation configuration."""
    output_dir: Optional[str] = None
    install: bool = True
    verbose: bool = False


@dataclass
class SkillInfo:
    """Information about generated skill."""
    name: str
    path: str
    tools: List[Dict[str, str]]
    context_saved: str
    transport: str


class MCPConverterError(Exception):
    """Base exception for MCP converter errors."""
    pass


class ConversionError(MCPConverterError):
    """Error during conversion process."""
    pass


class ValidationError(MCPConverterError):
    """Error during skill validation."""
    pass


def convert_to_skill(
    mcp_config: MCPConfig,
    skill_config: Optional[SkillConfig] = None
) -> SkillInfo:
    """
    Convert MCP server configuration to Claude Skill.
    
    Args:
        mcp_config: MCP server configuration
        skill_config: Skill generation configuration
        
    Returns:
        SkillInfo: Information about generated skill
        
    Raises:
        ConversionError: If conversion fails
    """
    if skill_config is None:
        skill_config = SkillConfig()

    try:
        # Use the lib.ts converter
        lib_path = Path(__file__).parent.parent / "lib.ts"
        
        # Create temporary config file
        config_file = Path(f"/tmp/mcp-config-{mcp_config.name}.json")
        with open(config_file, 'w') as f:
            json.dump(mcp_config.to_dict(), f, indent=2)
        
        # Determine output directory
        default_output = Path.home() / ".claude" / "skills" / mcp_config.name
        output_dir = skill_config.output_dir or str(default_output)
        
        # Build command
        cmd = ["bun", str(lib_path), "convert", str(config_file)]
        if skill_config.output_dir:
            cmd.extend(["--output", output_dir])
        if not skill_config.install:
            cmd.append("--no-install")
        
        # Execute conversion
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        if skill_config.verbose:
            print(result.stdout)
        
        # Parse tools from output
        tools = []
        # Try to extract tools from stdout
        for line in result.stdout.split('\n'):
            if "Tools available:" in line:
                # Extract number
                count = int(line.split(":")[-1].strip())
                # For now, return mock tools
                tools = [
                    {"name": f"tool_{i}", "description": f"Tool {i}"}
                    for i in range(count)
                ]
                break
        
        # Calculate context savings
        mcp_context = len(tools) * 500
        skill_context = 150
        savings = ((mcp_context - skill_context) / mcp_context * 100) if mcp_context > 0 else 0
        
        return SkillInfo(
            name=mcp_config.name,
            path=output_dir,
            tools=tools,
            context_saved=f"{savings:.1f}%",
            transport=mcp_config.transport.value
        )
        
    except subprocess.CalledProcessError as e:
        raise ConversionError(f"Conversion failed: {e.stderr}") from e
    except Exception as e:
        raise ConversionError(f"Unexpected error: {str(e)}") from e


def validate_skill(skill_path: str) -> Dict[str, Any]:
    """
    Validate a generated skill.
    
    Args:
        skill_path: Path to skill directory
        
    Returns:
        Dict with validation results
        
    Raises:
        ValidationError: If validation fails
    """
    skill_dir = Path(skill_path)
    
    if not skill_dir.exists():
        raise ValidationError(f"Skill directory not found: {skill_path}")
    
    # Check required files
    required_files = [
        "executor.py",
        "mcp-config.json",
        "SKILL.md"
    ]
    
    missing = []
    for file in required_files:
        if not (skill_dir / file).exists():
            missing.append(file)
    
    if missing:
        raise ValidationError(f"Missing required files: {', '.join(missing)}")
    
    # Try to run executor
    try:
        result = subprocess.run(
            ["uv", "run", "python", "executor.py", "--list"],
            cwd=skill_dir,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return {
                "valid": False,
                "error": result.stderr,
                "files": required_files
            }
        
        # Parse tools
        try:
            tools = json.loads(result.stdout)
        except:
            tools = []
        
        return {
            "valid": True,
            "tools": tools,
            "file_count": len(required_files),
            "files": required_files
        }
        
    except subprocess.TimeoutExpired:
        raise ValidationError("Executor timed out")
    except Exception as e:
        raise ValidationError(f"Validation failed: {str(e)}") from e


def test_skill(
    skill_path: str,
    mode: Literal["list", "describe", "call"] = "list",
    tool_name: Optional[str] = None,
    arguments: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Test a skill.
    
    Args:
        skill_path: Path to skill directory
        mode: Test mode (list/describe/call)
        tool_name: Tool name (for describe/call modes)
        arguments: Tool arguments (for call mode)
        
    Returns:
        Dict with test results
        
    Raises:
        ValidationError: If test fails
    """
    skill_dir = Path(skill_path)
    
    cmd = ["uv", "run", "python", "executor.py"]
    
    if mode == "list":
        cmd.append("--list")
    elif mode == "describe":
        if not tool_name:
            raise ValidationError("tool_name required for describe mode")
        cmd.extend(["--describe", tool_name])
    elif mode == "call":
        if not tool_name:
            raise ValidationError("tool_name required for call mode")
        call_data = {"tool": tool_name, "arguments": arguments or {}}
        cmd.extend(["--call", json.dumps(call_data)])
    else:
        raise ValidationError(f"Invalid mode: {mode}")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=skill_dir,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr,
                "mode": mode
            }
        
        # Parse output
        try:
            output = json.loads(result.stdout)
        except:
            output = result.stdout
        
        return {
            "success": True,
            "mode": mode,
            "output": output
        }
        
    except subprocess.TimeoutExpired:
        raise ValidationError("Test timed out")
    except Exception as e:
        raise ValidationError(f"Test failed: {str(e)}") from e


def get_skill_status(skill_path: str) -> Dict[str, Any]:
    """
    Get skill status and statistics.
    
    Args:
        skill_path: Path to skill directory
        
    Returns:
        Dict with status information
    """
    skill_dir = Path(skill_path)
    
    try:
        result = subprocess.run(
            ["uv", "run", "python", "executor.py", "--status"],
            cwd=skill_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return {
                "error": result.stderr,
                "status": "error"
            }
        
        return json.loads(result.stdout)
        
    except Exception as e:
        return {
            "error": str(e),
            "status": "error"
        }


def reset_skill_stats(skill_path: str) -> Dict[str, Any]:
    """
    Reset skill statistics.
    
    Args:
        skill_path: Path to skill directory
        
    Returns:
        Dict with operation result
    """
    skill_dir = Path(skill_path)
    
    try:
        result = subprocess.run(
            ["uv", "run", "python", "executor.py", "--reset-stats"],
            cwd=skill_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        return {
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr if result.returncode != 0 else None
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }