#!/usr/bin/env python3
"""
MCP Client (Unix Socket)
========================
Client that communicates with MCP daemon via Unix socket.
"""

import json
import sys
import argparse
import subprocess
import time
import socket
from pathlib import Path
from typing import Dict, Any


class McpDaemonClient:
    """Client for MCP daemon (Unix socket)."""

    def __init__(self, socket_path: Path):
        self.socket_path = socket_path

    def is_running(self) -> bool:
        """Check if daemon is running."""
        pid_path = self.socket_path.parent / f"{self.socket_path.name}.pid"

        if not pid_path.exists():
            return False

        try:
            with open(pid_path) as f:
                pid = int(f.read().strip())

            # Check if process is alive
            os.kill(pid, 0)
            return True
        except (OSError, ValueError):
            return False

    def start_daemon(self, config_path: Path):
        """Start the daemon."""
        print("[MCP Client] Starting daemon...", file=sys.stderr)

        daemon_path = Path(__file__).parent / "daemon.py"
        log_path = config_path.parent / ".mcp-daemon.log"

        process = subprocess.Popen(
            [sys.executable, str(daemon_path), "--config", str(config_path), "--socket", str(self.socket_path)],
            stdout=open(log_path, 'w'),
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True
        )

        # Wait for daemon to start
        retries = 30
        while retries > 0:
            time.sleep(0.3)
            if self.is_running():
                print("[MCP Client] Daemon started", file=sys.stderr)
                return
            retries -= 1

        raise RuntimeError("Failed to start daemon")

    def ensure_daemon(self, config_path: Path):
        """Ensure daemon is running."""
        if not self.is_running():
            self.start_daemon(config_path)

    def _send_request(self, request: dict) -> dict:
        """Send request to daemon."""
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            sock.connect(str(self.socket_path))
            sock.sendall(json.dumps(request).encode('utf-8'))

            # Receive response
            data = sock.recv(65536)
            return json.loads(data.decode('utf-8'))
        finally:
            sock.close()

    def list_tools(self) -> list:
        """List all tools."""
        response = self._send_request({"method": "list"})
        if response.get("error"):
            raise RuntimeError(response["error"])
        return response["result"]

    def describe_tool(self, tool_name: str) -> dict:
        """Describe a tool."""
        response = self._send_request({
            "method": "describe",
            "params": {"tool": tool_name}
        })
        if response.get("error"):
            raise RuntimeError(response["error"])
        return response["result"]

    def call_tool(self, tool_name: str, arguments: dict) -> str:
        """Call a tool."""
        response = self._send_request({
            "method": "call",
            "params": {"tool": tool_name, "arguments": arguments}
        })
        if response.get("error"):
            raise RuntimeError(response["error"])
        return response["result"]["output"]

    def get_status(self) -> dict:
        """Get daemon status."""
        response = self._send_request({"method": "ping"})
        if response.get("error"):
            raise RuntimeError(response["error"])
        return {"status": "online", "running": True}


def run_cli():
    """Run CLI interface."""
    import os

    parser = argparse.ArgumentParser(
        description="MCP Client - Unix socket mode for session reuse"
    )
    parser.add_argument("--config", default="mcp-config.json", help="Path to mcp-config.json")
    parser.add_argument("--socket", help="Unix socket path")
    parser.add_argument("--list", action="store_true", help="List all tools")
    parser.add_argument("--describe", help="Describe a tool")
    parser.add_argument("--call", help="Call a tool (JSON)")
    parser.add_argument("--status", action="store_true", help="Show status")
    parser.add_argument("--no-daemon", action="store_true", help="Don't auto-start daemon")

    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Error: Config not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    socket_path = Path(args.socket) if args.socket else config_path.parent / ".mcp.sock"
    client = McpDaemonClient(socket_path)

    # Ensure daemon is running
    if not args.no_daemon:
        client.ensure_daemon(config_path)

    try:
        if args.list:
            tools = client.list_tools()
            print(json.dumps(tools, indent=2, ensure_ascii=False))

        elif args.describe:
            tool = client.describe_tool(args.describe)
            print(json.dumps(tool, indent=2, ensure_ascii=False))

        elif args.call:
            call_data = json.loads(args.call)
            output = client.call_tool(call_data["tool"], call_data["arguments"])
            print(output)

        elif args.status:
            status = client.get_status()
            print(json.dumps(status, indent=2, ensure_ascii=False))

        else:
            parser.print_help()

    except FileNotFoundError:
        print(f"Error: Daemon socket not found. Start with: python3 daemon.py --config {args.config}", file=sys.stderr)
        sys.exit(1)
    except ConnectionRefusedError:
        print(f"Error: Cannot connect to daemon. Daemon may have crashed.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    import os
    run_cli()