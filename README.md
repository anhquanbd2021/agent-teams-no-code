# Handoff Lab — companion demo

Interactive lab for the article *Your AI Team Doesn't Need Code. It Still
Needs Engineering.* Configure a roster of bots — each a **role card**
(pinned model + enabled skills + tools + private memory + persona) — run a
task through handoffs, and watch exactly which context crosses the seam.

Zero dependencies — Node 20+ only. The team model and scripted scenario are
plain ES modules shared by the browser UI, the CLI report, and the test
suite. No model is ever called; everything is simulated in memory.

## Four mechanisms

| Mechanism | What it proves |
|---|---|
| **Handoff modes** | A *thin* handoff passes a message and drops every packet field at the seam (the "rumor about the work" failure). A *structured* handoff carries `goal / constraints / evidence / artifacts / done` — and flags any field the sender forgot instead of losing it silently. |
| **Scoped memory** | Each bot's memory lives inside its profile. A cross-bot read is denied and audited — isolation is the feature, not a detail. |
| **Skill gating** | A bot can only use skills its role card enables. `researcher` attempting `edit-code` is denied; the card, not the prompt, is the enforcement. |
| **Termination** | A coder↔reviewer request-changes loop without a done-condition only stops at the round cap — bots are polite, tireless, and billed per turn. |

## Run it

```text
npm start       # serve the lab on :3000
npm test        # team model + scenario parity + server
npm run report  # thin-vs-structured field survival + scripted outcomes
npm run check   # both
```

## Examples

- `examples/team-config.json` — the seeded roster (researcher on a small
  local model, coder on a frontier model, reviewer on a mid model) and the
  `rate-limit-login` task the pipeline runs. A test asserts it stays in
  parity with `public/scenario.mjs`.

## Honest limits

- No model is ever called — "work" is a stub that writes findings. The lab
  shows what crosses the seam, not what an LLM does with what arrives.
- Memory isolation is a property check, not a security boundary; real
  isolation is whatever the agent runtime gives each profile.
- The packet schema mirrors the *contract* idea, not any product's wire
  format (Bot Mode for Hermes Desktop passes messages via an Agent Inbox;
  how much context the sender writes into them is the user's protocol).
- The loop model is serial turns; real bot-to-bot delivery is
  per-invocation with no mid-flight interrupt.

This is an educational demo, not production infrastructure.
