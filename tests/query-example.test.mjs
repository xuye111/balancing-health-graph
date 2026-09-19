import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const query = fileURLToPath(new URL('../examples/query.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [query, ...args], { encoding: 'utf8' });

test('both public CLI questions succeed and an unknown question fails', () => {
  for (const id of ['q_obesity_hypertension_actions', 'q_shared_factors_three_conditions']) {
    const result = run(id);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).query_id, id);
  }
  const missing = run('missing-question');
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /Unknown question/);
});
