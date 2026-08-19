import test from "node:test";
import assert from "node:assert/strict";
import { groundingFooterHTML, validateGroundingDeclaration } from "./grounding.ts";
import { wrapHTML } from "./html-helpers.ts";

const GROUNDED = {
  status: "grounded",
  evidence_scope: "Repository state on 2026-08-19",
  sources: [
    { label: "routing.ts", kind: "code", locator: "extensions/generative-ui/routing.ts", as_of: "2026-08-19" },
    { label: "pnpm test", kind: "data", locator: "local test run" },
  ],
};

test("grounding declaration is mandatory and factual renders require sources", () => {
  assert.throws(() => validateGroundingDeclaration(undefined), /grounding is required/);
  assert.throws(
    () => validateGroundingDeclaration({ status: "grounded", evidence_scope: "Current facts" }),
    /require at least one provenance source/,
  );
  assert.throws(
    () => validateGroundingDeclaration({ status: "not_applicable", evidence_scope: "Concept sketch", sources: [{ label: "x", kind: "web", locator: "https://example.com/source" }] }),
    /must not declare factual provenance sources/,
  );
  assert.throws(
    () => validateGroundingDeclaration({ status: "grounded", evidence_scope: "Facts", sources: [{ label: "x", kind: "generated" }] }),
    /conversation, file, code, web, or data evidence/,
  );
  assert.throws(
    () => validateGroundingDeclaration({ status: "grounded", evidence_scope: "Facts", sources: [{ label: "x", kind: "web" }] }),
    /locator must be a non-empty string/,
  );
  assert.throws(
    () => validateGroundingDeclaration({ status: "grounded", evidence_scope: "Facts", sources: [{ label: "x", kind: "web", locator: "example.com/report" }] }),
    /absolute http\(s\) URL/,
  );
  assert.throws(
    () => validateGroundingDeclaration({ status: "grounded", evidence_scope: "Facts", sources: [{ label: "x", kind: "data", locator: "data" }] }),
    /concrete source, not a generic placeholder/,
  );
});

test("grounding declaration normalizes explicit non-factual renders", () => {
  assert.deepEqual(
    validateGroundingDeclaration({ status: "not_applicable", evidence_scope: "Hypothetical product wireframe; no factual claims." }),
    { status: "not_applicable", evidence_scope: "Hypothetical product wireframe; no factual claims." },
  );
});

test("host-owned provenance footer is visible, semantic, escaped, and survives saved widget wrapping", () => {
  const grounding = validateGroundingDeclaration({
    ...GROUNDED,
    sources: [{ label: "repo <main>", kind: "code", locator: "routing.ts", as_of: "2026-08-19" }],
  });
  const footer = groundingFooterHTML(grounding);
  assert.match(footer, /data-genui-provenance="grounded"/);
  assert.match(footer, /aria-label="Evidence provenance"/);
  assert.match(footer, /Evidence scope:/);
  assert.match(footer, /Repository state on 2026-08-19/);
  assert.match(footer, /repo &lt;main&gt; \[code\]/);
  assert.match(footer, /as of 2026-08-19/);
  assert.doesNotMatch(footer, /repo <main>/);

  const saved = wrapHTML(`<main>Report</main>${footer}`);
  assert.match(saved, /data-genui-provenance="grounded"/);
  assert.match(saved, /Repository state on 2026-08-19/);
});
