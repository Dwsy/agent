"""
MCP Runtime Executor
====================
Provides reusable MCP client execution with process management.
"""

import json
import sys
import asyncio
import os
from pathlib import Path
from typing import Optional, Dict, Any, List
from io import StringIO

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


class NullWriter:
    """A writer that discards all output."""
    def write(self, text):
        pass
    def flush(self):
        pass
    def fileno(self):
        """Return a dummy file descriptor."""
        return os.open(os.devnull, os.O_WRONLY)


class MCPExecutor:
    """Reusable MCP executor with session persistence."""

    def __init__(self, config: Dict[str, Any], skill_dir: Optional[Path] = None):
        """
        Initialize MCP executor.

        Args:
            config: MCP configuration dict
            skill_dir: Skill directory for stats/logs (optional)
        """
        self.config = config
        self.skill_dir = skill_dir or Path(__file__).parent
        self.verbose = False

        # Session persistence
        self._session: Optional[ClientSession] = None
        self._read_stream = None
        self._write_stream = None
        self._context = None
        self._initialized = False
        self._lock = asyncio.Lock()

        # Try to import process manager (optional)
        self._process_manager = None
        self._shutdown_manager = None

        # Only initialize process manager if keep_alive is enabled
        keep_alive = config.get('keep_alive', {})
        if keep_alive.get('enabled', False):
            try:
                sys.path.insert(0, str(Path(__file__).parent.parent / "templates"))
                from process_manager import init_manager, get_manager, shutdown_manager
                init_manager(config, self.skill_dir)
                self._process_manager = get_manager()
                self._shutdown_manager = shutdown_manager
            except ImportError:
                pass
            except Exception as e:
                print(f"Warning: Failed to initialize process manager: {e}", file=sys.stderr)

    def set_verbose(self, verbose: bool):
        """Enable or disable verbose logging."""
        self.verbose = verbose

    async def _ensure_session(self):
        """Ensure session is initialized and connected."""
        async with self._lock:
            if self._initialized and self._session:
                return

            server_params = StdioServerParameters(
                command=self.config["command"],
                args=self.config.get("args", []),
                env=self.config.get("env")
            )

            errlog = sys.stderr if self.verbose else NullWriter()

            # Create new connection
            context = stdio_client(server_params, errlog=errlog)
            self._read_stream, self._write_stream = await context.__aenter__()
            self._session = ClientSession(self._read_stream, self._write_stream)

            await self._session.initialize()
            self._initialized = True

            # Store context for cleanup
            self._context = context

            print(f"[MCP Executor] Session initialized", file=sys.stderr)

    async def list_tools(self) -> List[Dict[str, str]]:
        """List all available tools."""
        await self._ensure_session()

        response = await self._session.list_tools()

        return [
            {"name": tool.name, "description": tool.description}
            for tool in response.tools
        ]

    async def describe_tool(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific tool."""
        await self._ensure_session()

        response = await self._session.list_tools()

        for tool in response.tools:
            if tool.name == tool_name:
                return {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.inputSchema
                }
        return None

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Execute a tool call."""
        await self._ensure_session()

        response = await self._session.call_tool(tool_name, arguments)
        return response.content

    async def get_status(self) -> Dict[str, Any]:
        """Get executor status."""
        status = {
            "config": {
                "name": self.config.get("name"),
                "transport": self.config.get("transport"),
                "command": self.config.get("command")
            },
            "session_initialized": self._initialized,
            "process_manager": self._process_manager is not None
        }

        if self._process_manager:
            status["process_alive"] = self._process_manager.is_process_alive()
            status["keep_alive_enabled"] = self._process_manager.enabled
            if self._process_manager.enabled:
                status["timeout"] = self._process_manager.timeout
                status["check_interval"] = self._process_manager.check_interval

        return status

    async def close(self):
        """Close the session."""
        async with self._lock:
            if self._session:
                try:
                    await self._session.close()
                except:
                    pass
                self._session = None
                self._read_stream = None
                self._write_stream = None
                self._context = None
                self._initialized = False

    def cleanup(self):
        """Cleanup resources."""
        # Close session
        if self._initialized:
            asyncio.create_task(self.close())

        # Shutdown process manager
        if self._process_manager and self._shutdown_manager:
            self._shutdown_manager()


def create_executor(config_path: Path) -> MCPExecutor:
    """
    Create executor from config file.

    Args:
        config_path: Path to mcp-config.json

    Returns:
        MCPExecutor instance
    """
    with open(config_path) as f:
        config = json.load(f)

    return MCPExecutor(config, config_path.parent)


async def run_cli(config_path: Optional[Path] = None):
    """
    Run CLI interface.
    
    Args:
        config_path: Optional path to mcp-config.json. If not provided, will search for it.
    """
    import argparse

    parser = argparse.ArgumentParser(
        description="MCP Executor - Reusable client with process management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --list                          List all tools
  %(prog)s --describe tool_name           Get tool schema
  %(prog)s --call '{"tool": "..."}'        Execute tool
  %(prog)s --status                        Show status
  %(prog)s --verbose                       Enable logging
        """
    )
    parser.add_argument("--call", help="JSON tool call to execute")
    parser.add_argument("--describe", help="Get tool schema")
    parser.add_argument("--list", action="store_true", help="List all tools")
    parser.add_argument("--status", action="store_true", help="Show status")
    parser.add_argument("--verbose", action="store_true", help="Show verbose logs")
    parser.add_argument("--version", action="version", version="%(prog)s 1.0.0")

    args = parser.parse_args()

    # Find config file
    if config_path is None:
        config_path = Path.cwd() / "mcp-config.json"
        if not config_path.exists():
            config_path = Path(__file__).parent / "mcp-config.json"

    if not config_path.exists():
        print(f"Error: Configuration file not found (searched in {Path.cwd()} and {Path(__file__).parent})", file=sys.stderr)
        sys.exit(1)

    # Create executor
    executor = create_executor(config_path)
    executor.set_verbose(args.verbose)

    try:
        if args.list:
            tools = await executor.list_tools()
            print(json.dumps(tools, indent=2, ensure_ascii=False))

        elif args.describe:
            schema = await executor.describe_tool(args.describe)
            if schema:
                print(json.dumps(schema, indent=2, ensure_ascii=False))
            else:
                print(f"Tool not found: {args.describe}", file=sys.stderr)
                sys.exit(1)

        elif args.call:
            call_data = json.loads(args.call)
            result = await executor.call_tool(
                call_data["tool"],
                call_data.get("arguments", {})
            )

            # Format result
            if isinstance(result, list):
                for item in result:
                    if hasattr(item, 'text'):
                        print(item.text)
                    else:
                        print(json.dumps(item.__dict__ if hasattr(item, '__dict__') else item, indent=2))
            else:
                print(json.dumps(result.__dict__ if hasattr(result, '__dict__') else result, indent=2))

        elif args.status:
            status = await executor.get_status()
            print(json.dumps(status, indent=2, ensure_ascii=False))
        else:
            parser.print_help()

        sys.stdout.flush()

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        executor.cleanup()


if __name__ == "__main__":
    asyncio.run(run_cli())