import assert from "node:assert/strict";
import test from "node:test";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { applyDollarCompletion, buildDollarSuggestions, extractDollarPrefix, type PromptOrSkillCommand } from "../src/editor.ts";

function makeItem(value: string): AutocompleteItem {
	return { value, label: value };
}

test("extractDollarPrefix detects $ tokens at token boundaries", () => {
	assert.equal(extractDollarPrefix("$hand"), "$hand");
	assert.equal(extractDollarPrefix("run $writ"), "$writ");
	assert.equal(extractDollarPrefix("foo=$plan"), "$plan");
	assert.equal(extractDollarPrefix("price$plan"), null);
});

test("buildDollarSuggestions fuzzy-matches prompts and skills", () => {
	const commands: PromptOrSkillCommand[] = [
		{ name: "handoff", description: "Continue work in another session", source: "prompt" },
		{ name: "skill:writing-plans", description: "Create implementation plans", source: "skill" },
		{ name: "skill:brainstorming", description: "Explore designs before implementation", source: "skill" },
	];

	const promptMatches = buildDollarSuggestions(commands, "hand");
	assert.equal(promptMatches[0]?.value, "/handoff");
	assert.match(promptMatches[0]?.description ?? "", /^prompt · /);

	const skillMatches = buildDollarSuggestions(commands, "writing");
	assert.equal(skillMatches[0]?.value, "/skill:writing-plans");
	assert.match(skillMatches[0]?.description ?? "", /^skill · /);
});

test("buildDollarSuggestions searches bare skill names, not only skill: prefix", () => {
	const commands: PromptOrSkillCommand[] = [
		{ name: "skill:writing-plans", description: "Create implementation plans", source: "skill" },
	];

	const matches = buildDollarSuggestions(commands, "plans");
	assert.deepEqual(matches.map((item) => item.value), ["/skill:writing-plans"]);
});

test("applyDollarCompletion replaces $ token with command and appends one space", () => {
	const result = applyDollarCompletion(["please use $hand"], 0, 16, makeItem("/handoff"), "$hand");
	assert.deepEqual(result.lines, ["please use /handoff "]);
	assert.equal(result.cursorLine, 0);
	assert.equal(result.cursorCol, "please use /handoff ".length);
});

test("applyDollarCompletion avoids duplicating trailing spaces", () => {
	const result = applyDollarCompletion(["$writ next"], 0, 5, makeItem("/skill:writing-plans"), "$writ");
	assert.deepEqual(result.lines, ["/skill:writing-plans next"]);
	assert.equal(result.cursorCol, "/skill:writing-plans".length);
});
