/**
 * Translating a human query into an FTS5 MATCH expression.
 *
 * Pi's indexer normalizes message text before storing it in `message_fts`:
 * runs of Latin letters and digits survive as words, every CJK character
 * becomes its own token, and punctuation is dropped. A message reading
 * "代码修改总结 review" is indexed as "代 码 修 改 总 结 review".
 *
 * A query therefore has to be normalized the same way or CJK searches silently
 * return nothing — the whole phrase would be one token that matches no term.
 */

/**
 * Characters Pi treats as their own token. Han covers Chinese and kanji;
 * Hiragana/Katakana and Hangul are split the same way so Japanese and Korean
 * transcripts stay searchable.
 */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Latin letters, digits and the marks that hold identifiers together. */
const WORDISH = /[\p{Letter}\p{Number}]/u;

/**
 * Split one whitespace-delimited term into index tokens.
 * `GPM连接器` becomes `["gpm", "连", "接", "器"]`.
 */
function tokenize(term: string): string[] {
  const tokens: string[] = [];
  let word = "";

  const flush = () => {
    if (word) {
      tokens.push(word.toLowerCase());
      word = "";
    }
  };

  for (const char of term) {
    if (CJK.test(char)) {
      flush();
      tokens.push(char);
    } else if (WORDISH.test(char)) {
      word += char;
    } else {
      // Punctuation is a separator: the index dropped it, so must the query.
      flush();
    }
  }
  flush();

  return tokens;
}

/** Escape a token for use inside an FTS5 double-quoted string. */
function quote(tokens: string[]): string {
  return `"${tokens.join(" ").replace(/"/g, '""')}"`;
}

/**
 * Build the FTS5 MATCH expression for a raw user query.
 *
 * Whitespace separates independent terms, which are ANDed — `playwright 测试`
 * finds messages containing both, in any order. Characters inside one term stay
 * adjacent, so `性能优化` matches the phrase rather than four scattered
 * characters.
 *
 * Returns null when the query has no searchable content, which callers must
 * treat as "no query" rather than "no results".
 */
export function buildMatchExpression(raw: string): string | null {
  const phrases = raw
    .split(/\s+/)
    .map(tokenize)
    .filter((tokens) => tokens.length > 0)
    .map(quote);

  return phrases.length > 0 ? phrases.join(" ") : null;
}

/**
 * The literal strings to highlight in the original message text.
 *
 * Highlighting runs against the untouched `content` column, where CJK is still
 * contiguous, so these are the user's terms with punctuation stripped — not the
 * space-separated index tokens.
 */
export function extractHighlightTerms(raw: string): string[] {
  const terms = new Set<string>();

  for (const term of raw.split(/\s+/)) {
    // Rejoin tokens without separators: "GPM连接器," -> "gpm连接器".
    const joined = tokenize(term).join("");
    if (joined) terms.add(joined);
  }

  return [...terms];
}

/**
 * Locate every occurrence of `terms` in `text`, case-insensitively.
 * Overlapping matches are merged so the UI never nests marks.
 */
export function findMatches(text: string, terms: string[]): Array<[number, number]> {
  const hay = text.toLowerCase();
  const spans: Array<[number, number]> = [];

  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    while (from <= hay.length - term.length) {
      const at = hay.indexOf(term, from);
      if (at === -1) break;
      spans.push([at, term.length]);
      from = at + term.length;
    }
  }

  if (spans.length === 0) return spans;

  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [spans[0]];
  for (const [start, length] of spans.slice(1)) {
    const last = merged[merged.length - 1];
    const lastEnd = last[0] + last[1];
    if (start <= lastEnd) {
      last[1] = Math.max(lastEnd, start + length) - last[0];
    } else {
      merged.push([start, length]);
    }
  }

  return merged;
}

/**
 * Cut an excerpt around the first match, with the match positions rebased onto
 * the excerpt. Falls back to the head of the text when nothing matched, so a
 * hit from the index still shows something readable.
 */
export function buildSnippet(
  text: string,
  terms: string[],
  radius = 110,
): { snippet: string; highlights: Array<[number, number]> } {
  const clean = text.replace(/\s+/g, " ").trim();
  const matches = findMatches(clean, terms);

  if (matches.length === 0) {
    const head = clean.slice(0, radius * 2);
    return { snippet: head.length < clean.length ? `${head}…` : head, highlights: [] };
  }

  const [firstStart] = matches[0];
  const start = Math.max(0, firstStart - radius);
  const end = Math.min(clean.length, firstStart + radius * 2);

  let snippet = clean.slice(start, end);
  const highlights: Array<[number, number]> = [];
  for (const [matchStart, length] of matches) {
    if (matchStart >= start && matchStart + length <= end) {
      highlights.push([matchStart - start + (start > 0 ? 1 : 0), length]);
    }
  }

  if (start > 0) snippet = `…${snippet}`;
  if (end < clean.length) snippet = `${snippet}…`;

  return { snippet, highlights };
}
