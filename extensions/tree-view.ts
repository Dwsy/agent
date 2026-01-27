/**
 * Tree View Extension
 *
 * Provides directory tree display functionality using fd + Python3.
 *
 * Features:
 * - Default to 2 levels of depth (configurable via DEPTH variable)
 * - Automatically respect .gitignore
 * - Truncate long filenames (>30 chars)
 * - Proper tree formatting with ├── and └──
 * - Directories show "/" suffix
 * - UTF-8 safe (no garbled Chinese characters)
 * - **Injects actual directory tree into system prompt**
 *
 * @module tree-view
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function getTreeOutput(depth: number = 2): string {
	const pythonScript = `import os
import subprocess

# 获取目录列表以判断是否是目录
depth = os.environ.get('DEPTH', '2')
dirs_result = subprocess.run(['fd', '-t', 'd', '-d', depth], capture_output=True, text=True)
dirs = set(line.rstrip('/') for line in dirs_result.stdout.strip().split('\\n') if line)

# 处理文件列表
files_result = subprocess.run(['fd', '-d', depth], capture_output=True, text=True)
root = {}
children = {}

for line in files_result.stdout.strip().split('\\n'):
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
        for i, (name, is_dir) in enumerate(items):
            suffix = '/' if is_dir else ''
            if len(name) > 30:
                name = f"{name[:10]}...{name[-7:]}"
            if i == len(items) - 1:
                print(f"└── {name}{suffix}")
            else:
                print(f"├── {name}{suffix}")
`;

	try {
		const tempFile = join(tmpdir(), `tree-view-${Date.now()}.py`);
		writeFileSync(tempFile, pythonScript, "utf8");

		const result = execSync(`DEPTH=${depth} python3 "${tempFile}"`, {
			encoding: "utf8",
			cwd: process.cwd(),
		});

		unlinkSync(tempFile);
		return result.trim();
	} catch (error) {
		return `Error generating tree: ${(error as Error).message}`;
	}
}

const TREE_DEPTH = parseInt(process.env.TREE_DEPTH || "2", 10);
const treeOutput = getTreeOutput(TREE_DEPTH);

const TREE_VIEW_INJECTION = `
## Current working directory

\`\`\`
${treeOutput}
\`\`\`
`;

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\n${TREE_VIEW_INJECTION}`,
		};
	});
}