/**
 * Server-side Markdown → HTML for session history ("极致性能 (Node)" stack):
 *   satteri (Rust pulldown-cmark core)
 *     + satteri-expressive-code (Shiki highlighting, dual themes)
 *     + @xingwangzhe/satteri-mermaid (native SVG, zero client JS)
 *
 * Output is rendered by the WebUI through DOMPurify before injection: satteri
 * keeps raw HTML in markdown as opaque `raw` nodes re-emitted verbatim
 * (Features.rawHtml defaults to false but passthrough still happens), so the
 * browser-side sanitizer is the XSS boundary — not this module.
 */
import { markdownToHtml } from "satteri";
import expressiveCode from "satteri-expressive-code";
import { mermaidMdast, mermaidHast } from "@xingwangzhe/satteri-mermaid";

export type MarkdownTheme = "light" | "dark";

/** Dual themes rendered as CSS custom properties; client [data-theme] picks one. */
const EC_THEMES = ["github-light", "github-dark"] as const;

/** Mermaid ships one static SVG per diagram — theme chosen per request. */
const MERMAID_THEMES: Record<MarkdownTheme, string> = {
	light: "default",
	dark: "dark",
};

export async function renderMarkdown(text: string, theme: MarkdownTheme = "light"): Promise<string> {
	const { html } = await markdownToHtml(text, {
		mdastPlugins: [mermaidMdast()],
		hastPlugins: [
			mermaidHast({ theme: MERMAID_THEMES[theme], onError: "code" }),
			expressiveCode({ themes: [...EC_THEMES] }),
		],
	});
	return html;
}
