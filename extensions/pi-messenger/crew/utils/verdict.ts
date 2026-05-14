/**
 * Crew - Review Verdict Parsing
 *
 * Shared verdict parsing utility for reviewer outputs.
 */

export interface ParsedReview {
  verdict: "SHIP" | "NEEDS_WORK" | "MAJOR_RETHINK";
  summary: string;
  issues: string[];
  suggestions: string[];
}

export function parseVerdict(output: string): ParsedReview {
  const result: ParsedReview = {
    verdict: "NEEDS_WORK",
    summary: "",
    issues: [],
    suggestions: []
  };

  // Extract verdict
  const verdictMatch = output.match(/##\s*Verdict:\s*(SHIP|NEEDS_WORK|MAJOR_RETHINK)/i);
  if (verdictMatch) {
    result.verdict = verdictMatch[1].toUpperCase() as ParsedReview["verdict"];
  }

  // Extract summary (text between Verdict and next ##)
  const summaryMatch = output.match(/##\s*Verdict:.*?\n([\s\S]*?)(?=\n##|$)/i);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  // Extract issues
  const issuesMatch = output.match(/##\s*Issues?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (issuesMatch) {
    result.issues = issuesMatch[1]
      .split("\n")
      .filter(line => line.trim().startsWith("-") || line.trim().startsWith("*"))
      .map(line => line.replace(/^[\s\-*]+/, "").trim())
      .filter(Boolean);
  }

  // Extract suggestions
  const suggestionsMatch = output.match(/##\s*Suggestions?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (suggestionsMatch) {
    result.suggestions = suggestionsMatch[1]
      .split("\n")
      .filter(line => line.trim().startsWith("-") || line.trim().startsWith("*"))
      .map(line => line.replace(/^[\s\-*]+/, "").trim())
      .filter(Boolean);
  }

  return result;
}
