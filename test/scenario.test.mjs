import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PACKET_FIELDS } from '../public/team.mjs';
import { ROSTER, TASK, STEPS, runScenario, fieldSurvival } from '../public/scenario.mjs';

const CONFIG = JSON.parse(await readFile(
  fileURLToPath(new URL('../examples/team-config.json', import.meta.url)), 'utf8'));

test('examples/team-config.json stays in parity with scenario.mjs', () => {
  assert.deepEqual(ROSTER, CONFIG.roster);
  assert.deepEqual(TASK, CONFIG.task);
});

test('every scripted step produces its expected outcome', () => {
  const results = runScenario();
  assert.equal(results.length, STEPS.length);
  for (const { step, matches } of results) {
    assert.equal(matches, true, `step ${step.id} (${step.kind}) outcome mismatch`);
  }
});

test('field survival: thin loses all five packet fields, structured loses none', () => {
  const rows = fieldSurvival();
  const thin = rows.find(r => r.mode === 'thin');
  const structured = rows.find(r => r.mode === 'structured');
  assert.deepEqual([...thin.lost].sort(), [...PACKET_FIELDS].sort());
  assert.deepEqual(structured.lost, []);
  assert.equal(structured.survived.length, PACKET_FIELDS.length);
});
