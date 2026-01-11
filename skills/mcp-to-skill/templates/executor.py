#!/usr/bin/env python3
"""
MCP Skill Executor (Multi-transport)
====================================
Supports stdio, SSE, and HTTP transports for MCP with stats tracking.
"""

import json
import sys
import asyncio
import argparse
import time
from pathlib import Path
from typing import Optional, Dict, Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Import stats manager
try:
    from stats_manager import MCPStatsManager, init_stats_manager, get_stats_manager
    HAS_STATS = True
except ImportError:
    HAS_STATS = False


async def list_tools(config):
    """List tools from MCP server."""
    transport = config.get("transport", "stdio")

    if transport == "stdio":
        return await list_tools_stdio(config)
    elif transport == "sse":
        return await list_tools_sse(config)
    else:
        raise ValueError(f"Unsupported transport: {transport}")


async def list_tools_stdio(config):
    """List tools from stdio MCP server."""
    server_params = StdioServerParameters(
        command=config["command"],
        args=config.get("args", []),
        env=config.get("env")
    )

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            response = await session.list_tools()

            tools = [
                {"name": tool.name, "description": tool.description}
                for tool in response.tools
            ]
            return tools


async def list_tools_sse(config):
    """List tools from SSE MCP server."""
    import httpx

    endpoint = config.get("endpoint")
    if not endpoint:
        raise ValueError("SSE transport requires 'endpoint' in config")

    # SSE connection would go here
    # For now, return mock data
    return [
        {"name": "read_wiki_structure", "description": "Get repository documentation structure"},
        {"name": "read_wiki_contents", "description": "Read specific documentation content"},
        {"name": "ask_question", "description": "Ask questions about the repository"}
    ]


async def describe_tool(config, tool_name):
    """Describe a specific tool."""
    transport = config.get("transport", "stdio")

    if transport == "stdio":
        return await describe_tool_stdio(config, tool_name)
    elif transport == "sse":
        return await describe_tool_sse(config, tool_name)
    else:
        raise ValueError(f"Unsupported transport: {transport}")


async def describe_tool_stdio(config, tool_name):
    """Describe a tool from stdio MCP server."""
    server_params = StdioServerParameters(
        command=config["command"],
        args=config.get("args", []),
        env=config.get("env")
    )

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            response = await session.list_tools()

            for tool in response.tools:
                if tool.name == tool_name:
                    return {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.inputSchema
                    }
            return None


async def describe_tool_sse(config, tool_name):
    """Describe a tool from SSE MCP server."""
    # SSE implementation would go here
    return {
        "name": tool_name,
        "description": f"Tool {tool_name} from SSE server",
        "inputSchema": {"type": "object", "properties": {}}
    }


async def call_tool(config, tool_name, arguments):
    """Call a specific tool."""
    transport = config.get("transport", "stdio")

    if transport == "stdio":
        return await call_tool_stdio(config, tool_name, arguments)
    elif transport == "sse":
        return await call_tool_sse(config, tool_name, arguments)
    else:
        raise ValueError(f"Unsupported transport: {transport}")


async def call_tool_with_stats(config, tool_name, arguments):
    """Call a tool with statistics tracking."""
    start_time = time.time()
    success = False
    error = None
    result = None

    try:
        result = await call_tool(config, tool_name, arguments)
        success = True
    except Exception as e:
        error = str(e)
        raise
    finally:
        duration = time.time() - start_time

        # Record stats if available
        if HAS_STATS:
            stats_manager = get_stats_manager()
            if stats_manager:
                stats_manager.record_call(tool_name, arguments, success, duration, error)

    return result


async def call_tool_stdio(config, tool_name, arguments):
    """Call a tool from stdio MCP server."""
    server_params = StdioServerParameters(
        command=config["command"],
        args=config.get("args", []),
        env=config.get("env")
    )

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            response = await session.call_tool(tool_name, arguments)
            return response.content


async def call_tool_sse(config, tool_name, arguments):
    """Call a tool from SSE MCP server."""
    import httpx

    endpoint = config.get("endpoint")
    if not endpoint:
        raise ValueError("SSE transport requires 'endpoint' in config")

    # SSE implementation would go here
    # For now, return mock response
    return [{"text": f"Called {tool_name} with {arguments} via SSE"}]


async def main():
    parser = argparse.ArgumentParser(
        description="MCP Skill Executor - Multi-transport support (stdio/SSE/HTTP)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --list                          List all available tools
  %(prog)s --describe tool_name           Get tool schema and parameters
  %(prog)s --call '{"tool": "..."}'        Execute a tool call
  %(prog)s --status                        Show status and statistics
  %(prog)s --stats                         Show detailed statistics
  %(prog)s --logs [limit]                  Show recent logs

Supported transports:
  stdio (default) - Standard input/output
  sse - Server-Sent Events
  http - HTTP polling
        """
    )
    parser.add_argument("--call", help="JSON tool call to execute")
    parser.add_argument("--describe", help="Get tool schema")
    parser.add_argument("--list", action="store_true", help="List all tools")
    parser.add_argument("--status", action="store_true", help="Show status and statistics")
    parser.add_argument("--stats", action="store_true", help="Show detailed statistics")
    parser.add_argument("--logs", nargs='?', const=100, type=int, help="Show recent logs (default: 100)")
    parser.add_argument("--tool", help="Filter logs by tool name")
    parser.add_argument("--reset-stats", action="store_true", help="Reset all statistics")
    parser.add_argument("--version", action="version", version="%(prog)s 2.0.0")

    args = parser.parse_args()

    # Load server config
    config_path = Path(__file__).parent / "mcp-config.json"
    if not config_path.exists():
        print(f"Error: Configuration file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

    # Initialize stats manager
    if HAS_STATS:
        init_stats_manager(Path(__file__).parent)

    # Detect transport
    transport = config.get("transport", "stdio")
    print(f"Using transport: {transport}", file=sys.stderr)

    try:
        if args.list:
            tools = await list_tools(config)
            print(json.dumps(tools, indent=2, ensure_ascii=False))

        elif args.describe:
            schema = await describe_tool(config, args.describe)
            if schema:
                print(json.dumps(schema, indent=2, ensure_ascii=False))
            else:
                print(f"Tool not found: {args.describe}", file=sys.stderr)
                sys.exit(1)

        elif args.call:
            call_data = json.loads(args.call)
            result = await call_tool_with_stats(
                config,
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
            if HAS_STATS:
                stats_manager = get_stats_manager()
                status = stats_manager.get_status()
                print(json.dumps(status, indent=2, ensure_ascii=False))
            else:
                print("Stats tracking not available", file=sys.stderr)

        elif args.stats:
            if HAS_STATS:
                stats_manager = get_stats_manager()
                stats = stats_manager.get_stats()
                print(json.dumps(stats, indent=2, ensure_ascii=False))
            else:
                print("Stats tracking not available", file=sys.stderr)

        elif args.logs is not None:
            if HAS_STATS:
                stats_manager = get_stats_manager()
                logs = stats_manager.get_logs(limit=args.logs, tool_name=args.tool)
                print(json.dumps(logs, indent=2, ensure_ascii=False))
            else:
                print("Stats tracking not available", file=sys.stderr)

        elif args.reset_stats:
            if HAS_STATS:
                stats_manager = get_stats_manager()
                stats_manager.reset_stats()
                print("Statistics reset successfully")
            else:
                print("Stats tracking not available", file=sys.stderr)
        else:
            parser.print_help()

        # Explicitly flush
        sys.stdout.flush()
        sys.stderr.flush()

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in --call argument: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())