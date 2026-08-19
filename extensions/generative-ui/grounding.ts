export const GROUNDING_STATUSES = ["grounded", "not_applicable"] as const;
export const GROUNDING_SOURCE_KINDS = ["conversation", "file", "code", "web", "data"] as const;

export type GroundingStatus = (typeof GROUNDING_STATUSES)[number];
export type GroundingSourceKind = (typeof GROUNDING_SOURCE_KINDS)[number];

export interface GroundingSource {
  label: string;
  kind: GroundingSourceKind;
  /** Stable source identity: URL, file/code locator, conversation anchor, or dataset/run id. */
  locator: string;
  as_of?: string;
}

export interface GroundingDeclaration {
  status: GroundingStatus;
  evidence_scope: string;
  sources?: GroundingSource[];
}

const SOURCE_KIND_SET = new Set<string>(GROUNDING_SOURCE_KINDS);

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`grounding.${field} must be a non-empty string.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`grounding.${field} must be at most ${maxLength} characters.`);
  }
  return text;
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field, maxLength);
}

const GENERIC_LOCATORS = new Set(["source", "unknown", "n/a", "na", "file", "code", "web", "data", "conversation"]);

function validateSourceLocator(kind: GroundingSourceKind, value: unknown, index: number): string {
  const locator = requiredText(value, `sources[${index}].locator`, 1000);
  if (GENERIC_LOCATORS.has(locator.toLowerCase())) {
    throw new Error(`grounding.sources[${index}].locator must identify a concrete source, not a generic placeholder.`);
  }

  if (kind === "web") {
    let parsed: URL;
    try {
      parsed = new URL(locator);
    } catch {
      throw new Error(`grounding.sources[${index}].locator must be an absolute http(s) URL for web evidence.`);
    }
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error(`grounding.sources[${index}].locator must be a credential-free absolute http(s) URL for web evidence.`);
    }
  }

  if ((kind === "file" || kind === "code") && /^https?:\/\//i.test(locator)) {
    throw new Error(`grounding.sources[${index}].locator must identify a local file/code location, not a web URL.`);
  }

  return locator;
}

/**
 * Host-enforced provenance declaration for every visual render.
 *
 * Factual artifacts must use status=grounded with at least one structured source.
 * Creative/hypothetical artifacts may use not_applicable, but must still explain
 * why evidence provenance does not apply. This makes a render's grounding state
 * explicit and auditable instead of relying on prompt compliance alone.
 */
export function validateGroundingDeclaration(input: unknown): GroundingDeclaration {
  if (!input || typeof input !== "object") {
    throw new Error("grounding is required for every visual render.");
  }
  const value = input as Record<string, unknown>;
  if (value.status !== "grounded" && value.status !== "not_applicable") {
    throw new Error('grounding.status must be "grounded" or "not_applicable".');
  }
  const evidenceScope = requiredText(value.evidence_scope, "evidence_scope", 500);
  const rawSources = value.sources;
  if (rawSources !== undefined && !Array.isArray(rawSources)) {
    throw new Error("grounding.sources must be an array when provided.");
  }
  const sources = (rawSources ?? []).map((raw, index): GroundingSource => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`grounding.sources[${index}] must be an object.`);
    }
    const source = raw as Record<string, unknown>;
    const kind = source.kind;
    if (typeof kind !== "string" || !SOURCE_KIND_SET.has(kind)) {
      throw new Error(`grounding.sources[${index}].kind must identify conversation, file, code, web, or data evidence.`);
    }
    const typedKind = kind as GroundingSourceKind;
    const locator = validateSourceLocator(typedKind, source.locator, index);
    const asOf = optionalText(source.as_of, `sources[${index}].as_of`, 100);
    return {
      label: requiredText(source.label, `sources[${index}].label`, 200),
      kind: typedKind,
      locator,
      ...(asOf ? { as_of: asOf } : {}),
    };
  });

  if (sources.length > 12) {
    throw new Error("grounding.sources supports at most 12 sources; aggregate the evidence list.");
  }
  if (value.status === "grounded" && sources.length === 0) {
    throw new Error("grounded visual renders require at least one provenance source.");
  }
  if (value.status === "not_applicable" && sources.length > 0) {
    throw new Error("not_applicable visual renders must not declare factual provenance sources.");
  }

  return {
    status: value.status,
    evidence_scope: evidenceScope,
    ...(sources.length ? { sources } : {}),
  };
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Visible, host-owned provenance footer for grounded artifacts. */
export function groundingFooterHTML(grounding: GroundingDeclaration): string {
  if (grounding.status !== "grounded") return "";
  const sources = grounding.sources ?? [];
  const sourceText = sources.map((source) => {
    const locator = source.locator ? ` — ${source.locator}` : "";
    const asOf = source.as_of ? ` (as of ${source.as_of})` : "";
    return `${source.label} [${source.kind}]${locator}${asOf}`;
  }).map(escapeHTML).join(" · ");
  return `<footer data-genui-provenance="grounded" aria-label="Evidence provenance" style="margin-top:24px;padding-top:12px;border-top:1px solid var(--color-border-tertiary);font-size:12px;line-height:1.45;color:var(--color-text-secondary)"><div><strong style="color:var(--color-text-primary)">Evidence scope:</strong> ${escapeHTML(grounding.evidence_scope)}</div><div style="margin-top:4px"><strong style="color:var(--color-text-primary)">Sources:</strong> ${sourceText}</div></footer>`;
}
