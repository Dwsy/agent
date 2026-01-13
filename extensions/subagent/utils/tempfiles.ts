/**
 * Temporary file management
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface TempFileResult {
	dir: string;
	filePath: string;
}

export function writePromptToTempFile(agentName: string, prompt: string): TempFileResult {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, filePath };
}

export function cleanupTempFiles(tmpPromptPath: string | null, tmpPromptDir: string | null): void {
	if (tmpPromptPath) {
		try {
			fs.unlinkSync(tmpPromptPath);
		} catch {
			/* ignore */
		}
	}
	if (tmpPromptDir) {
		try {
			fs.rmdirSync(tmpPromptDir);
		} catch {
			/* ignore */
		}
	}
}