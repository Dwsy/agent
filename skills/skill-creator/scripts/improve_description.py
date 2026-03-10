#!/usr/bin/env python3
"""Improve a skill description based on eval results.

Uses the Pi CLI to propose improved triggering text.
"""

import argparse
import json
import os
import re
import select
import subprocess
import sys
import time
from pathlib import Path

from scripts.utils import parse_skill_md


def resolve_model(default_model: str | None = None) -> str:
    """Resolve the model to use for description improvement."""
    env_model = os.environ.get("PI_MODEL") or os.environ.get("MODEL")
    if env_model:
        return env_model
    if default_model:
        return default_model
    return ""


def extract_json_event(line: str) -> dict | None:
    if "{" not in line:
        return None
    payload = line[line.find("{"):].strip()
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def extract_text(message: dict) -> str:
    parts = message.get("content", [])
    texts = [part.get("text", "") for part in parts if part.get("type") == "text"]
    return "".join(texts).strip()


def update_from_event(event: dict, last_text: str) -> str:
    if event.get("type") == "message_end":
        msg = event.get("message", {})
        if msg.get("role") == "assistant":
            text = extract_text(msg)
            return text or last_text

    if event.get("type") == "agent_end":
        for msg in reversed(event.get("messages", [])):
            if msg.get("role") == "assistant":
                text = extract_text(msg)
                if text:
                    return text
    return last_text


def run_pi_prompt(prompt: str, model: str | None, timeout: int = 120) -> str:
    cmd = ["pi", "--mode", "json", "-p", "--no-session", prompt]
    if model:
        cmd.extend(["--models", model])

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    buffer = ""
    last_text = ""
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
                last_text = update_from_event(event, last_text)
                if event.get("type") == "agent_end":
                    return last_text

        if buffer:
            event = extract_json_event(buffer)
            if event:
                last_text = update_from_event(event, last_text)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

    return last_text


def improve_description(
    skill_name: str,
    skill_content: str,
    current_description: str,
    eval_results: dict,
    history: list[dict],
    model: str,
    test_results: dict | None = None,
    log_dir: Path | None = None,
    iteration: int | None = None,
) -> str:
    """Use pi CLI to improve the description based on eval results."""
    failed_triggers = [
        r for r in eval_results["results"]
        if r["should_trigger"] and not r["pass"]
    ]
    false_triggers = [
        r for r in eval_results["results"]
        if not r["should_trigger"] and not r["pass"]
    ]

    train_score = f"{eval_results['summary']['passed']}/{eval_results['summary']['total']}"
    if test_results:
        test_score = f"{test_results['summary']['passed']}/{test_results['summary']['total']}"
        scores_summary = f"Train: {train_score}, Test: {test_score}"
    else:
        scores_summary = f"Train: {train_score}"

    prompt = f"""You are optimizing a Pi skill description for a skill called "{skill_name}". A Pi skill uses progressive disclosure: the name and description are visible when the model decides whether to load the skill, and the SKILL.md content is only read when it decides to use the skill.

The description appears in Pi's available skills list. The model decides whether to read the skill based solely on this description. Your goal is to write a description that triggers for relevant queries and avoids irrelevant ones.

Current description:
<current_description>
"{current_description}"
</current_description>

Current scores ({scores_summary}):
<scores_summary>
"""
    if failed_triggers:
        prompt += "FAILED TO TRIGGER (should have triggered but didn't):\n"
        for r in failed_triggers:
            prompt += f'  - "{r["query"]}" (triggered {r["triggers"]}/{r["runs"]} times)\n'
        prompt += "\n"

    if false_triggers:
        prompt += "FALSE TRIGGERS (triggered but shouldn't have):\n"
        for r in false_triggers:
            prompt += f'  - "{r["query"]}" (triggered {r["triggers"]}/{r["runs"]} times)\n'
        prompt += "\n"

    if history:
        prompt += "PREVIOUS ATTEMPTS (do NOT repeat these — try something structurally different):\n\n"
        for h in history:
            train_s = f"{h.get('train_passed', h.get('passed', 0))}/{h.get('train_total', h.get('total', 0))}"
            test_s = f"{h.get('test_passed', '?')}/{h.get('test_total', '?')}" if h.get('test_passed') is not None else None
            score_str = f"train={train_s}" + (f", test={test_s}" if test_s else "")
            prompt += f"<attempt {score_str}>\n"
            prompt += f"Description: \"{h['description']}\"\n"
            if "results" in h:
                prompt += "Train results:\n"
                for r in h["results"]:
                    status = "PASS" if r["pass"] else "FAIL"
                    prompt += f'  [{status}] "{r["query"][:80]}" (triggered {r["triggers"]}/{r["runs"]})\n'
            if h.get("note"):
                prompt += f"Note: {h['note']}\n"
            prompt += "</attempt>\n\n"

    prompt += f"""</scores_summary>

Skill content (for context on what the skill does):
<skill_content>
{skill_content}
</skill_content>

Based on the failures, write a new and improved description that is more likely to trigger correctly. Generalize from the failures — do NOT list a long set of specific queries. Keep the description under ~200 words to avoid bloating the prompt.

Tips:
- Use imperative phrasing (e.g., "Use this skill when...")
- Focus on user intent, not implementation details
- Make it distinctive so it stands out among other skills
- If repeated failures occur, change structure and wording

Respond with only the new description text in <new_description> tags.
"""

    response_text = run_pi_prompt(prompt, model or None)

    match = re.search(r"<new_description>(.*?)</new_description>", response_text, re.DOTALL)
    description = match.group(1).strip().strip('"') if match else response_text.strip().strip('"')
    if not description:
        description = current_description

    transcript: dict = {
        "iteration": iteration,
        "prompt": prompt,
        "response": response_text,
        "parsed_description": description,
        "char_count": len(description),
        "over_limit": len(description) > 1024,
    }

    if len(description) > 1024:
        shorten_prompt = (
            f"Your description is {len(description)} characters, which exceeds the hard 1024 character limit. "
            "Please rewrite it to be under 1024 characters while preserving the most important trigger words and intent coverage. "
            "Respond with only the new description in <new_description> tags."
        )
        shorten_response = run_pi_prompt(shorten_prompt, model or None)
        match = re.search(r"<new_description>(.*?)</new_description>", shorten_response, re.DOTALL)
        shortened = match.group(1).strip().strip('"') if match else shorten_response.strip().strip('"')
        if shortened:
            transcript["rewrite_prompt"] = shorten_prompt
            transcript["rewrite_response"] = shorten_response
            transcript["rewrite_description"] = shortened
            transcript["rewrite_char_count"] = len(shortened)
            description = shortened

    transcript["final_description"] = description

    if log_dir:
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / f"improve_iter_{iteration or 'unknown'}.json"
        log_file.write_text(json.dumps(transcript, indent=2))

    return description


def main():
    parser = argparse.ArgumentParser(description="Improve a skill description based on eval results")
    parser.add_argument("--eval-results", required=True, help="Path to eval results JSON (from run_eval.py)")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--history", default=None, help="Path to history JSON (previous attempts)")
    parser.add_argument("--model", default=None, help="Model for improvement")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()

    skill_path = Path(args.skill_path)
    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    eval_results = json.loads(Path(args.eval_results).read_text())
    history = []
    if args.history:
        history = json.loads(Path(args.history).read_text())

    name, _, content = parse_skill_md(skill_path)
    current_description = eval_results["description"]

    model = resolve_model(args.model)

    if args.verbose:
        print(f"Current: {current_description}", file=sys.stderr)
        print(f"Score: {eval_results['summary']['passed']}/{eval_results['summary']['total']}", file=sys.stderr)
        print(f"Model: {model or '(default)'}", file=sys.stderr)

    new_description = improve_description(
        skill_name=name,
        skill_content=content,
        current_description=current_description,
        eval_results=eval_results,
        history=history,
        model=model,
    )

    if args.verbose:
        print(f"Improved: {new_description}", file=sys.stderr)

    output = {
        "description": new_description,
        "history": history + [{
            "description": current_description,
            "passed": eval_results["summary"]["passed"],
            "failed": eval_results["summary"]["failed"],
            "total": eval_results["summary"]["total"],
            "results": eval_results["results"],
        }],
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
