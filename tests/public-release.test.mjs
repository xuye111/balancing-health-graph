import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

test('public package contains the required browser files', async () => {
  for (const path of ['../web/index.html', '../web/app.js', '../web/graph-model.js', '../web/query-model.js', '../web/router.js', '../web/styles.css']) {
    await access(new URL(path, import.meta.url));
  }
  assert.ok(true);
});
