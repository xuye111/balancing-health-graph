import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executeQuestion } from '../web/query-model.js';

async function loadData() {
  const readJson = (path) => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse);
  return {
    ontology: await readJson('../ontology/chronic-care-ontology.json'),
    nodes: await readJson('../data/nodes.json'),
    edges: await readJson('../data/edges.json'),
    evidence: await readJson('../data/evidence.json'),
    paths: await readJson('../data/paths.json'),
    sources: await readJson('../sources/sources.json'),
    questions: await readJson('../data/questions.json'),
  };
}

test('both public questions return sorted traceable results', async () => {
  const data = await loadData();
  assert.deepEqual(data.questions.map(({ id }) => id), ['q_obesity_hypertension_actions', 'q_shared_factors_three_conditions']);
  for (const question of data.questions) {
    const result = executeQuestion(question, data);
    assert.equal(result.query_id, question.id);
    for (const ids of [result.node_ids, result.edge_ids, result.path_ids, result.evidence_ids, result.source_ids]) {
      assert.deepEqual(ids, [...ids].sort());
      assert.ok(ids.length);
    }
  }
});
