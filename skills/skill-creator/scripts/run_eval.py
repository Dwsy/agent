#!/usr/bin/env python3
"""Run trigger evaluation for a skill description using pi CLI.

Tests whether a skill's description causes Pi to read the skill for a set of
queries. Outputs results as JSON.
"""

import argparse
import json
import os
import select
import subprocess
import sys
import tempfile
import time
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from scripts.utils import parse_skill_md


def build_temp_skill(skill_name: str, description: str) -> tuple[Path, Path]:
    """Create a temporary skill directory with the given description."""
    root = Path(tempfile.mkdtemp(prefix="pi-skill-eval-"))
    skill_dir = root / skill_name
    skill_dir.mkdir(parents=True, exist_ok=True)

    desc_lines = description.splitlines() or [""]
    desc_block = "\n".join(f"  {line}" for line in desc_lines)

    content = (
        "---\n"
        f"name: {skill_name}\n"
        "description: |\n"
        f"{desc_block}\n"
        "---\n\n"
        f"# {skill_name}\n\n"
        "Temporary skill for trigger evaluation.\n"
    )
    (skill_dir / "SKILL.md").write_text(content)
    return root, skill_dir


def extract_json_event(line: str) -> dict | None:
    """Parse a JSONL event line, stripping any terminal noise."""
    if "{" not in line:
        return None
    payload = line[line.find("{"):].strip()
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def normalize_path(path_str: str, cwd: Path) -> Path:
    path = Path(path_str)
    if not path.is_absolute():
        path = (cwd / path).resolve()
    else:
        path = path.resolve()
    return path


def is_trigger_path(path_str: str, skill_dir: Path, runtime_cwd: Path) -> bool:
    if not path_str:
        return False
    try:
        resolved = normalize_path(path_str, runtime_cwd)
    except Exception:
        return False
    if resolved == skill_dir / "SKILL.md":
        return True
    try:
        return resolved.is_relative_to(skill_dir)
    except AttributeError:
        return str(resolved).startswith(str(skill_dir))


def detect_trigger_from_event(event: dict, skill_dir: Path, runtime_cwd: Path) -> bool:
    """Detect skill trigger by observing a read of SKILL.md or skill directory.

    Pi may read SKILL.md directly (absolute) or issue a read on the skill dir
    if it resolves relative paths. We treat any read under the skill directory
    as a trigger signal.
    """
    if event.get("type") not in {"tool_execution_start", "tool_execution_end"}:
        return False
    if event.get("toolName") != "read":
        return False
    args = event.get("args")
    if not isinstance(args, dict):
        return False
    path_str = args.get("path") or args.get("file_path")
    if not path_str:
        return False
    return is_trigger_path(path_str, skill_dir, runtime_cwd)


def run_single_query(
    query: str,
    skill_dir: str,
    timeout: int,
    runtime_cwd: str,
    model: str | None = None,
) -> bool:
    """Run a single query and return whether the skill was triggered."""
    skill_dir_path = Path(skill_dir).resolve()
    cwd_path = Path(runtime_cwd).resolve()

    system_prompt = (
        "You are running in skill-trigger evaluation mode. "
        "Do not perform tool calls or file operations. "
        "If the task matches any available skill, you MUST read its SKILL.md using the read tool. "
        "Otherwise respond normally without tool usage."
    )

    cmd = [
        "pi",
        "--mode", "json",
        "-p",
        "--no-session",
        "--no-skills",
        "--tools", "read",
        "--append-system-prompt", system_prompt,
        "--skill", str(skill_dir_path),
        query,
    ]
    if model:
        cmd.extend(["--models", model])

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        cwd=runtime_cwd,
    )

    buffer = ""
    start_time = time.time()

    try:
        while time.time() - start_time < timeout:
            if process.poll() is not None:
                remaining = process.stdout.read() if process.stdout else b""
                if remaining:
                    buffer += remaining.decode("utf-8", errors="replace")
                break

            ready, _, _ = select.select([process.stdout], [], [], 1.0)
            if not ready:
                continue

            chunk = os.read(process.stdout.fileno(), 8192)
            if not chunk:
                break
            buffer += chunk.decode("utf-8", errors="replace")

            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                event = extract_json_event(line)
                if not event:
                    continue
                if detect_trigger_from_event(event, skill_dir_path, cwd_path):
                    return True
                if event.get("type") == "agent_end":
                    return False
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

    return False


def run_eval(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    num_workers: int,
    timeout: int,
    runtime_cwd: Path,
    runs_per_query: int = 1,
    trigger_threshold: float = 0.5,
    model: str | None = None,
) -> dict:
    """Run the full eval set and return results."""
    results = []
    temp_root, temp_skill_dir = build_temp_skill(skill_name, description)

    try:
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            future_to_info = {}
            for item in eval_set:
                for run_idx in range(runs_per_query):
                    future = executor.submit(
                        run_single_query,
                        item["query"],
                        str(temp_skill_dir),
                        timeout,
                        str(runtime_cwd),
                        model,
                    )
                    future_to_info[future] = (item, run_idx)

            query_triggers: dict[str, list[bool]] = {}
            query_items: dict[str, dict] = {}
            for future in as_completed(future_to_info):
                item, _ = future_to_info[future]
                query = item["query"]
                query_items[query] = item
                if query not in query_triggers:
                    query_triggers[query] = []
                try:
                    query_triggers[query].append(future.result())
                except Exception as e:
                    print(f"Warning: query failed: {e}", file=sys.stderr)
                    query_triggers[query].append(False)

        for query, triggers in query_triggers.items():
            item = query_items[query]
            trigger_rate = sum(triggers) / len(triggers)
            should_trigger = item["should_trigger"]
            if should_trigger:
                did_pass = trigger_rate >= trigger_threshold
            else:
                did_pass = trigger_rate < trigger_threshold
            results.append({
                "query": query,
                "should_trigger": should_trigger,
                "trigger_rate": trigger_rate,
                "triggers": sum(triggers),
                "runs": len(triggers),
                "pass": did_pass,
            })
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    passed = sum(1 for r in results if r["pass"])
    total = len(results)

    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Run trigger evaluation for a skill description")
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--description", default=None, help="Override description to test")
    parser.add_argument("--num-workers", type=int, default=10, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout per query in seconds")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Number of runs per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Trigger rate threshold")
    parser.add_argument("--model", default=None, help="Model to use for pi -p (default: user's configured model)")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, original_description, _ = parse_skill_md(skill_path)
    description = args.description or original_description
    runtime_cwd = Path.cwd()

    if args.verbose:
        print(f"Evaluating: {description}", file=sys.stderr)

    output = run_eval(
        eval_set=eval_set,
        skill_name=name,
        description=description,
        num_workers=args.num_workers,
        timeout=args.timeout,
        runtime_cwd=runtime_cwd,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
    )

    if args.verbose:
        summary = output["summary"]
        print(f"Results: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        for r in output["results"]:
            status = "PASS" if r["pass"] else "FAIL"
            rate_str = f"{r['triggers']}/{r['runs']}"
            print(f"  [{status}] rate={rate_str} expected={r['should_trigger']}: {r['query'][:70]}", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
