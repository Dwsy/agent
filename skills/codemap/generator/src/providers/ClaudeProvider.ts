/**
 * Claude Code 提供者
 */

import { spawn } from 'child_process';
import { BaseProvider } from './BaseProvider.js';
import type { CodeMap } from '../types.js';

export class ClaudeProvider extends BaseProvider {
  name = 'claude';

  async generate(prompt: string, modelTier: 'fast' | 'smart'): Promise<CodeMap> {
    console.error('Calling Claude Code...');

    const args = [
      '--print',
      '--output-format', 'json',
      '--model', modelTier === 'smart' ? 'sonnet' : 'haiku',
      '--tools', 'Read',  // 只允许 Read 工具
      prompt
    ];

    const output = await this.executeCommand('claude', args);
    const codemap = this.parseOutput(output);
    return this.validateCodemap(codemap);
  }

  async analyze(prompt: string): Promise<any> {
    console.error('Analyzing with Claude Code...');

    const args = [
      '--print',
      '--output-format', 'json',
      '--model', 'haiku',
      '--tools', 'Read',
      prompt
    ];

    const output = await this.executeCommand('claude', args);
    return JSON.parse(output);
  }

  private async executeCommand(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const cli = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      cli.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      cli.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      cli.on('close', (code) => {
        if (code !== 0) {
          console.error('Claude CLI stderr:', stderr);
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stdout);
      });

      cli.on('error', (error) => {
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });

      // 60 秒超时
      setTimeout(() => {
        cli.kill();
        reject(new Error('Claude CLI timeout after 60 seconds'));
      }, 60000);
    });
  }

  private parseOutput(stdout: string): any {
    console.error('Claude Code output length:', stdout.length);

    // Claude Code 返回纯 JSON，直接解析
    return JSON.parse(stdout.trim());
  }
}