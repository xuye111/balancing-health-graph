// Local, read-only integration example. No server or external model is used.
import { readFile } from 'node:fs/promises';
import { loadProjectData } from '../web/graph-model.js';
import { executeQuestion, serializeQueryResult } from '../web/query-model.js';

try {
  const base = new URL('../', import.meta.url).href.replace(/\/$/, '');
  const data = await loadProjectData(async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(new URL(url), 'utf8')),
  }), base);
  const questionId = process.argv[2] ?? 'q_obesity_hypertension_actions';
  const question = data.questions.find(({ id }) => id === questionId);
  if (!question) throw new Error(`Unknown question: ${questionId}`);
  // Preserve evidence IDs and pending-review warnings in the same browser contract.
  process.stdout.write(serializeQueryResult(executeQuestion(question, data)));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
