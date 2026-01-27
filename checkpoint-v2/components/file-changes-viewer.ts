/**
 * FileChangesViewer Component
 *
 * Displays a list of modified files with statistics.
 */

import type { Component } from '@mariozechner/pi-tui';
import { Container, SelectList } from '@mariozechner/pi-tui';
import type { Theme } from '@mariozechner/pi-coding-agent';
import type { FileChange, FileChangesViewerOptions } from '../types.js';

/**
 * File Changes Viewer - displays list of modified files
 */
export class FileChangesViewer implements Component {
  private files: FileChange[];
  private selected = 0;
  private maxVisible: number;
  private showStats: boolean;
  private container: Container;
  private selectList: any;
  private theme: Theme;
  private tui: { requestRender: () => void };
  private onDone: (result: FileChange | null) => void;

  public onSelect?: (file: FileChange) => void;
  public onCancel?: () => void;

  constructor(
    files: FileChange[],
    theme: Theme,
    tui: { requestRender: () => void },
    onDone: (result: FileChange | null) => void,
    options: FileChangesViewerOptions = {}
  ) {
    this.files = files;
    this.theme = theme;
    this.tui = tui;
    this.onDone = onDone || (() => {});
    console.log('[FileChangesViewer] Constructor called, onDone:', typeof this.onDone);
    this.maxVisible = options.maxVisible || 10;
    this.showStats = options.showStats !== false;
    this.container = new Container();

    // Create SelectList
    const items = this.createSelectItems();
    this.selectList = new SelectList(items, this.maxVisible, {
      selectedPrefix: (t: string) => theme.fg('accent', '→ '),
      selectedText: (t: string) => theme.fg('accent', t),
      description: (t: string) => t,
      scrollInfo: (t: string) => theme.fg('dim', t),
    });

    this.selectList.onSelect = (item: any) => {
      if (this.onSelect) this.onSelect(item.value);
      this.onDone(item.value);
    };

    this.selectList.onCancel = () => {
      if (this.onCancel) this.onCancel();
      if (this.onDone) this.onDone(null);
    };

    this.container.addChild(this.selectList);
  }

  handleInput(data: string): void {
    this.selectList.handleInput(data);
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }

  /**
   * Get selected file
   */
  getSelectedFile(): FileChange | undefined {
    return this.files[this.selected];
  }

  /**
   * Set selected index
   */
  setSelectedIndex(index: number): void {
    if (index >= 0 && index < this.files.length) {
      this.selected = index;
      this.invalidate();
    }
  }

  /**
   * Create SelectList items from file changes
   */
  private createSelectItems(): any[] {
    return this.files.map((file) => {
      const stats = this.formatStats(file);
      return {
        value: file,
        label: file.path,
        description: stats,
      };
    });
  }

  /**
   * Format file statistics as colored string
   */
  private formatStats(file: FileChange): string {
    const additions = file.additions || 0;
    const deletions = file.deletions || 0;

    if (additions === 0 && deletions === 0) {
      return this.theme.fg('muted', 'no changes');
    }

    const parts: string[] = [];
    if (additions > 0) {
      parts.push(this.theme.fg('success', `+${additions}`));
    }
    if (deletions > 0) {
      parts.push(this.theme.fg('error', `-${deletions}`));
    }

    return parts.join(' ');
  }

  /**
   * Get total file count
   */
  getFileCount(): number {
    return this.files.length;
  }

  /**
   * Get summary of all changes
   */
  getSummary(): {
    totalFiles: number;
    created: number;
    modified: number;
    deleted: number;
    totalAdditions: number;
    totalDeletions: number;
  } {
    const summary = {
      totalFiles: this.files.length,
      created: 0,
      modified: 0,
      deleted: 0,
      totalAdditions: 0,
      totalDeletions: 0,
    };

    for (const file of this.files) {
      summary[file.action]++;
      summary.totalAdditions += file.additions || 0;
      summary.totalDeletions += file.deletions || 0;
    }

    return summary;
  }

  /**
   * Filter files by action type
   */
  filterByAction(action: FileChange['action']): FileChange[] {
    return this.files.filter(f => f.action === action);
  }

  /**
   * Sort files by path
   */
  sortByPath(): void {
    this.files.sort((a, b) => a.path.localeCompare(b.path));
    this.invalidate();
  }

  /**
   * Sort files by modifications (most modified first)
   */
  sortByModifications(): void {
    this.files.sort((a, b) => {
      const aScore = (a.additions || 0) + (a.deletions || 0);
      const bScore = (b.additions || 0) + (b.deletions || 0);
      return bScore - aScore;
    });
    this.invalidate();
  }
}