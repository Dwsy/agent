#!/usr/bin/env bun

/**
 * Tree View CLI
 *
 * Provides directory tree display functionality using fd + Python3.
 *
 * Usage:
 *   bun cli.ts                    # Show 2 levels (default)
 *   DEPTH=3 bun cli.ts            # Show 3 levels
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const depth = process.env.DEPTH || "2";

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
	// Write script to temp file
	const tempFile = join(tmpdir(), `tree-view-${Date.now()}.py`);
	writeFileSync(tempFile, pythonScript, "utf8");

	// Execute
	const result = execSync(`DEPTH=${depth} python3 "${tempFile}"`, {
		encoding: "utf8",
	});
	console.log(result);

	// Cleanup
	unlinkSync(tempFile);
} catch (error) {
	console.error("Error:", (error as Error).message);
	process.exit(1);
}