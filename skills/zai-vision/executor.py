#!/usr/bin/env python3
"""
MCP Skill Executor (Simplified)
================================
Minimal executor for zai-vision MCP server.
"""

import json
import sys
import asyncio
import argparse
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def list_tools(config):
    """List tools from MCP server."""
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


async def describe_tool(config, tool_name):
    """Describe a specific tool."""
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


async def call_tool(config, tool_name, arguments):
    """Call a specific tool."""
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


async def main():
    parser = argparse.ArgumentParser(description="MCP Skill Executor")
    parser.add_argument("--call", help="JSON tool call to execute")
    parser.add_argument("--describe", help="Get tool schema")
    parser.add_argument("--list", action="store_true", help="List all tools")

    args = parser.parse_args()

    # Load server config
    config_path = Path(__file__).parent / "mcp-config.json"
    if not config_path.exists():
        print(f"Error: Configuration file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

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
            result = await call_tool(
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
        else:
            parser.print_help()

        # Explicitly flush
        sys.stdout.flush()
        sys.stderr.flush()

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())