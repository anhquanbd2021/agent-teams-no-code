// Handoff Lab — seeded scenario.
// Roster + task mirror examples/team-config.json (a test asserts parity).
// STEPS are the scripted demonstration run: thin vs. structured handoffs,
// a memory-isolation denial, a skill-gating denial, and a capped loop.

import { createTeam, PACKET_FIELDS } from './team.mjs';

export const ROSTER = [
  {
    name: 'researcher',
    title: 'Researcher',
    model: 'small-local',
    skills: ['web-search', 'summarize'],
    tools: ['browser', 'notes'],
    persona: 'Gathers sources, records dead ends, and hands a structured packet to the coder. Never touches the repo.',
  },
  {
    name: 'coder',
    title: 'Coder',
    model: 'frontier',
    skills: ['edit-code', 'run-tests'],
    tools: ['editor', 'terminal'],
    persona: 'Implements the change inside the stated constraints. Reads the handoff packet before writing a line.',
  },
  {
    name: 'reviewer',
    title: 'Reviewer',
    model: 'mid',
    skills: ['read-diff', 'request-changes'],
    tools: ['diff-viewer'],
    persona: 'Checks the diff against the done-condition. Requests changes or signs off — never edits code.',
  },
];

export const TASK = {
  id: 'rate-limit-login',
  goal: 'Add rate limiting to POST /api/login',
  constraints: ['no new dependencies', 'keep the existing token format', 'respond 429 with Retry-After'],
  skill: 'web-search',
  skillByBot: { researcher: 'web-search', coder: 'edit-code', reviewer: 'read-diff' },
  pipeline: ['researcher', 'coder', 'reviewer'],
  done: 'reviewer sign-off',
  findings: {
    researcher: '2 candidate approaches; sliding-window rejected (constraint: no new deps)',
    coder: 'implemented in-memory bucket; tests pass',
    reviewer: 'diff matches constraints',
  },
};

// Scripted demonstration steps. Each step names the expected outcome so the
// browser replay, the CLI report, and the tests all check the same run.
export const STEPS = [
  { id: 's1', kind: 'pipeline', mode: 'thin',       expect: { contextLost: 10 } },
  { id: 's2', kind: 'pipeline', mode: 'structured', expect: { contextLost: 0 } },
  { id: 's3', kind: 'memory', accessor: 'coder', owner: 'researcher', key: 'findings', expect: { ok: false } },
  { id: 's4', kind: 'memory', accessor: 'researcher', owner: 'researcher', key: 'findings', expect: { ok: true } },
  { id: 's5', kind: 'skill', bot: 'researcher', skill: 'edit-code', expect: { ok: false } },
  { id: 's6', kind: 'skill', bot: 'coder', skill: 'run-tests', expect: { ok: true } },
  { id: 's7', kind: 'loop', a: 'coder', b: 'reviewer', maxRounds: 4, doneAfter: null, expect: { terminated: 'cap', rounds: 4 } },
  { id: 's8', kind: 'loop', a: 'coder', b: 'reviewer', maxRounds: 6, doneAfter: 2, expect: { terminated: 'done', rounds: 2 } },
];

export function buildTeam() {
  return createTeam(ROSTER);
}

// Run one scripted step against a team and return { step, outcome, matches }.
export function runStep(team, step) {
  let outcome;
  switch (step.kind) {
    case 'pipeline': {
      const run = team.runPipeline(TASK, { mode: step.mode });
      outcome = { contextLost: run.contextLost, run };
      break;
    }
    case 'memory':
      outcome = team.readMemory(step.accessor, step.owner, step.key);
      break;
    case 'skill':
      outcome = team.act(step.bot, { skill: step.skill });
      break;
    case 'loop':
      outcome = team.pingpong({ a: step.a, b: step.b, maxRounds: step.maxRounds, doneAfter: step.doneAfter });
      break;
    default:
      throw new Error(`unknown step kind '${step.kind}'`);
  }
  const matches = Object.entries(step.expect).every(([k, v]) => outcome[k] === v);
  return { step, outcome, matches };
}

export function runScenario() {
  const team = buildTeam();
  return STEPS.map(step => runStep(team, step));
}

// Field-survival table for the CLI/UI comparison: what each handoff mode
// delivers across the task's two seams.
export function fieldSurvival() {
  const rows = [];
  for (const mode of ['thin', 'structured']) {
    const team = buildTeam();
    const run = team.runPipeline(TASK, { mode });
    const delivered = new Set();
    for (const leg of run.legs) {
      for (const f of PACKET_FIELDS) if (leg.delivered?.[f] !== undefined) delivered.add(f);
    }
    rows.push({
      mode,
      survived: PACKET_FIELDS.filter(f => delivered.has(f)),
      lost: PACKET_FIELDS.filter(f => !delivered.has(f)),
      contextLost: run.contextLost,
    });
  }
  return rows;
}
