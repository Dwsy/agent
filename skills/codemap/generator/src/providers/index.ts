/**
 * AI 提供者工厂
 */

import { PiProvider } from './PiProvider.js';
import { ClaudeProvider } from './ClaudeProvider.js';
import type { AIProvider } from '../types.js';

export class ProviderFactory {
  /**
   * 创建 AI 提供者
   */
  static create(provider: 'pi' | 'claude' = 'pi'): AIProvider {
    switch (provider) {
      case 'pi':
        return new PiProvider();
      case 'claude':
        return new ClaudeProvider();
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * 获取所有可用的提供者
   */
  static getAvailableProviders(): Array<{ name: string; id: 'pi' | 'claude' }> {
    return [
      { name: 'Pi CLI', id: 'pi' },
      { name: 'Claude Code', id: 'claude' }
    ];
  }
}