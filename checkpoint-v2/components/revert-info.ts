/**
 * RevertInfo Component
 *
 * Displays undo/redo state with file change summary.
 */

import * as Tui from '@mariozechner/pi-tui';
import type { Theme } from '@mariozechner/pi-coding-agent';
import type { Component } from '@mariozechner/pi-tui';
import type { FileChange, RevertInfoOptions } from '../types.js';

/**
 * Revert Info - displays undo/redo state
 */
export class RevertInfo implements Component {
  private revertedMessages: number;
  private files: FileChange[];
  private showHint: boolean;
  private container: any;
  private theme: Theme;
  private tui: { requestRender: () => void };
  private onDone: (result: null) => void;

  constructor(
    options: RevertInfoOptions,
    tui: { requestRender: () => void },
    onDone: (result: null) => void
  ) {
    this.revertedMessages = options.revertedMessages;
    this.files = options.files;
    this.showHint = options.showHint !== false;
    this.theme = options.theme;
    this.tui = tui;
    this.onDone = onDone;
    this.container = new (Tui as any).Container();

    // Add reverted messages count
    const text1 = this.theme.bold(
      this.theme.fg('warning', `${this.revertedMessages} message${this.revertedMessages !== 1 ? 's' : ''} reverted`)
    );
    const child1 = new (Tui as any).Text(text1, 1, 0);
    this.container.addChild(child1);

    // Show redo hint if enabled
    if (this.showHint && this.revertedMessages > 0) {
      const text2 = this.theme.dim('Press /redo to restore');
      const child2 = new (Tui as any).Text(text2, 1, 0);
      this.container.addChild(child2);
    }

    // Show file changes summary
    if (this.files.length > 0) {
      const child3 = new (Tui as any).Text('', 0, 0);
      this.container.addChild(child3);
      for (const file of this.files) {
        const stats = this.formatFileStats(file);
        const text4 = `${file.path} ${stats}`;
        const child4 = new (Tui as any).Text(text4, 1, 0);
        this.container.addChild(child4);
      }
    }
  }

  handleInput(data: string): void {
    if (data === 'ESCAPE') {
      this.onDone(null);
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }

  /**
   * Format file stats for display
   */
  private formatFileStats(file: FileChange): string {
    const additions = file.additions || 0;
    const deletions = file.deletions || 0;

    if (additions === 0 && deletions === 0) {
      return file.path;
    }

    const stats = [];
    if (additions > 0) {
      stats.push(this.theme.fg('success', `+${additions}`));
    }
    if (deletions > 0) {
      stats.push(this.theme.fg('error', `-${deletions}`));
    }

    return `${file.path} ${stats.join(' ')}`;
  }
}