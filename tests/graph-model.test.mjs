import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadProjectData, safeOfficialUrl } from '../web/graph-model.js';

test('public loader reads the seven dataset contract', async () => {
  const base = new URL('../', import.meta.url).href.replace(/\/$/, '');
  const data = await loadProjectData(async (url) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(url), 'utf8')) }), base);
  assert.deepEqual(Object.keys(data).sort(), ['edges', 'evidence', 'nodes', 'ontology', 'paths', 'questions', 'sources']);
  assert.equal(data.nodes.length, 22);
  assert.equal(data.questions.length, 2);
});

test('official URLs only allow HTTP(S)', () => {
  assert.equal(safeOfficialUrl('https://example.org/source'), 'https://example.org/source');
  assert.equal(safeOfficialUrl('javascript:alert(1)'), null);
});
