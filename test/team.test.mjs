import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeam, PACKET_FIELDS, missingFields } from '../public/team.mjs';
import { ROSTER, TASK, buildTeam } from '../public/scenario.mjs';

const PACKET = {
  message: 'research leg done',
  goal: TASK.goal,
  constraints: TASK.constraints,
  evidence: ['sliding-window rejected'],
  artifacts: ['researcher-output'],
  done: 'reviewer sign-off',
};

test('roster validation rejects duplicate names and missing model pins', () => {
  assert.throws(() => createTeam([{ name: 'a', model: 'm', skills: [] }, { name: 'a', model: 'm', skills: [] }]), /duplicate/);
  assert.throws(() => createTeam([{ name: 'b', skills: [] }]), /model pin/);
  assert.throws(() => createTeam([]), /non-empty/);
});

test('a structured handoff delivers every packet field to the receiver', () => {
  const team = buildTeam();
  const res = team.handoff({ from: 'researcher', to: 'coder', packet: PACKET, mode: 'structured' });
  assert.equal(res.ok, true);
  assert.deepEqual(res.dropped, []);
  assert.deepEqual(res.missing, []);
  for (const f of PACKET_FIELDS) assert.deepEqual(res.delivered[f], PACKET[f]);
  const inbox = team.getBot('coder').inbox;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].from, 'researcher');
});

test('a thin handoff delivers the message and drops every packet field', () => {
  const team = buildTeam();
  const res = team.handoff({ from: 'researcher', to: 'coder', packet: PACKET, mode: 'thin' });
  assert.equal(res.delivered.message, 'research leg done');
  for (const f of PACKET_FIELDS) assert.equal(res.delivered[f], undefined);
  assert.deepEqual([...res.dropped].sort(), [...PACKET_FIELDS].sort());
  assert.equal(res.entry.result, 'warning');
});

test('structured handoff flags fields the sender forgot — no silent loss', () => {
  const team = buildTeam();
  const res = team.handoff({ from: 'coder', to: 'reviewer', packet: { message: 'done', goal: TASK.goal }, mode: 'structured' });
  assert.deepEqual([...res.missing].sort(), ['artifacts', 'constraints', 'done', 'evidence'].sort());
  assert.equal(res.entry.result, 'warning');
});

test('a bot cannot hand off to itself', () => {
  const team = buildTeam();
  const res = team.handoff({ from: 'coder', to: 'coder', packet: PACKET });
  assert.equal(res.ok, false);
  assert.match(res.reason, /itself/);
});

test('private memory is scoped per bot — cross-bot reads are denied and audited', () => {
  const team = buildTeam();
  team.writeMemory('researcher', 'findings', 'dead ends recorded');
  const denied = team.readMemory('coder', 'researcher', 'findings');
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /scoped per bot/);
  const own = team.readMemory('researcher', 'researcher', 'findings');
  assert.equal(own.ok, true);
  assert.equal(own.value, 'dead ends recorded');
  const user = team.readMemory('user', 'researcher', 'findings');
  assert.equal(user.ok, true);
  const denials = team.audit.filter(e => e.result === 'denied' && e.action.startsWith('read-memory'));
  assert.equal(denials.length, 1);
  assert.equal(denials[0].actor, 'coder');
});

test('skill gating denies a skill the role card never enabled', () => {
  const team = buildTeam();
  const denied = team.act('researcher', { skill: 'edit-code' });
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /role card/);
  const allowed = team.act('coder', { skill: 'edit-code' });
  assert.equal(allowed.ok, true);
});

test('pipeline: thin mode loses every field at every seam, structured loses none', () => {
  const thin = buildTeam().runPipeline(TASK, { mode: 'thin' });
  assert.equal(thin.legs.length, 2);
  assert.equal(thin.contextLost, 10); // 5 fields × 2 seams
  const structured = buildTeam().runPipeline(TASK, { mode: 'structured' });
  assert.equal(structured.contextLost, 0);
});

test('each bot keeps its findings in private memory during a pipeline run', () => {
  const team = buildTeam();
  team.runPipeline(TASK, { mode: 'structured' });
  assert.equal(team.readMemory('user', 'researcher', 'findings').value, TASK.findings.researcher);
  assert.equal(team.readMemory('coder', 'researcher', 'findings').ok, false);
});

test('a bot-to-bot loop without a done-condition terminates at the round cap', () => {
  const team = buildTeam();
  const res = team.pingpong({ a: 'coder', b: 'reviewer', maxRounds: 4 });
  assert.equal(res.terminated, 'cap');
  assert.equal(res.rounds, 4);
  assert.equal(res.exchanges.length, 8);
});

test('a written done-condition ends the loop before the cap', () => {
  const team = buildTeam();
  const res = team.pingpong({ a: 'coder', b: 'reviewer', maxRounds: 6, doneAfter: 2 });
  assert.equal(res.terminated, 'done');
  assert.equal(res.rounds, 2);
});

test('missingFields reports exactly the absent packet fields', () => {
  assert.deepEqual(missingFields({ goal: 'g', done: 'd' }).sort(), ['artifacts', 'constraints', 'evidence'].sort());
});
