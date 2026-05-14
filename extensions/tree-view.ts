/**
 * Tree View Extension
 *
 * Provides directory tree display functionality using fd + Python3.
 *
 * Features:
 * - Default to 2 levels of depth (configurable via DEPTH variable)
 * - Automatically respect .gitignore
 * - Truncate long filenames (>30 chars)
 * - Compact 2-level tree output
 * - Directories show "/" suffix
 * - UTF-8 safe (no garbled Chinese characters)
 * - **Injects actual directory tree into system prompt**
 *
 * @module tree-view
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";

const MAX_SECOND_LEVEL_ITEMS = parseInt(process.env.TREE_VIEW_MAX_SECOND_LEVEL_ITEMS || "50", 10);

function getTreeOutput(depth: number = 2): string {
	const safeDepth = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 2;
	const safeMaxItems = Number.isFinite(MAX_SECOND_LEVEL_ITEMS) && MAX_SECOND_LEVEL_ITEMS > 0 ? MAX_SECOND_LEVEL_ITEMS : 50;
	const pythonScript = `import os
import subprocess


def safe_run(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True)
        return result.stdout if result.returncode == 0 else ''
    except Exception:
        return ''


def short_name(name):
    return f"{name[:10]}...{name[-7:]}" if len(name) > 30 else name


# 获取目录列表以判断是否是目录
depth = os.environ.get('DEPTH', '2')
max_items = int(os.environ.get('MAX_SECOND_LEVEL_ITEMS', '50'))
dirs_output = safe_run(['fd', '-t', 'd', '-d', depth])
dirs = set(line.rstrip('/') for line in dirs_output.strip().split('\\n') if line)

# 处理文件列表
files_output = safe_run(['fd', '-d', depth])
root = {}
children = {}

for line in files_output.strip().split('\\n'):
    if not line:
        continue
    path = line.rstrip('/')
    parts = path.split('/')

    if len(parts) == 1:
        root[parts[0]] = (parts[0] in dirs)
    elif len(parts) == 2:
        parent, name = parts
        if parent not in children:
            children[parent] = []
        is_dir = (f"{parent}/{name}" in dirs)
        children[parent].append((name, is_dir))

# 输出结果
for path in sorted(root.keys()):
    is_dir = root[path]
    print(f"{path}/" if is_dir else path)

    if path in children:
        items = children[path]
        visible_items = items[:max_items]
        hidden_count = max(0, len(items) - len(visible_items))

        for i, (name, is_dir) in enumerate(visible_items):
            suffix = '/' if is_dir else ''
            print(f" {short_name(name)}{suffix}")

        if hidden_count > 0:
            print(f" +{hidden_count}")
`;

	const tempFile = join(tmpdir(), `tree-view-${Date.now()}.py`);

	try {
		writeFileSync(tempFile, pythonScript, "utf8");

		const result = execSync(`python3 "${tempFile}"`, {
			encoding: "utf8",
			cwd: process.cwd(),
			env: {
				...process.env,
				DEPTH: String(safeDepth),
				MAX_SECOND_LEVEL_ITEMS: String(safeMaxItems),
			},
		});

		return result.trim() || "(tree unavailable)";
	} catch {
		return "(tree unavailable)";
	} finally {
		if (existsSync(tempFile)) {
			try {
				unlinkSync(tempFile);
			} catch {
				// ignore cleanup errors
			}
		}
	}
}

const TREE_DEPTH = parseInt(process.env.TREE_DEPTH || "2", 10);
const isHomeDir = process.cwd() === homedir();
const treeOutput = isHomeDir ? "" : getTreeOutput(TREE_DEPTH);

const TREE_VIEW_INJECTION = treeOutput ? `\ncwd:\n${treeOutput}\n` : "";

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
		const systemPrompt = TREE_VIEW_INJECTION 
			? `${event.systemPrompt}\n\n${TREE_VIEW_INJECTION}`
			: event.systemPrompt;
		return { systemPrompt };
	});
}