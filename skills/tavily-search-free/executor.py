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
import hashlib
import re
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from dotenv import load_dotenv
import os

# Import stats manager
try:
    from stats_manager import MCPStatsManager, init_stats_manager, get_stats_manager
    HAS_STATS = True
except ImportError:
    HAS_STATS = False


# 鉴权/配额类失败状态码：命中即切换下一个 Key
QUOTA_STATUSES = {401, 403, 429, 432}
SKILL_DIR = Path(__file__).parent
KEY_STATE_FILE = SKILL_DIR / '.mcp.keystate.json'
USAGE_TTL_SECONDS = 600
USAGE_ENDPOINT = 'https://api.tavily.com/usage'


def _fingerprint(key: str) -> str:
    """Key 指纹，用于缓存健康状态而不落明文"""
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def mask_key(key: str) -> str:
    return f"{key[:10]}...{key[-4:]}"


def _load_env_keys() -> list[str]:
    """从 .env 读取逗号分隔的 Key 列表（去重、去空）"""
    load_dotenv(SKILL_DIR / '.env')
    raw = os.getenv('TAVILY_API_KEY', '')
    keys: list[str] = []
    for item in raw.split(','):
        key = item.strip().strip('"').strip("'")
        if key and key not in keys:
            keys.append(key)
    return keys


class KeyPool:
    """多 Key 轮换池。

    选取顺序：轮换指针起、跳过已耗尽/鉴权的 Key；工具调用命中
    401/403/429/432 时标记该 Key 并自动切换到下一个。
    """

    def __init__(self):
        self.keys = _load_env_keys()
        self.index = 0
        self.health: Dict[str, Dict[str, Any]] = {}
        self._load_cache()

    def _load_cache(self) -> None:
        """恢复健康状态与轮换指针，使多次调用仍能跨进程轮换"""
        if not KEY_STATE_FILE.exists():
            return
        try:
            payload = json.loads(KEY_STATE_FILE.read_text())
        except json.JSONDecodeError:
            return
        if not isinstance(payload, dict):
            return
        health = payload.get('keys')
        if isinstance(health, dict):
            self.health = health
        index = payload.get('index')
        if isinstance(index, int) and self.keys:
            self.index = index % len(self.keys)

    def _save_cache(self) -> None:
        KEY_STATE_FILE.write_text(json.dumps({'index': self.index, 'keys': self.health}, indent=2))
        KEY_STATE_FILE.chmod(0o600)

    def _entry(self, key: str) -> Dict[str, Any]:
        return self.health.setdefault(_fingerprint(key), {})

    def key_count(self) -> int:
        return len(self.keys)

    def is_exhausted(self, key: str) -> bool:
        entry = self._entry(key)
        limit = entry.get('plan_limit')
        used = entry.get('plan_usage')
        return isinstance(limit, int) and isinstance(used, int) and limit > 0 and used >= limit

    def is_blocked(self, key: str) -> bool:
        return bool(self._entry(key).get('bad_reason')) or self.is_exhausted(key)

    def candidates(self) -> list[str]:
        """从轮换指针起返回可用 Key；全被标记时仍返回全部以拿真实错误"""
        n = len(self.keys)
        if n == 0:
            raise ValueError('No API keys configured: set TAVILY_API_KEY in .env')
        ordered = [self.keys[(self.index + i) % n] for i in range(n)]
        return [k for k in ordered if not self.is_blocked(k)] or ordered

    def advance(self) -> None:
        self.index = (self.index + 1) % max(len(self.keys), 1)
        self._save_cache()

    def mark_ok(self, key: str) -> None:
        entry = self._entry(key)
        entry.pop('bad_reason', None)
        entry.pop('bad_at', None)
        self._save_cache()

    def mark_bad(self, key: str, status: int, detail: str) -> None:
        entry = self._entry(key)
        entry['bad_reason'] = f'{status}: {detail[:160]}'
        entry['bad_at'] = time.time()
        self._save_cache()

    async def refresh_usage(self, force: bool = False) -> None:
        """用 /usage 探测剩余额度（免费，不消耗 credit），供轮换时跳过已耗尽 Key"""
        now = time.time()
        async with httpx.AsyncClient(timeout=15.0) as client:
            for key in self.keys:
                entry = self._entry(key)
                if not force and now - entry.get('checked_at', 0) < USAGE_TTL_SECONDS:
                    continue
                try:
                    resp = await client.get(
                        USAGE_ENDPOINT,
                        headers={'Authorization': f'Bearer {key}'},
                    )
                    payload = resp.json()
                except (httpx.HTTPError, json.JSONDecodeError) as exc:
                    entry['checked_at'] = now
                    entry['usage_error'] = str(exc)[:120]
                    continue
                entry['checked_at'] = now
                entry.pop('usage_error', None)
                if resp.status_code == 200 and 'account' in payload:
                    account = payload['account']
                    entry['plan'] = account.get('current_plan')
                    entry['plan_usage'] = account.get('plan_usage')
                    entry['plan_limit'] = account.get('plan_limit')
                    entry['search_usage'] = account.get('search_usage')
                    entry['research_usage'] = account.get('research_usage')
                else:
                    entry['bad_reason'] = f"{resp.status_code}: {json.dumps(payload)[:160]}"
                    entry['bad_at'] = now
        self._save_cache()

    def describe(self) -> list[Dict[str, Any]]:
        rows = []
        for i, key in enumerate(self.keys):
            entry = self.health.get(_fingerprint(key), {})
            rows.append({
                'index': i,
                'key': mask_key(key),
                'plan': entry.get('plan'),
                'usage': f"{entry.get('plan_usage')}/{entry.get('plan_limit')}",
                'search_usage': entry.get('search_usage'),
                'research_usage': entry.get('research_usage'),
                'state': 'exhausted' if self.is_exhausted(key) else ('blocked' if entry.get('bad_reason') else 'ready'),
                'reason': entry.get('bad_reason'),
                'checked_at': entry.get('checked_at'),
            })
        return rows


# 全局轮换池实例
_pool = KeyPool()


async def list_tools(config):
    """List tools from MCP server."""
    transport = config.get("transport", "stdio")

    if transport == "stdio":
        return await list_tools_stdio(config)
    elif transport == "sse":
        return await list_tools_sse(config)
    elif transport == "http":
        return await list_tools_http(config)
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
    """List tools from SSE/HTTP MCP server (Tavily-style)."""
    result = await http_sse_request(config, "tools/list")
    if "result" in result and "tools" in result["result"]:
        return [
            {"name": t["name"], "description": t.get("description", "")}
            for t in result["result"]["tools"]
        ]
    return []


async def list_tools_http(config):
    """List tools from HTTP MCP server."""
    import httpx

    endpoint = config.get("endpoint")
    if not endpoint:
        raise ValueError("HTTP transport requires 'endpoint' in config")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            json={
                "jsonrpc": "2.0",
                "id": str(uuid.uuid4()),
                "method": "tools/list"
            },
            headers={"Content-Type": "application/json"}
        )
        result = response.json()
        if "result" in result and "tools" in result["result"]:
            return [
                {"name": t["name"], "description": t.get("description", "")}
                for t in result["result"]["tools"]
            ]
        return []


def _detect_quota_failure(payload: Any, http_status: int) -> tuple[Optional[int], str]:
    """识别鉴权/配额失败并返回 (status, detail)。

    Tavily 托管 MCP 把搜索错误包在 result.content[].text 的 JSON 里，
    所以除了 HTTP 状态码还要下钻一层。
    """
    if http_status in QUOTA_STATUSES:
        return http_status, json.dumps(payload)[:300]
    if not isinstance(payload, dict):
        return None, ''
    if 'error' in payload and 'result' not in payload:
        return http_status or 0, json.dumps(payload['error'])[:300]
    for item in (payload.get('result') or {}).get('content') or []:
        text = item.get('text') if isinstance(item, dict) else None
        if not text:
            continue
        try:
            inner = json.loads(text)
        except json.JSONDecodeError:
            continue
        status = inner.get('status')
        if isinstance(status, int) and status in QUOTA_STATUSES:
            detail = inner.get('detail') or {}
            message = detail.get('error') if isinstance(detail, dict) else str(detail)
            return status, str(message or inner.get('error'))
    return None, ''


async def http_sse_request(config, method, params=None):
    """对托管 MCP 端点发 JSON-RPC 请求，遇鉴权/配额错自动切换下一个 Key。"""
    endpoint_template = config.get("endpoint")
    if not endpoint_template:
        raise ValueError("SSE transport requires 'endpoint' in config")

    await _pool.refresh_usage()

    request_body = {"jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": method}
    if params:
        request_body["params"] = params

    failures: list[str] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        for key in _pool.candidates():
            endpoint = re.sub(r'tavilyApiKey=[^&]+', f'tavilyApiKey={key}', endpoint_template)
            try:
                response = await client.post(
                    endpoint,
                    json=request_body,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream",
                    },
                )
            except httpx.HTTPError as exc:
                failures.append(f"{mask_key(key)}: network {exc}")
                continue

            if "text/event-stream" in response.headers.get("content-type", ""):
                payload = parse_sse_response(response.text)
            else:
                try:
                    payload = response.json()
                except json.JSONDecodeError:
                    failures.append(f"{mask_key(key)}: non-JSON {response.status_code}")
                    continue

            status, detail = _detect_quota_failure(payload, response.status_code)
            if status is not None:
                _pool.mark_bad(key, status, detail)
                failures.append(f"{mask_key(key)}: {status} {detail[:80]}")
                continue

            _pool.mark_ok(key)
            _pool.advance()
            return payload

    raise RuntimeError("All Tavily keys unavailable -> " + " | ".join(failures))


def parse_sse_response(text: str) -> dict:
    """Parse SSE formatted response."""
    result = {}
    for line in text.strip().split('\n'):
        line = line.strip()
        if line.startswith('event:'):
            event_type = line[6:].strip()
        elif line.startswith('data:'):
            data = line[5:].strip()
            try:
                result = json.loads(data)
            except json.JSONDecodeError:
                pass
    return result


async def describe_tool(config, tool_name):
    """Describe a specific tool."""
    transport = config.get("transport", "stdio")

    if transport == "stdio":
        return await describe_tool_stdio(config, tool_name)
    elif transport == "sse":
        return await describe_tool_sse(config, tool_name)
    elif transport == "http":
        return await describe_tool_http(config, tool_name)
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
    # Get full tool list with schemas
    result = await http_sse_request(config, "tools/list")
    if "result" in result and "tools" in result["result"]:
        for t in result["result"]["tools"]:
            if t["name"] == tool_name:
                return {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}})
                }
    return None


async def describe_tool_http(config, tool_name):
    """Describe a tool from HTTP MCP server."""
    import httpx

    endpoint = config.get("endpoint")
    if not endpoint:
        raise ValueError("HTTP transport requires 'endpoint' in config")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            json={
                "jsonrpc": "2.0",
                "id": str(uuid.uuid4()),
                "method": "tools/list"
            },
            headers={"Content-Type": "application/json"}
        )
        result = response.json()
        if "result" in result and "tools" in result["result"]:
            for t in result["result"]["tools"]:
                if t["name"] == tool_name:
                    return {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}})
                    }
    return None


async def call_tool(config, tool_name, arguments):
    """Call a specific tool."""
    transport = config.get("transport", "stdio")

    if transport == "stdio":
        return await call_tool_stdio(config, tool_name, arguments)
    elif transport == "sse":
        return await call_tool_sse(config, tool_name, arguments)
    elif transport == "http":
        return await call_tool_http(config, tool_name, arguments)
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
    result = await http_sse_request(config, "tools/call", {
        "name": tool_name,
        "arguments": arguments
    })

    if "result" in result:
        content = result["result"].get("content", [])
        return content
    elif "error" in result:
        raise RuntimeError(f"MCP error: {result['error']}")
    else:
        return [{"text": json.dumps(result)}]


async def call_tool_http(config, tool_name, arguments):
    """Call a tool from HTTP MCP server."""
    import httpx

    endpoint = config.get("endpoint")
    if not endpoint:
        raise ValueError("HTTP transport requires 'endpoint' in config")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            json={
                "jsonrpc": "2.0",
                "id": str(uuid.uuid4()),
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments
                }
            },
            headers={"Content-Type": "application/json"}
        )
        result = response.json()

        if "result" in result:
            content = result["result"].get("content", [])
            return content
        elif "error" in result:
            raise RuntimeError(f"MCP error: {result['error']}")
        else:
            return [{"text": json.dumps(result)}]


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
  sse - Server-Sent Events (HTTP with SSE response)
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
    parser.add_argument("--key-status", action="store_true", help="Show API key rotation status")
    parser.add_argument("--refresh", action="store_true", help="Force refresh key usage from Tavily")
    parser.add_argument("--session", help="Set session name for stats tracking")
    parser.add_argument("--version", action="version", version="%(prog)s 5.0.0")

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
                    elif isinstance(item, dict) and 'text' in item:
                        print(item['text'])
                    else:
                        print(json.dumps(item, indent=2) if isinstance(item, dict) else str(item))
            else:
                print(json.dumps(result, indent=2) if isinstance(result, dict) else str(result))

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

        elif args.key_status:
            await _pool.refresh_usage(force=args.refresh)
            key_info = {
                "total_keys": _pool.key_count(),
                "active_index": _pool.index,
                "keys": _pool.describe(),
            }
            print(json.dumps(key_info, indent=2, ensure_ascii=False))

        elif args.session:
            # 设置会话名称
            if HAS_STATS:
                stats_manager = get_stats_manager()
                stats_manager.set_session_name(args.session)
                print(f"Session name set to: {args.session}")
            else:
                print("Stats tracking not available", file=sys.stderr)

        else:
            parser.print_help()

        # Explicitly flush
        sys.stdout.flush()
        sys.stderr.flush()

    except RuntimeError as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(2)
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
