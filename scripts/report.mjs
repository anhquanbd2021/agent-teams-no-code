// CLI report: thin vs. structured handoff field survival, then every
// scripted scenario step with its expected vs. actual outcome.
import { PACKET_FIELDS } from '../public/team.mjs';
import { STEPS, runScenario, fieldSurvival, TASK } from '../public/scenario.mjs';

const line = (s = '') => console.log(s);

line(`Handoff Lab report — task: "${TASK.goal}"`);
line(`pipeline: ${TASK.pipeline.join(' → ')}`);
line();

line('Packet field survival at the handoff seam');
line('─'.repeat(58));
for (const row of fieldSurvival()) {
  line(`${row.mode.padEnd(11)} survived: ${row.survived.length ? row.survived.join(', ') : '(none)'}`);
  line(`${''.padEnd(11)} lost:     ${row.lost.length ? row.lost.join(', ') : '(none)'}`);
  line(`${''.padEnd(11)} contextLost = ${row.contextLost} fields across ${TASK.pipeline.length - 1} seams`);
  line();
}

line('Scripted scenario — expected vs. actual');
line('─'.repeat(58));
let failures = 0;
for (const { step, outcome, matches } of runScenario()) {
  const mark = matches ? 'PASS' : 'FAIL';
  if (!matches) failures++;
  line(`[${mark}] ${step.id} ${step.kind.padEnd(8)} expected=${JSON.stringify(step.expect)} actual=${JSON.stringify(compact(outcome))}`);
}
line();
line(`${STEPS.length - failures}/${STEPS.length} steps matched expected outcomes`);
process.exit(failures ? 1 : 0);

function compact(outcome) {
  const { run, ...rest } = outcome;
  return rest;
}
