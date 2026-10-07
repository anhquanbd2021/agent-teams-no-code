import { PACKET_FIELDS } from '/team.mjs';
import { ROSTER, TASK, buildTeam, runStep, STEPS } from '/scenario.mjs';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const option = (value, label) => {
  const opt = el('option', '', label ?? value);
  opt.value = value;
  return opt;
};

let team = buildTeam();

const accessorSelect = $('accessor');
const ownerSelect = $('owner');
for (const name of ['user', ...team.roster]) accessorSelect.append(option(name));
accessorSelect.value = 'coder';
for (const name of team.roster) ownerSelect.append(option(name));
ownerSelect.value = 'researcher';

function renderRoster() {
  const list = $('roster');
  list.replaceChildren();
  for (const name of team.roster) {
    const d = team.describe(name);
    const li = el('li', 'member');
    const left = el('div');
    left.append(el('strong', '', `${d.title} `));
    left.append(el('span', 'badge info', d.model));
    const right = el('div', 'muted', `skills: ${d.skills.join(', ')} · tools: ${d.tools.join(', ')}`);
    li.append(left);
    li.append(right);
    list.append(li);
  }
}

function currentMode() {
  return document.querySelector('input[name=mode]:checked')?.value ?? 'structured';
}

function renderLegs(run) {
  const list = $('legs');
  list.replaceChildren();
  for (const leg of run.legs) {
    const cls = leg.dropped.length || leg.missing.length ? 'fail' : 'pass';
    const item = el('li', `result ${cls}`);
    const head = el('div', 'result-head');
    head.append(el('span', `badge ${cls}`, `${leg.from} → ${leg.to}`));
    head.append(el('span', 'badge info', run.mode));
    item.append(head);
    const fields = el('p');
    const parts = [];
    for (const f of PACKET_FIELDS) {
      if (leg.delivered?.[f] !== undefined) parts.push(`✓ ${f}`);
      else if (leg.dropped.includes(f)) parts.push(`✗ ${f} (dropped at seam)`);
      else parts.push(`✗ ${f} (never sent)`);
    }
    fields.textContent = parts.join('  ·  ');
    item.append(fields);
    list.append(item);
  }
  $('context-score').textContent = run.contextLost
    ? `${run.contextLost} packet fields lost`
    : 'all context crossed';
  $('context-score').className = `badge ${run.contextLost ? 'fail' : 'pass'}`;
}

function renderAudit() {
  const log = $('audit');
  log.replaceChildren();
  const entries = team.audit.slice(-30);
  for (const e of entries) {
    const cls = e.result === 'allowed' ? 'pass' : e.result === 'denied' ? 'fail' : 'fail';
    const item = el('li', `result ${cls}`);
    const head = el('div', 'result-head');
    const label = e.result === 'allowed' ? 'ALLOW' : e.result === 'denied' ? 'DENY' : 'WARN';
    head.append(el('span', `badge ${e.result === 'allowed' ? 'pass' : e.result === 'denied' ? 'fail' : 'warn'}`, label));
    head.append(el('strong', '', `${e.actor} · ${e.action}`));
    item.append(head);
    item.append(el('p', '', e.reason));
    log.append(item);
  }
  $('audit-count').textContent = String(team.audit.length);
}

function runPipeline() {
  team = buildTeam();
  const run = team.runPipeline(TASK, { mode: currentMode() });
  renderLegs(run);
  renderAudit();
}

function compareBoth() {
  team = buildTeam();
  const results = ['thin', 'structured'].map(mode => team.runPipeline(TASK, { mode }));
  const list = $('legs');
  list.replaceChildren();
  for (const run of results) {
    const item = el('li', `result ${run.contextLost ? 'fail' : 'pass'}`);
    const head = el('div', 'result-head');
    head.append(el('span', `badge ${run.contextLost ? 'fail' : 'pass'}`, run.mode));
    head.append(el('strong', '', run.contextLost ? `${run.contextLost} packet fields lost` : 'all context crossed'));
    item.append(head);
    const detail = el('p');
    const lost = new Set();
    for (const leg of run.legs) {
      for (const f of leg.dropped) lost.add(`dropped:${f}`);
      for (const f of leg.missing) lost.add(`missing:${f}`);
    }
    detail.textContent = lost.size ? [...lost].join(', ') : 'goal, constraints, evidence, artifacts, done — delivered at every seam';
    item.append(detail);
    list.append(item);
  }
  $('context-score').textContent = 'thin vs structured';
  $('context-score').className = 'badge info';
  renderAudit();
}

function peek() {
  team.readMemory(accessorSelect.value, ownerSelect.value, 'findings');
  renderAudit();
}

function skillCheck() {
  team.act('researcher', { skill: 'edit-code', detail: 'role card never enabled it' });
  renderAudit();
}

function runLoop() {
  team = buildTeam();
  const doneAfter = $('has-done').checked ? 2 : null;
  const res = team.pingpong({ a: 'coder', b: 'reviewer', maxRounds: Number($('max-rounds').value), doneAfter });
  const badge = $('loop-result');
  badge.textContent = res.terminated === 'cap'
    ? `cut by cap after ${res.rounds} rounds`
    : `done-condition met at round ${res.rounds}`;
  badge.className = `badge ${res.terminated === 'cap' ? 'fail' : 'pass'}`;
  renderAudit();
}

$('run').addEventListener('click', runPipeline);
$('run-both').addEventListener('click', compareBoth);
$('peek').addEventListener('click', peek);
$('skill-check').addEventListener('click', skillCheck);
$('loop').addEventListener('click', runLoop);

renderRoster();
// Replay the scripted scenario once so the audit log opens non-empty.
for (const step of STEPS.slice(2)) runStep(team, step);
renderAudit();
