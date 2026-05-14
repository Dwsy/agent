#!/usr/bin/env python3
"""
从 SQLite session DB 恢复 JSONL 会话文件。
DB 只存摘要（纯文本），不含 tool calls / thinking 等富结构。
恢复的 JSONL 是简化版，但能被 pi 识别和加载。

用法: python3 recover-sessions.py <db_path> <output_dir> [--dry-run] [--limit N]
"""

import sqlite3
import json
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
from collections import defaultdict


def parse_args():
    p = argparse.ArgumentParser(description="Recover JSONL sessions from SQLite DB")
    p.add_argument("db", help="Path to SQLite database")
    p.add_argument("output", help="Output directory for JSONL files")
    p.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    p.add_argument("--limit", type=int, default=0, help="Max sessions to recover (0=all)")
    p.add_argument("--skip-existing", action="store_true", help="Skip if JSONL already exists")
    return p.parse_args()


def get_sessions(db_path):
    """Fetch all sessions ordered by created time."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT id, path, cwd, name, created, modified, message_count
        FROM sessions ORDER BY created
    """).fetchall()
    conn.close()
    return rows


def get_entries(db_path, session_path):
    """Fetch message entries for a session, ordered by timestamp."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT id, entry_id, role, source_type, content, timestamp
        FROM message_entries
        WHERE session_path = ?
        ORDER BY timestamp
    """, (session_path,)).fetchall()
    conn.close()
    return rows


def build_jsonl(session, entries):
    """Build JSONL lines from session + entries."""
    lines = []
    session_id = session["id"]
    created = session["created"]
    cwd = session["cwd"]

    # 1. Session header
    header = {
        "type": "session",
        "version": 3,
        "id": session_id,
        "timestamp": created,
        "cwd": cwd,
    }
    lines.append(json.dumps(header, ensure_ascii=False))

    # 2. Message entries
    prev_id = None
    for entry in entries:
        entry_id = entry["entry_id"]
        role = entry["role"]
        source_type = entry["source_type"]
        content = entry["content"] or ""
        timestamp = entry["timestamp"]

        # Normalize timestamp to ISO format with Z
        ts_z = timestamp
        if "+" in timestamp:
            ts_z = timestamp.split("+")[0] + "Z"
        elif not timestamp.endswith("Z"):
            ts_z = timestamp + "Z"

        if source_type == "label":
            # Labels become custom_message entries
            obj = {
                "type": "custom_message",
                "id": entry_id,
                "parentId": prev_id,
                "timestamp": ts_z,
                "customType": "label",
                "content": content,
            }
            lines.append(json.dumps(obj, ensure_ascii=False))
            prev_id = entry_id
            continue

        if not content:
            # Skip empty entries (tool-only turns with stripped text)
            continue

        # Build message content array
        content_parts = [{"type": "text", "text": content}]

        msg = {
            "type": "message",
            "id": entry_id,
            "parentId": prev_id,
            "timestamp": ts_z,
            "message": {
                "role": role,
                "content": content_parts,
                "timestamp": _parse_ts_ms(timestamp),
            },
        }
        lines.append(json.dumps(msg, ensure_ascii=False))
        prev_id = entry_id

    return lines


def _parse_ts_ms(ts_str):
    """Convert ISO timestamp string to epoch milliseconds."""
    try:
        # Strip timezone offset for parsing
        clean = ts_str
        for c in ["+", "Z"]:
            if c in clean:
                clean = clean[:clean.index(c)]
        # Handle nanosecond precision by truncating to microseconds
        if "." in clean:
            base, frac = clean.split(".")
            frac = frac[:6]  # max 6 digits for microseconds
            clean = f"{base}.{frac}"
        dt = datetime.fromisoformat(clean)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def main():
    args = parse_args()
    db_path = os.path.expanduser(args.db)
    output_dir = os.path.expanduser(args.output)

    if not os.path.exists(db_path):
        print(f"❌ DB not found: {db_path}")
        sys.exit(1)

    sessions = get_sessions(db_path)
    total = len(sessions)
    if args.limit > 0:
        sessions = sessions[:args.limit]

    print(f"📊 DB has {total} sessions, processing {len(sessions)}")

    os.makedirs(output_dir, exist_ok=True)
    recovered = 0
    skipped = 0
    errors = 0
    total_entries = 0

    for i, sess in enumerate(sessions):
        session_path = sess["path"]
        sess_id = sess["id"]

        # Derive output path from session path
        # Original: /Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu--/xxx.jsonl
        # We replicate the same structure under output_dir
        rel_path = session_path.lstrip("/")
        # Remove the home prefix to make it relative
        home = os.path.expanduser("~")
        if rel_path.startswith(home.lstrip("/")):
            rel_path = rel_path[len(home.lstrip("/")):]
        rel_path = rel_path.lstrip("/")

        out_path = os.path.join(output_dir, rel_path)

        if args.skip_existing and os.path.exists(out_path):
            skipped += 1
            continue

        entries = get_entries(db_path, session_path)

        if not entries:
            skipped += 1
            continue

        jsonl_lines = build_jsonl(sess, entries)

        if args.dry_run:
            print(f"  [{i+1}/{len(sessions)}] {os.path.basename(session_path)}: {len(entries)} entries → {len(jsonl_lines)} lines")
            total_entries += len(entries)
            recovered += 1
            continue

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            for line in jsonl_lines:
                f.write(line + "\n")

        total_entries += len(entries)
        recovered += 1

        if (i + 1) % 100 == 0:
            print(f"  [{i+1}/{len(sessions)}] recovered {recovered} sessions...")

    print(f"\n✅ Done!")
    print(f"   Sessions: {recovered} recovered, {skipped} skipped, {errors} errors")
    print(f"   Total entries: {total_entries}")
    print(f"   Output: {output_dir}")


if __name__ == "__main__":
    main()
