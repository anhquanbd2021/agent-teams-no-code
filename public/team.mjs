// Handoff Lab — core model.
// A "bot" is a role card: pinned model + enabled skills + tools + PRIVATE
// memory + persona. A "team" is a roster plus the mechanisms a no-code UI
// makes easy to skip: a handoff contract (what crosses the seam), scoped
// memory (isolation), skill gating (least privilege), and termination
// (a round cap on bot-to-bot loops). Every attempt — allowed or denied —
// lands in one attributed audit log.

export const PACKET_FIELDS = ['goal', 'constraints', 'evidence', 'artifacts', 'done'];

export const FIELD_LABELS = {
  goal: 'Goal — what the next bot is being asked to produce',
  constraints: 'Constraints — limits the answer must respect',
  evidence: 'Evidence — what the sender already learned (incl. dead ends)',
  artifacts: 'Artifacts — files/diffs/notes produced so far',
  done: 'Done-condition — how the receiver knows the task is finished',
};

export function missingFields(packet) {
  return PACKET_FIELDS.filter(f => packet[f] === undefined || packet[f] === null);
}

function validateBotSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('bot spec must be an object');
  if (!spec.name) throw new Error('bot needs a name');
  if (!spec.model) throw new Error(`bot '${spec.name}' needs a model pin`);
  if (!Array.isArray(spec.skills)) throw new Error(`bot '${spec.name}' needs a skills list`);
  return spec;
}

export function createTeam(roster) {
  if (!Array.isArray(roster) || roster.length === 0) {
    throw new Error('team needs a non-empty roster');
  }
  const bots = new Map();
  const audit = [];
  let seq = 0;

  function record(entry) {
    audit.push({ seq: ++seq, ...entry });
    return audit[audit.length - 1];
  }

  for (const spec of roster) {
    validateBotSpec(spec);
    if (bots.has(spec.name)) throw new Error(`duplicate bot '${spec.name}'`);
    bots.set(spec.name, {
      name: spec.name,
      title: spec.title ?? spec.name,
      model: spec.model,
      skills: new Set(spec.skills),
      tools: [...(spec.tools ?? [])],
      persona: spec.persona ?? '',
      memory: new Map(),   // private — scoped to this profile
      inbox: [],           // durable handoff transcript
    });
  }

  const team = {
    roster: [...bots.keys()],
    audit,

    getBot(name) {
      return bots.get(name) ?? null;
    },

    describe(name) {
      const b = bots.get(name);
      if (!b) return null;
      return {
        name: b.name, title: b.title, model: b.model,
        skills: [...b.skills], tools: b.tools, persona: b.persona,
        memoryKeys: [...b.memory.keys], inboxSize: b.inbox.length,
      };
    },

    // A bot's memory is scoped to its profile. Only the owner — or the
    // human operator — can read it. Anything else is a logged denial:
    // isolation is the feature, not a detail.
    readMemory(accessor, owner, key) {
      if (!bots.has(owner)) throw new Error(`unknown bot '${owner}'`);
      const allowed = accessor === 'user' || accessor === owner;
      const value = bots.get(owner).memory.get(key);
      const reason = allowed
        ? `'${accessor}' read ${owner}.${key}`
        : `'${accessor}' cannot read ${owner}.${key} — memory is scoped per bot`;
      record({ actor: accessor, action: `read-memory:${owner}.${key}`, result: allowed ? 'allowed' : 'denied', reason });
      return allowed ? { ok: true, value } : { ok: false, reason };
    },

    writeMemory(name, key, value) {
      const b = bots.get(name);
      if (!b) throw new Error(`unknown bot '${name}'`);
      b.memory.set(key, value);
      return value;
    },

    // Skill gating: an action names the skill it needs; a bot whose role
    // card doesn't enable that skill is denied — the denial is audited.
    act(name, { skill, detail = '' }) {
      const b = bots.get(name);
      if (!b) throw new Error(`unknown bot '${name}'`);
      if (!b.skills.has(skill)) {
        const reason = `'${name}' lacks skill '${skill}' — its role card does not enable it`;
        return { ok: false, reason, entry: record({ actor: name, action: `use-skill:${skill}`, result: 'denied', reason }) };
      }
      const reason = `'${name}' used '${skill}'${detail ? ` — ${detail}` : ''}`;
      return { ok: true, reason, entry: record({ actor: name, action: `use-skill:${skill}`, result: 'allowed', reason }) };
    },

    // Handoff: the seam where context either survives or dies.
    //   mode 'thin'       — only a free-text message crosses; every packet
    //                       field the sender had stays behind (the "rumor
    //                       about the work" failure).
    //   mode 'structured' — packet fields cross; missing required fields
    //                       are flagged as a warning, not silently lost.
    handoff({ from, to, packet = {}, mode = 'structured' }) {
      const sender = bots.get(from);
      const receiver = bots.get(to);
      if (!sender) throw new Error(`unknown sender '${from}'`);
      if (!receiver) throw new Error(`unknown receiver '${to}'`);
      if (from === to) {
        const reason = 'a bot cannot hand off to itself';
        record({ actor: from, action: `handoff→${to}`, result: 'denied', reason });
        return { ok: false, reason };
      }

      const message = String(packet.message ?? '(no message)');
      let delivered, dropped, missing;

      if (mode === 'thin') {
        delivered = { from, message };
        dropped = PACKET_FIELDS.filter(f => packet[f] !== undefined && packet[f] !== null);
        missing = missingFields(delivered);
      } else {
        delivered = { from, message };
        for (const f of PACKET_FIELDS) {
          if (packet[f] !== undefined && packet[f] !== null) delivered[f] = packet[f];
        }
        dropped = [];
        missing = missingFields(delivered);
      }

      receiver.inbox.push({ from, mode, packet: delivered });
      const problems = [
        ...dropped.map(f => `dropped:${f}`),
        ...missing.map(f => `missing:${f}`),
      ];
      const reason = problems.length
        ? `'${from}' → '${to}' (${mode}) — ${problems.join(', ')}`
        : `'${from}' → '${to}' (${mode}) — full packet delivered`;
      const result = dropped.length || missing.length ? 'warning' : 'allowed';
      const entry = record({ actor: from, action: `handoff→${to}`, result, reason });
      return { ok: true, delivered, dropped, missing, entry };
    },

    // A pipeline run: each bot in the chain does its skill-gated work,
    // writes findings to its PRIVATE memory, then hands off to the next.
    // The transcript shows exactly which context survived each seam.
    runPipeline(task, { mode = 'structured' } = {}) {
      const legs = [];
      let carry = { message: task.goal };
      for (let i = 0; i < task.pipeline.length; i++) {
        const name = task.pipeline[i];
        const b = bots.get(name);
        if (!b) throw new Error(`pipeline names unknown bot '${name}'`);

        // The bot works: uses its primary skill and writes private findings.
        const work = team.act(name, { skill: task.skillByBot?.[name] ?? task.skill, detail: task.goal });
        const findings = work.ok ? task.findings?.[name] ?? `${name} completed its leg` : '(work denied — no findings)';
        team.writeMemory(name, 'findings', findings);
        team.writeMemory(name, 'artifacts', [`${name}-output`]);

        if (i + 1 < task.pipeline.length) {
          const packet = team.buildPacket(name, task, carry);
          const leg = team.handoff({ from: name, to: task.pipeline[i + 1], packet, mode });
          // "Lost" = fields not delivered, counted once — thin mode both
          // strips and fails to deliver the same field.
          leg.lost = PACKET_FIELDS.filter(f => leg.delivered?.[f] === undefined);
          legs.push({ from: name, to: task.pipeline[i + 1], ...leg });
          // The NEXT bot sees only what was delivered — that is the point.
          carry = leg.delivered ?? carry;
        }
      }
      const contextLost = legs.reduce((n, l) => n + l.lost.length, 0);
      return { task: task.id, mode, legs, contextLost };
    },

    // What a bot would put in a structured handoff packet for this task.
    buildPacket(name, task, carry = {}) {
      return {
        message: `${task.id}: my leg is done — continuing to next role`,
        goal: task.goal,
        constraints: task.constraints ?? [],
        evidence: [...(carry.evidence ?? []), this.getBot(name) ? `${name} findings logged` : '']
          .filter(Boolean),
        artifacts: [`${name}-output`],
        done: task.done ?? 'reviewer sign-off',
      };
    },

    // Bot-to-bot ping-pong: polite, tireless, and billed per turn. Without a
    // done-condition the loop only ends when the round cap cuts it.
    pingpong({ a, b, maxRounds = 6, doneAfter = null } = {}) {
      if (!bots.get(a) || !bots.get(b)) throw new Error('pingpong needs two known bots');
      const exchanges = [];
      for (let round = 1; round <= maxRounds; round++) {
        exchanges.push({ round, from: a, to: b, text: `${a}: requesting changes` });
        exchanges.push({ round, from: b, to: a, text: `${b}: requesting clarification` });
        if (doneAfter !== null && round >= doneAfter) {
          record({ actor: 'user', action: 'loop', result: 'allowed', reason: `done-condition met at round ${round}` });
          return { terminated: 'done', rounds: round, exchanges };
        }
      }
      record({ actor: 'user', action: 'loop', result: 'warning', reason: `round cap ${maxRounds} reached — loop cut` });
      return { terminated: 'cap', rounds: maxRounds, exchanges };
    },
  };

  return team;
}
