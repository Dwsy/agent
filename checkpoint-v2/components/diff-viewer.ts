/**
 * DiffViewer Component
 *
 * Displays file diff with coloring and line numbers.
 */

import { Container, Text, matchesKey, Key } from '@mariozechner/pi-tui';
import type { Theme } from '@mariozechner/pi-coding-agent';
import type { DiffViewerOptions } from '../types.js';

/**
 * Diff line type
 */
type DiffLine = {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLine?: number;
  newLine?: number;
};

/**
 * DiffViewer - displays file diff
 */
export class DiffViewer implements Component {
  private diff: string;
  private container: Container;
  private theme: Theme;
  private showLineNumbers: boolean;
  private lines: DiffLine[];
  private scrollTop = 0;
  private visibleLines = 20;
  private tui: { requestRender: () => void };
  private onDone: () => void;

  constructor(
    options: DiffViewerOptions,
    tui: { requestRender: () => void },
    onDone: () => void
  ) {
    this.diff = options.diff;
    this.theme = options.theme;
    this.showLineNumbers = options.showLineNumbers !== false;
    this.tui = tui;
    this.onDone = onDone;
    this.container = new Container();
    this.lines = this.parseDiff(this.diff);

    // Render diff
    this.renderDiff();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.scrollUp(1);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.down)) {
      this.scrollDown(1);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.pageUp)) {
      this.scrollUp(Math.floor(this.visibleLines / 2));
      this.tui.requestRender();
    } else if (matchesKey(data, Key.pageDown)) {
      this.scrollDown(Math.floor(this.visibleLines / 2));
      this.tui.requestRender();
    } else if (matchesKey(data, Key.home)) {
      this.scrollToTop();
      this.tui.requestRender();
    } else if (matchesKey(data, Key.end)) {
      this.scrollToBottom();
      this.tui.requestRender();
    } else if (matchesKey(data, 'ctrl+u')) {
      this.scrollUp(Math.floor(this.visibleLines / 2));
      this.tui.requestRender();
    } else if (matchesKey(data, 'ctrl+d')) {
      this.scrollDown(Math.floor(this.visibleLines / 2));
      this.tui.requestRender();
    } else if (matchesKey(data, Key.escape)) {
      this.onDone();
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }

  /**
   * Parse diff string into structured lines
   */
  private parseDiff(diff: string): DiffLine[] {
    const lines: DiffLine[] = [];
    const diffLines = diff.split('\n');

    let oldLine = 0;
    let newLine = 0;

    for (const line of diffLines) {
      if (line.startsWith('@@')) {
        // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          oldLine = parseInt(match[1], 10) - 1;
          newLine = parseInt(match[3], 10) - 1;
        }
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        newLine++;
        lines.push({ type: 'add', content: line, newLine });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        oldLine++;
        lines.push({ type: 'remove', content: line, oldLine });
      } else if (line.startsWith(' ')) {
        oldLine++;
        newLine++;
        lines.push({ type: 'context', content: line, oldLine, newLine });
      } else {
        // File headers or other lines
        lines.push({ type: 'context', content: line });
      }
    }

    return lines;
  }

  /**
   * Render diff to container
   */
  private renderDiff(): void {
    for (const line of this.lines) {
      const text = this.formatLine(line);
      this.container.addChild(new Text(text, 1, 0));
    }
  }

  /**
   * Format a single diff line with colors
   */
  private formatLine(line: DiffLine): string {
    if (this.showLineNumbers) {
      const oldNum = line.oldLine !== undefined ? line.oldLine.toString() : '';
      const newNum = line.newLine !== undefined ? line.newLine.toString() : '';
      const prefix = `${this.padLeft(oldNum, 4)} ${this.padLeft(newNum, 4)} | `;
      const content = this.formatContent(line);
      return prefix + content;
    }
    return this.formatContent(line);
  }

  /**
   * Format line content with colors
   */
  private formatContent(line: DiffLine): string {
    switch (line.type) {
      case 'add':
        return this.theme.fg('success', line.content);
      case 'remove':
        return this.theme.fg('error', line.content);
      case 'header':
        return this.theme.fg('accent', line.content);
      case 'context':
      default:
        return this.theme.dim(line.content);
    }
  }

  /**
   * Pad string to fixed width
   */
  private padLeft(str: string, width: number): string {
    return str.padStart(width, ' ');
  }

  /**
   * Get total line count
   */
  getLineCount(): number {
    return this.lines.length;
  }

  /**
   * Get visible range
   */
  getVisibleRange(): { start: number; end: number } {
    return {
      start: this.scrollTop,
      end: Math.min(this.scrollTop + this.visibleLines, this.lines.length)
    };
  }

  /**
   * Scroll to position
   */
  scrollTo(position: number): void {
    this.scrollTop = Math.max(0, Math.min(position, this.lines.length - this.visibleLines));
    this.invalidate();
  }

  /**
   * Scroll up by lines
   */
  scrollUp(lines = 1): void {
    this.scrollTo(this.scrollTop - lines);
  }

  /**
   * Scroll down by lines
   */
  scrollDown(lines = 1): void {
    this.scrollTo(this.scrollTop + lines);
  }

  /**
   * Scroll to top
   */
  scrollToTop(): void {
    this.scrollTo(0);
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(): void {
    this.scrollTo(this.lines.length - this.visibleLines);
  }

  /**
   * Get diff summary
   */
  getSummary(): {
    additions: number;
    deletions: number;
    changes: number;
  } {
    let additions = 0;
    let deletions = 0;

    for (const line of this.lines) {
      if (line.type === 'add') additions++;
      if (line.type === 'remove') deletions++;
    }

    return {
      additions,
      deletions,
      changes: additions + deletions
    };
  }
}