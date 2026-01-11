#!/usr/bin/env bun
/**
 * MCP to Skill Converter (uv-managed)
 * ===================================
 * Converts any MCP server configuration into a Claude Skill with uv-managed Python executor.
 */

import { $ } from 'bun'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface MCPConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface ConvertOptions {
  mcpConfig: string
  outputDir?: string
  install?: boolean
}

interface SkillInfo {
  name: string
  path: string
  tools?: any[]
  contextSaved?: string
}

/**
 * Read MCP configuration from JSON file
 */
async function readMCPConfig(configPath: string): Promise<MCPConfig> {
  const content = readFileSync(configPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Generate SKILL.md content
 */
function generateSkillMD(name: string, tools: any[], transport: string = 'stdio'): string {
  const toolList = tools.map(t => `**\`${t.name}\`** - ${t.description.split('\n')[0]}`).join('\n')

  const transportInfo = {
    stdio: 'Standard Input/Output',
    sse: 'Server-Sent Events (HTTP)',
    http: 'HTTP Polling'
  }[transport] || transport

  return `---
name: ${name}
description: Dynamic access to ${name} MCP server (${tools.length} tools, transport: ${transport})
---

# ${name} Skill

This skill provides dynamic access to the ${name} MCP server with progressive disclosure loading.

## Transport Protocol

**Protocol**: ${transportInfo} (${transport})

${transport === 'sse' ? `
### SSE Connection Details

This skill uses Server-Sent Events (SSE) to communicate with the MCP server:

1. Connects to the SSE endpoint
2. Listens for \`endpoint\` event to get postUrl
3. Sends JSON-RPC requests via HTTP POST
4. Receives responses via SSE messages

` : ''}

## Context Efficiency

Traditional MCP approach:
- All ${tools.length} tools loaded at startup
- Estimated context: ${tools.length * 500} tokens

This skill approach:
- Metadata only: ~150 tokens
- Full instructions (when used): ~5k tokens
- Tool execution: 0 tokens (runs externally)

## Available Tools

${toolList}

## Usage Pattern

When the user's request matches this skill's capabilities:

**Step 1: Identify the right tool** from the list above

**Step 2: Generate a tool call** in this JSON format:

\`\`\`json
{
  "tool": "tool_name",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`

**Step 3: Execute via bash:**

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --call 'YOUR_JSON_HERE'
\`\`\`

⚠️ **重要**: Replace $SKILL_DIR with the actual discovered path of this skill directory.

## Getting Tool Details

If you need detailed information about a specific tool's parameters:

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --describe tool_name
\`\`\`

## Examples

### Example 1: List all tools

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --list
\`\`\`

### Example 2: Describe a tool

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --describe tool_name
\`\`\`

### Example 3: Call a tool

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --call '{"tool": "tool_name", "arguments": {"param1": "value"}}'
\`\`\`

### Example 4: Show status

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --status
\`\`\`

### Example 5: Show statistics

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --stats
\`\`\`

### Example 6: Show recent logs

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --logs 50
\`\`\`

### Example 7: Filter logs by tool

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --logs 100 --tool tool_name
\`\`\`

### Example 8: Reset statistics

\`\`\`bash
cd $SKILL_DIR
uv run executor.py --reset-stats
\`\`\`

## Error Handling

If the executor returns an error:
- Check the tool name is correct
- Verify required arguments are provided
- Ensure the MCP server is accessible
- Check API keys in mcp-config.json

## Performance Notes

Context usage comparison:

| Scenario | MCP (preload) | Skill (dynamic) |
|----------|---------------|-----------------|
| Idle | ${tools.length * 500} tokens | 150 tokens |
| Active | ${tools.length * 500} tokens | 5k tokens |
| Executing | ${tools.length * 500} tokens | 0 tokens |

Savings: ~${Math.round((1 - 5000 / (tools.length * 500)) * 100)}% reduction in typical usage

---

*This skill was auto-generated from MCP server configuration*
*Generator: mcp-to-skill (uv-managed)*
`
}

/**
 * Generate pyproject.toml for uv
 */
function generatePyprojectToml(name: string, transport: string = 'stdio'): string {
  const deps = transport === 'stdio'
    ? '    "mcp>=1.0.0",'
    : '    "mcp>=1.0.0",\n    "httpx>=0.25.0",'

  return `[project]
name = "${name}-executor"
version = "1.0.0"
description = "MCP executor for ${name} skill (${transport})"
requires-python = ">=3.10"
dependencies = [
${deps}
]
`
}

/**
 * Copy template files to skill directory
 */
function copyTemplateFiles(skillDir: string, config: MCPConfig): void {
  const templateDir = path.join(__dirname, 'templates')
  const transport = config.transport || 'stdio'

  // Copy executor.py
  const executorSrc = path.join(templateDir, 'executor.py')
  const executorDst = path.join(skillDir, 'executor.py')
  writeFileSync(executorDst, readFileSync(executorSrc))
  execSync(`chmod +x ${executorDst}`)

  // Copy stats_manager.py
  const statsSrc = path.join(templateDir, 'stats_manager.py')
  const statsDst = path.join(skillDir, 'stats_manager.py')
  writeFileSync(statsDst, readFileSync(statsSrc))

  // Generate pyproject.toml
  const pyproject = generatePyprojectToml(config.name, transport)
  writeFileSync(path.join(skillDir, 'pyproject.toml'), pyproject)

  // Copy mcp-config.json
  const configDst = path.join(skillDir, 'mcp-config.json')
  writeFileSync(configDst, JSON.stringify(config, null, 2))

  // Create package.json for documentation
  const packageJson = {
    name: `skill-${config.name}`,
    version: '1.0.0',
    description: `Claude Skill wrapper for ${config.name} MCP server (${transport})`,
    scripts: {
      'setup': 'uv sync',
      'run': 'uv run executor.py'
    }
  }
  writeFileSync(path.join(skillDir, 'package.json'), JSON.stringify(packageJson, null, 2))
}

/**
 * Introspect MCP server to get tool list
 */
async function introspectMCP(config: MCPConfig): Promise<any[]> {
  console.log(`Introspecting MCP server: ${config.name}...`)

  // Create temporary directory for introspection
  const tempDir = path.join(process.env.TMPDIR || '/tmp', `mcp-introspect-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  try {
    // Copy executor to temp dir
    const templateDir = path.join(__dirname, 'templates')
    writeFileSync(path.join(tempDir, 'executor.py'), readFileSync(path.join(templateDir, 'executor.py')))
    execSync(`chmod +x ${path.join(tempDir, 'executor.py')}`)
    writeFileSync(path.join(tempDir, 'mcp-config.json'), JSON.stringify(config, null, 2))

    // Install dependencies with uv
    console.log('Installing dependencies with uv...')
    try {
      execSync(`cd ${tempDir} && uv init --no-readme --no-pin-python 2>/dev/null || true`, { stdio: 'ignore' })
      execSync(`cd ${tempDir} && uv add mcp --quiet`, { stdio: 'ignore' })
    } catch (e) {
      // uv init might fail if directory not empty, that's ok
    }

    // Run executor to list tools
    console.log('Fetching tool list...')
    const result = execSync(`cd ${tempDir} && uv run executor.py --list 2>/dev/null`, { encoding: 'utf-8' })

    try {
      return JSON.parse(result)
    } catch {
      console.warn('Warning: Could not parse tool list. Using mock data.')
      return [{
        name: 'example_tool',
        description: 'Tool from MCP server (parsing failed)'
      }]
    }
  } catch (error) {
    console.warn('Warning: Could not introspect MCP server. Using mock data.')
    return [{
      name: 'example_tool',
      description: 'Tool from MCP server (introspection failed)'
    }]
  } finally {
    // Cleanup
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert MCP server to skill
 */
export async function convert(options: ConvertOptions): Promise<SkillInfo> {
  const { mcpConfig, outputDir, install = true } = options

  // Read MCP configuration
  const config = await readMCPConfig(mcpConfig)
  const skillName = config.name

  // Determine output directory
  const defaultOutput = path.join(process.env.HOME || '', '.claude', 'skills', skillName)
  const skillDir = outputDir || defaultOutput

  console.log(`Generating skill for MCP server: ${skillName}`)
  console.log(`Output directory: ${skillDir}`)

  // Create skill directory
  mkdirSync(skillDir, { recursive: true })

  // Introspect MCP server to get tool list
  const tools = await introspectMCP(config)

  // Get transport type
  const transport = config.transport || 'stdio'

  // Copy template files
  copyTemplateFiles(skillDir, config)

  // Generate SKILL.md
  const skillMD = generateSkillMD(skillName, tools, transport)
  writeFileSync(path.join(skillDir, 'SKILL.md'), skillMD)

  console.log(`✓ Generated skill at: ${skillDir}`)
  console.log(`✓ Tools available: ${tools.length}`)

  // Install dependencies with uv
  console.log('Installing dependencies with uv...')
  try {
    execSync(`cd ${skillDir} && uv sync --quiet`, { stdio: 'ignore' })
    console.log('✓ Dependencies installed')
  } catch (error) {
    console.warn('Warning: uv sync failed, you may need to run it manually')
  }

  // Calculate context savings
  const mcpContext = tools.length * 500
  const skillContext = 150
  const savings = ((mcpContext - skillContext) / mcpContext * 100).toFixed(1)

  console.log(`\n📊 Context savings:`)
  console.log(`   MCP: ${mcpContext} tokens (all tools preloaded)`)
  console.log(`   Skill: ${skillContext} tokens (metadata only)`)
  console.log(`   Reduction: ${savings}%`)

  if (install) {
    console.log(`\n✓ Skill installed to: ${skillDir}`)
    console.log(`   Claude will discover it automatically`)
  }

  return {
    name: skillName,
    path: skillDir,
    tools,
    contextSaved: `${savings}%`
  }
}

/**
 * Validate a generated skill
 */
export async function validate(skillPath: string): Promise<boolean> {
  const executor = path.join(skillPath, 'executor.py')
  const config = path.join(skillPath, 'mcp-config.json')
  const skillMD = path.join(skillPath, 'SKILL.md')

  const checks = {
    executor: existsSync(executor),
    config: existsSync(config),
    skillMD: existsSync(skillMD),
  }

  if (!Object.values(checks).every(Boolean)) {
    console.error('Validation failed:')
    for (const [file, exists] of Object.entries(checks)) {
      if (!exists) console.error(`  ✗ Missing: ${file}`)
    }
    return false
  }

  console.log('✓ Skill structure valid')

  // Test executor
  try {
    console.log('Testing executor...')
    const result = execSync(`cd ${skillPath} && timeout 10 uv run executor.py --list 2>/dev/null`, { encoding: 'utf-8' })

    const tools = JSON.parse(result)
    console.log(`✓ Executor working (${tools.length} tools)`)
    return true
  } catch (error: any) {
    console.error('✗ Executor test failed:', error.message)
    return false
  }
}

/**
 * Test a skill
 */
export async function test(skillPath: string, toolName?: string, args?: any): Promise<void> {
  const executor = path.join(skillPath, 'executor.py')

  if (toolName === '--list' || !toolName) {
    console.log('Listing tools...')
    const result = execSync(`cd ${skillPath} && uv run executor.py --list 2>/dev/null`, { encoding: 'utf-8' })
    console.log(result)
  } else if (toolName === '--describe') {
    if (!args) {
      console.error('Error: --describe requires a tool name')
      return
    }
    console.log(`Describing tool: ${args}`)
    const result = execSync(`cd ${skillPath} && uv run executor.py --describe ${args} 2>/dev/null`, { encoding: 'utf-8' })
    console.log(result)
  } else {
    throw new Error('Test mode not implemented yet')
  }
}

// CLI interface
if (import.meta.main) {
  const command = process.argv[2]

  if (command === 'convert') {
    const configPath = process.argv[3]
    const outputDir = process.argv.find(arg => arg.startsWith('--output='))?.split('=')[1]
    const noInstall = process.argv.includes('--no-install')

    if (!configPath) {
      console.error('Error: MCP config file path required')
      console.error('Usage: bun lib.ts convert <mcp-config.json> [--output=/path] [--no-install]')
      process.exit(1)
    }

    await convert({
      mcpConfig: configPath,
      outputDir,
      install: !noInstall
    })
  } else if (command === 'validate') {
    const skillPath = process.argv[3]
    if (!skillPath) {
      console.error('Error: Skill path required')
      console.error('Usage: bun lib.ts validate <skill-path>')
      process.exit(1)
    }

    const valid = await validate(skillPath)
    process.exit(valid ? 0 : 1)
  } else if (command === 'test') {
    const skillPath = process.argv[3]
    if (!skillPath) {
      console.error('Error: Skill path required')
      console.error('Usage: bun lib.ts test <skill-path> [--list | --describe <tool> | --call <json>]')
      process.exit(1)
    }

    const toolName = process.argv[4]
    const args = process.argv[5]

    await test(skillPath, toolName, args)
  } else {
    console.log('MCP to Skill Converter (uv-managed)')
    console.log('')
    console.log('Commands:')
    console.log('  convert <config>   Convert MCP config to skill')
    console.log('  validate <path>    Validate generated skill')
    console.log('  test <path>        Test skill tools')
    console.log('')
    console.log('Examples:')
    console.log('  bun lib.ts convert my-mcp.json')
    console.log('  bun lib.ts validate ~/.claude/skills/my-mcp')
    console.log('  bun lib.ts test ~/.claude/skills/my-mcp --list')
  }
}