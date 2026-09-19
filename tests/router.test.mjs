import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHref } from '../web/router.js';

test('public question routes remain recoverable', () => {
  assert.deepEqual(parseRoute('#question/q_obesity_hypertension_actions'), { name: 'question', id: 'q_obesity_hypertension_actions', themes: [] });
  assert.equal(routeHref('question', { id: 'q_shared_factors_three_conditions' }), '#question/q_shared_factors_three_conditions');
});
