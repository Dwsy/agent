#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import { parseFrontmatter } from '/Users/dengwenyu/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/utils/frontmatter.js';

const FILE = '/Users/dengwenyu/.pi/agent/extensions/output-styles.ts';

async function loadInternals() {
  let source = readFileSync(FILE, 'utf8');

  source = source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"node:fs";\n/,
    'const existsSync = () => false; const mkdirSync = () => {}; const readdirSync = () => []; const readFileSync = () => ""; const writeFileSync = () => {};\n'
  );

  source = source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"node:os";\n/,
    'const homedir = () => "/tmp"; const platform = () => "darwin";\n'
  );

  source = source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"node:path";\n/,
    'const join = (...parts) => parts.join("/");\n'
  );

  source = source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"@mariozechner\/pi-coding-agent";\n/,
    'import { parseFrontmatter } from "/Users/dengwenyu/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/utils/frontmatter.js";\nconst DynamicBorder = class {}; const getSelectListTheme = () => ({});\n'
  );

  source = source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"@mariozechner\/pi-tui";\n/,
    'const Container = class {}; const SelectList = class {}; const Spacer = class {}; const Text = class {}; const Key = { ctrl: () => "" }; const matchesKey = () => false;\nconst process = { argv: [] };\n'
  );

  source += '\nexport { generateStyleFileContent, normalizeStyleName };\n';

  const compiled = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
  }).code;

  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  return import(url);
}

test('generateStyleFileContent round-trips descriptions with colons', async () => {
  const { generateStyleFileContent } = await loadInternals();
  const content = generateStyleFileContent(
    'debug-style',
    'Be explicit about trade-offs.',
    'Explain: why this output style exists',
    true,
  );

  const parsed = parseFrontmatter(content);
  assert.equal(parsed.frontmatter.name, 'debug-style');
  assert.equal(parsed.frontmatter.description, 'Explain: why this output style exists');
  assert.equal(parsed.frontmatter.keepCodingInstructions, true);
  assert.equal(parsed.body, 'Be explicit about trade-offs.');
});

test('source does not mutate SelectList private internals directly', () => {
  const source = readFileSync(FILE, 'utf8');
  assert.doesNotMatch(source, /selectList\.items\s*=/, 'should not assign to selectList.items');
  assert.doesNotMatch(source, /selectList\.filteredItems\s*=/, 'should not assign to selectList.filteredItems');
});

test('normalizeStyleName strips accidental command prefixes', async () => {
  const { normalizeStyleName } = await loadInternals();
  assert.deepEqual(normalizeStyleName('/output-style:new My Style'), {
    name: 'my-style',
    normalized: true,
  });
});

test('source does not use ambiguous bare global/project badges in selector labels', () => {
  const source = readFileSync(FILE, 'utf8');
  assert.doesNotMatch(source, /\[global\]/, 'selector badges should not overload global as both source and scope');
  assert.doesNotMatch(source, /\[project\]/, 'selector badges should not overload project as both source and scope');
});
