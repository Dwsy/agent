#!/usr/bin/env node
/**
 * Static gate for the web UI.
 *
 * These checks encode the non-negotiables from `docs/contract.md`: no build
 * step, no network at runtime, no emoji, no copy baked into markup, and a
 * layout that survives a 390px viewport, dark mode, and reduced motion.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const errors = [];

const required = ["index.html", "css/app.css", "js/main.js", "js/api.js", "js/state.js", "js/view.js", "js/charts.js", "js/format.js", "js/i18n.js"];
for (const file of required) {
	if (!existsSync(join(publicDir, file))) errors.push(`missing public/${file}`);
}
if (errors.length) {
	for (const error of errors) console.error(error);
	process.exit(1);
}

const html = readFileSync(join(publicDir, "index.html"), "utf8");
const css = readFileSync(join(publicDir, "css/app.css"), "utf8");
const jsFiles = readdirSync(join(publicDir, "js"))
	.filter((name) => name.endsWith(".js"))
	.sort();

const EMOJI = /\p{Extended_Pictographic}/u;
const CJK = /[\u4e00-\u9fff]/;

// No build step, no runtime network dependency.
if (/(?:src|href)=["']https?:\/\//.test(html)) errors.push("index.html loads a remote asset");
if (/@import\s+url\(\s*["']?https?:/.test(css)) errors.push("app.css imports a remote stylesheet");
if (!html.includes('type="module"')) errors.push("index.html must boot an ES module");
if (!html.includes("/js/main.js")) errors.push("index.html must load js/main.js");

// Anti-slop: no emoji anywhere in the shipped UI.
if (EMOJI.test(html)) errors.push("index.html contains emoji");
if (EMOJI.test(css)) errors.push("app.css contains emoji");

// All visible copy lives in i18n.js, so markup carries no localizable text.
const htmlWithoutBootScript = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
if (CJK.test(htmlWithoutBootScript)) errors.push("index.html hardcodes Chinese copy; move it into js/i18n.js");

// Theming, responsiveness, motion.
if (!html.includes("pi-insights-theme")) errors.push("early theme boot missing (pi-insights-theme)");
if (!html.includes("pi-insights-locale")) errors.push("early locale boot missing (pi-insights-locale)");
if (!css.includes('[data-theme="dark"]')) errors.push("dark theme missing");
if (!/@media \(max-width: (?:7\d\d|8\d\d|9\d\d)px\)/.test(css)) errors.push("no mobile breakpoint under 1000px");
if (!css.includes("prefers-reduced-motion")) errors.push("reduced motion handling missing");
if (!css.includes("100dvh")) errors.push("dynamic viewport height missing");
if (css.includes("#000000") || css.includes("#000;") || css.includes("#000 ")) {
	errors.push("pure black is not part of the palette");
}

for (const file of jsFiles) {
	const source = readFileSync(join(publicDir, "js", file), "utf8");
	if (file !== "i18n.js" && EMOJI.test(source)) errors.push(`js/${file} contains emoji`);
	if (file !== "i18n.js" && CJK.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))) {
		errors.push(`js/${file} hardcodes Chinese copy; move it into js/i18n.js`);
	}
	for (const match of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
		if (!existsSync(join(publicDir, "js", match[1]))) errors.push(`js/${file} imports missing ${match[1]}`);
	}
	if (/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(source.replace(/^\s*(?:\/\/|\*).*$/gm, ""))) {
		errors.push(`js/${file} references a remote origin`);
	}
}

// Both locales must cover the same keys, so no string silently falls back.
const i18nSource = readFileSync(join(publicDir, "js/i18n.js"), "utf8");
const localeKeys = {};
for (const match of i18nSource.matchAll(/^(?:export\s+)?const\s+(zh|en)\s*=\s*\{([\s\S]*?)^\};/gm)) {
	localeKeys[match[1]] = new Set([...match[2].matchAll(/^\s{1,4}(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:/gm)].map((m) => m[1] ?? m[2]));
}
if (localeKeys.zh && localeKeys.en) {
	const missingInEn = [...localeKeys.zh].filter((key) => !localeKeys.en.has(key));
	const missingInZh = [...localeKeys.en].filter((key) => !localeKeys.zh.has(key));
	if (missingInEn.length) errors.push(`en locale missing keys: ${missingInEn.slice(0, 8).join(", ")}`);
	if (missingInZh.length) errors.push(`zh locale missing keys: ${missingInZh.slice(0, 8).join(", ")}`);
} else {
	errors.push("i18n.js must export `zh` and `en` object literals");
}

if (errors.length) {
	for (const error of errors) console.error(error);
	process.exit(1);
}
console.log(`verify-public-ui: ok (${jsFiles.join(", ")})`);
