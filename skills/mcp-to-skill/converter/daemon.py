#!/usr/bin/env python3
"""
MCP Daemon (Unix Socket)
=========================
Persistent MCP process with Unix domain socket for IPC.
"""

import json
import sys
import asyncio
import os
import signal
import time
from pathlib import Path
from typing import Optional, Dict, Any
import socket
import struct

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


class McpSessionManager:
    """Manages persistent MCP session."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.session: Optional[ClientSession] = None
        self.context = None
        self.initialized = False
        self.lock = asyncio.Lock()

    async def initialize(self):
        """Initialize MCP session."""
        async with self.lock:
            if self.initialized:
                return

            server_params = StdioServerParameters(
                command=self.config["command"],
                args=self.config.get("args", []),
                env={**os.environ, **self.config.get("env", {})}
            )

            # Suppress stderr
            null_stderr = open(os.devnull, 'w')

            context = stdio_client(server_params, errlog=null_stderr)
            read_stream, write_stream = await context.__aenter__()
            self.session = ClientSession(read_stream, write_stream)

            await self.session.initialize()
            self.context = context
            self.initialized = True

            print(f"[MCP Daemon] Session initialized", file=sys.stderr)
            null_stderr.close()

    async def list_tools(self) -> list:
        """List all tools."""
        await self.initialize()
        response = await self.session.list_tools()
        return [
            {"name": t.name, "description": t.description}
            for t in response.tools
        ]

    async def describe_tool(self, tool_name: str) -> Optional[dict]:
        """Describe a specific tool."""
        await self.initialize()
        response = await self.session.list_tools()

        for tool in response.tools:
            if tool.name == tool_name:
                return {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.inputSchema
                }
        return None

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Call a tool."""
        await self.initialize()
        response = await self.session.call_tool(tool_name, arguments)
        return response.content

    async def close(self):
        """Close the session."""
        async with self.lock:
            if self.session:
                try:
                    await self.session.close()
                except:
                    pass
                self.session = None
                self.context = None
                self.initialized = False


async def handle_client(mcp: McpSessionManager, conn: socket.socket):
    """Handle client connection."""
    try:
        # Receive request
        data = conn.recv(4096)
        if not data:
            return

        request = json.loads(data.decode('utf-8'))

        # Process request
        response = {"error": None, "result": None}

        try:
            if request.get("method") == "list":
                response["result"] = await mcp.list_tools()
            elif request.get("method") == "describe":
                tool = await mcp.describe_tool(request["params"]["tool"])
                if tool:
                    response["result"] = tool
                else:
                    response["error"] = "Tool not found"
            elif request.get("method") == "call":
                result = await mcp.call_tool(request["params"]["tool"], request["params"]["arguments"])

                # Format output
                output = ""
                if isinstance(result, list):
                    for item in result:
                        if hasattr(item, 'text'):
                            output += item.text
                        else:
                            output += json.dumps(item.__dict__ if hasattr(item, '__dict__') else item)
                else:
                    output = json.dumps(result)

                response["result"] = {"output": output}
            elif request.get("method") == "ping":
                response["result"] = {"status": "ok"}
            else:
                response["error"] = "Unknown method"

        except Exception as e:
            response["error"] = str(e)

        # Send response
        conn.sendall(json.dumps(response).encode('utf-8'))

    except Exception as e:
        print(f"[MCP Daemon] Error handling client: {e}", file=sys.stderr)
    finally:
        conn.close()


async def run_daemon(config: Dict[str, Any], socket_path: Path, timeout_minutes: int = 60):
    """Run MCP daemon."""
    # Remove existing socket
    if socket_path.exists():
        socket_path.unlink()

    # Create Unix domain socket
    server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server_socket.bind(str(socket_path))
    server_socket.listen(5)

    # Write PID
    pid_path = socket_path.parent / f"{socket_path.name}.pid"
    with open(pid_path, 'w') as f:
        f.write(str(os.getpid()))

    print(f"[MCP Daemon] Started on socket: {socket_path}", file=sys.stderr)
    print(f"[MCP Daemon] PID: {os.getpid()}", file=sys.stderr)

    # Initialize MCP session
    mcp = McpSessionManager(config)
    await mcp.initialize()

    # Activity tracking
    last_activity = time.time()
    timeout_seconds = timeout_minutes * 60

    # Start heartbeat checker
    async def heartbeat_checker():
        nonlocal last_activity
        while True:
            await asyncio.sleep(60)
            if time.time() - last_activity > timeout_seconds:
                print(f"[MCP Daemon] Timeout after {timeout_minutes} minutes", file=sys.stderr)
                break

    heartbeat_task = asyncio.create_task(heartbeat_checker())

    # Accept connections
    loop = asyncio.get_event_loop()

    def accept_connection():
        nonlocal last_activity
        while True:
            try:
                conn, _ = server_socket.accept()
                last_activity = time.time()
                asyncio.create_task(handle_client(mcp, conn))
            except:
                break

    # Run accept in thread
    import threading
    accept_thread = threading.Thread(target=accept_connection, daemon=True)
    accept_thread.start()

    # Keep alive
    try:
        while not heartbeat_task.done():
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        # Cleanup
        print("[MCP Daemon] Shutting down...", file=sys.stderr)
        server_socket.close()
        if socket_path.exists():
            socket_path.unlink()
        if pid_path.exists():
            pid_path.unlink()
        await mcp.close()
        print("[MCP Daemon] Stopped", file=sys.stderr)


def start_daemon(config_path: Path, socket_path: Optional[Path] = None, timeout_minutes: int = 60):
    """Start MCP daemon from config file."""
    with open(config_path) as f:
        config = json.load(f)

    if socket_path is None:
        socket_path = config_path.parent / ".mcp.sock"

    # Remove old socket
    if socket_path.exists():
        socket_path.unlink()

    asyncio.run(run_daemon(config, socket_path, timeout_minutes))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="MCP Daemon - Unix socket mode")
    parser.add_argument("--config", default="mcp-config.json", help="Path to mcp-config.json")
    parser.add_argument("--socket", help="Unix socket path")
    parser.add_argument("--timeout", type=int, default=60, help="Heartbeat timeout in minutes")

    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Error: Config not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    socket_path = Path(args.socket) if args.socket else None
    start_daemon(config_path, socket_path, args.timeout)