#!/usr/bin/env bun
/**
 * Evolution Workhub Integration
 * Helper scripts for creating evolution issues and PRs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const WORKHUB_PATH = "~/.pi/agent/skills/workhub/lib.ts";

/**
 * Create an evolution issue
 */
async function createEvolutionIssue(options: {
  title: string;
  content: string;
  category?: string;
}) {
  const { title, content, category = "evolution" } = options;

  // Create temp file for content
  const tempFile = `/tmp/evolution-issue-${Date.now()}.md`;
  writeFileSync(tempFile, content, "utf-8");

  try {
    // Run workhub create issue command
    const command = `bun ${WORKHUB_PATH} create issue "${title}" "${category}"`;
    console.log(`\n📝 Creating evolution issue...`);
    console.log(`📋 Title: ${title}`);
    console.log(`📂 Category: ${category}\n`);

    // Note: This would need to be executed by the user
    console.log(`\n🔧 Execute manually:\n`);
    console.log(`  cd $(pwd)`);
    console.log(`  ${command}`);
    console.log(`\n📄 Content saved to: ${tempFile}`);

    return tempFile;
  } catch (error) {
    console.error(`❌ Failed to create issue:`, error);
    throw error;
  }
}

/**
 * Create an evolution PR
 */
async function createEvolutionPR(options: {
  title: string;
  issueId?: string;
  changes: string[];
  category?: string;
}) {
  const { title, issueId, changes, category = "evolution" } = options;

  const content = formatPRContent({ title, issueId, changes });

  // Create temp file for content
  const tempFile = `/tmp/evolution-pr-${Date.now()}.md`;
  writeFileSync(tempFile, content, "utf-8");

  try {
    const command = `bun ${WORKHUB_PATH} create pr "${title}" "${category}"`;
    console.log(`\n📝 Creating evolution PR...`);
    console.log(`📋 Title: ${title}`);
    console.log(`🔗 Issue: #${issueId || "N/A"}`);
    console.log(`📂 Category: ${category}\n`);

    console.log(`\n🔧 Execute manually:\n`);
    console.log(`  cd $(pwd)`);
    console.log(`  ${command}`);
    console.log(`\n📄 Content saved to: ${tempFile}`);

    return tempFile;
  } catch (error) {
    console.error(`❌ Failed to create PR:`, error);
    throw error;
  }
}

/**
 * Format PR content
 */
function formatPRContent(options: {
  title: string;
  issueId?: string;
  changes: string[];
}): string {
  const { title, issueId, changes } = options;
  const date = new Date().toISOString().split('T')[0];

  let content = `# Evolution: ${title}\n\n`;
  content += `<!-- Evolution: ${date} -->\n\n`;

  if (issueId) {
    content += `## Related Issue\n#${issueId}\n\n`;
  }

  content += `## Changes\n`;
  changes.forEach(change => {
    content += `- [x] ${change}\n`;
  });
  content += `\n`;

  content += `## Files Changed\n`;
  content += `<!-- List modified files -->\n\n`;

  content += `## Testing\n`;
  content += `- [ ] Tested locally\n`;
  content += `- [ ] Verified accuracy\n`;
  content += `- [ ] Checked for side effects\n`;

  return content;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]) {
  const command = args[0];
  const options: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[++i];
      options[key] = value;
    }
  }

  return { command, options };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  switch (command) {
    case "create-issue":
      await createEvolutionIssue({
        title: options.title || "Evolution Update",
        content: options.content || "Evolution content",
        category: options.category
      });
      break;

    case "create-pr":
      await createEvolutionPR({
        title: options.title || "Evolution PR",
        issueId: options.issue,
        changes: options.changes?.split(",") || [],
        category: options.category
      });
      break;

    case "help":
    default:
      console.log(`
Evolution Workhub Integration

Commands:
  create-issue --title "TITLE" --content "CONTENT" [--category CATEGORY]
    Create an evolution issue in workhub

  create-pr --title "TITLE" [--issue ISSUE_ID] --changes "CHANGE1,CHANGE2" [--category CATEGORY]
    Create an evolution PR in workhub

Examples:
  bun lib.ts create-issue --title "Fix TypeScript error" --content "$(cat issue.md)"
  bun lib.ts create-pr --title "Update skill" --issue "123" --changes "Added pattern,Fixed error"
      `);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

export { createEvolutionIssue, createEvolutionPR };