# Driftor

**Your tests clicked the button. Your users can't.**

Driftor is a Claude Code hook that won't let a coding agent finish a UI change until **Kane CLI** has clicked through the app in real Chrome, in both its desktop and its mobile layout. When a click doesn't land, the hook hands Kane's evidence back to the agent in the same session. The agent fixes the bug, and Kane checks again.

It exists for one class of bug that's easy for an agent to ship: the page *looks* right, every unit test passes, and the button doesn't work.

Built for the Kane CLI Online Hackathon (TestMu AI, November 2026).

[![Kane CLI 0.10](https://img.shields.io/badge/Kane%20CLI-0.10.5-black.svg)](https://kaneclihack.sh)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-black.svg)](LICENSE)

---

## The blind spot

Agents check their own UI work with unit tests: Vitest or Jest, running in JSDOM. JSDOM builds the DOM but never lays it out. It doesn't know what's on top of what, so `fireEvent.click(button)` reaches the button no matter what covers it.

Driftor ships with a **bug zoo**: three one-line regressions an agent could plausibly make. All three keep the unit suite green and break a real click.

| Bug | The one-line change | Unit tests (JSDOM) | Kane · desktop 1920×1080 | Kane · narrow 800×1000 | Run |
|---|---|---|---|---|---|
| *healthy* | none | ✓ 4 passed (4) | ✓ pass | ✓ pass | [run](kane-traces/runs/2026-11-18T07-52-23-072Z/run.json) |
| `overlay`: Transparent full-screen wrapper takes the clicks | `app/app/MaintenanceNotice.tsx`: `className="pointer-events-none fixed inset-0 z-50"` → `className="fixed inset-0 z-50"` | ✓ 4 passed (4) | **✗ fail** | **✗ fail** | [run](kane-traces/runs/2026-11-18T07-54-35-217Z/run.json) |
| `pointer-events`: Loading-state class left on the button | `app/app/CloudScaleDashboard.tsx`: `className="shrink-0 rounded-md bg-cs-brand` → `className="pointer-events-none shrink-0 rounded-md bg-cs-brand` | ✓ 4 passed (4) | **✗ fail** | ✓ pass | [run](kane-traces/runs/2026-11-18T07-56-14-114Z/run.json) |
| `opacity`: Closed mobile menu faded out, not removed | `app/app/CloudScaleDashboard.tsx`: `: "invisible opacity-0"` → `: "opacity-0"` | ✓ 4 passed (4) | ✓ pass | **✗ fail** | [run](kane-traces/runs/2026-11-18T07-58-22-453Z/run.json) |

Every verdict above comes from a real run archived in [`kane-traces/runs/`](kane-traces/runs/). The site's *Bug zoo* section reads them live.

---

## The loop

```
  you: "add X"  ──►  Claude Code edits the app, unit tests pass, tries to end its turn
                          │
                          ▼  Stop hook: driftor.js --hook
                 source changed since the last green run?  ── no ──►  turn ends
                          │ yes
                          ▼
                 kane-cli run "<objective>" --agent      (real Chrome, 1920×1080 and 800×1000)
                          │
               passed ────┴──── failed
                 │                 │
           turn ends,        {"decision": "block", "reason": <Kane's failing steps + raw NDJSON>}
           "verified ✓"            │
                                   ▼
                          Claude fixes it in the same session, tries to stop again ──► (hook runs Kane again)
                          after 3 failed attempts the turn ends and a human gets the evidence
```

- **Objectives are plain English** ([`driftor.config.json`](driftor.config.json)). They say what a user does and what should happen, never a selector or a coordinate. They also require a *mouse* click: without that, Kane's agent once reached a covered button with Tab + Enter and passed, which a mouse user never could.
- **Every run starts from the same state.** Before each objective the runner calls the app's reset endpoint, then sets Kane's window to the objective's viewport. It restores your window size afterwards, including on Ctrl-C.
- **Every gate run is archived** to `kane-traces/runs/<timestamp>/`. Each one has a `run.json` recording what triggered it (hook, CLI or watcher), the unit-suite result, which bug was injected, and each objective's verdict.
- **The agent gets evidence, not the answer.** The feedback holds Kane's failing steps, its end-of-run analysis and the raw NDJSON. It never names the file or the fix. The agent may not edit tests, objectives, Driftor or the traces.
- **The hook is opt-in.** It only acts in sessions started with `DRIFTOR_HOOK=1` (`npm run agent`), so an ordinary Claude session in this repo never spends Kane credits. It skips Kane entirely when the source hasn't changed since the last green run.

### Two real sessions

Both ran as `DRIFTOR_HOOK=1 claude -p "<prompt>"` against this repo. Transcripts, diffs and the hook's Kane runs are in [`kane-traces/agent-sessions/`](kane-traces/agent-sessions/), and the site replays them.

**1. A bug already on the branch, an unrelated request.** With `overlay` injected (Claude wasn't told), the prompt was *"show each API key's age next to its created date"*.

```
claude      Done — one-line change at app/app/CloudScaleDashboard.tsx:335
driftor ✗   Driftor ran your change through Kane CLI in real Chrome and it failed (attempt 1 of 3).
            [Kane's failing steps + raw NDJSON: the click on "Generate Production API Key" never landed]
claude      Let me look for what's covering those buttons.
claude      Found it. MaintenanceNotice renders a fixed inset-0 z-50 layer over the entire viewport …
            pointer-events-none is missing on the outer div, so that invisible full-screen layer swallows every click
✎           app/app/MaintenanceNotice.tsx
driftor ✓   Driftor: Kane verified all 2 objectives in real Chrome. ✓
```

That's 12 turns and 291 s in one session, with no human in it. The hook's two gate runs are archived with `"trigger": "claude-stop-hook"`: the [failed run](kane-traces/runs/2026-11-18T08-00-54-950Z/run.json) and the [passing run](kane-traces/runs/2026-11-18T08-03-06-216Z/run.json).

**2. Unscripted: "add a cookie consent banner".** On healthy code, Claude wrote `CookieConsent.tsx` (a bottom bar layered above the maintenance toast, with the choice saved in localStorage) and mounted it. When it stopped, Kane ran both objectives against the new banner and [passed them](kane-traces/runs/2026-11-18T08-08-24-322Z/run.json). That's the other half of the job: proving a change is safe, not only catching a broken one. The banner is still in the demo app.

---

## Run it

**Requirements:** Node 18+, Google Chrome and a TestMu AI account for Kane CLI (`kane-cli` is installed as a dev dependency). For the agent loop you also need [Claude Code](https://claude.com/claude-code); `driftor:heal` falls back to Gemini CLI.

```bash
git clone https://github.com/mrnetwork0001/Driftor.git
cd Driftor
npm install
npm run kane:login          # one-time, opens the browser

npm run dev                 # terminal 1: the site and the demo app
npm run driftor:preflight   # terminal 2: checks Node, Kane login, the app, an agent
```

**The agent loop:**

```bash
npm run driftor:inject -- overlay   # put a bug from the zoo on the branch (unit tests still pass)
npm run agent                       # Claude Code with the hook armed; ask it for any change
```

When Claude tries to finish, Kane runs. The failure goes back to Claude, and it keeps working until Kane passes.

**The gate on its own:**

```bash
npm run driftor:gate                # every objective in Chrome; exits 1 on failure
npm run driftor:zoo                 # list the bugs
npm run driftor:inject -- opacity   # inject one (reverts any other first)
npm run driftor:heal                # one-shot: send the evidence to claude -p, then re-verify
npm run driftor:reset               # revert any injected bug
```

Each Kane objective takes about a minute, so a full gate (two objectives) takes about two minutes.

### All commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js on the first free port from 3000. The runner finds it automatically. |
| `npm run agent` | `DRIFTOR_HOOK=1 claude`: Claude Code with the Kane Stop hook armed. |
| `npm run driftor:gate` | Runs every objective; exits 1 if any fails. Add `-- --headless` for CI, `-- --url <url>` for another app. |
| `npm run driftor:test` | Same runner directly. `-- --only narrow-viewport-gate` runs one objective. |
| `npm run driftor:zoo` | Lists the bug-zoo regressions and which one is live. |
| `npm run driftor:inject -- <bug>` | Injects a bug (`overlay` by default), then runs the unit tests to show they still pass. |
| `npm run driftor:reset` | Reverts any injected bug. |
| `npm run driftor:heal` | One-shot heal for agents without hooks: prompt from the failing traces → `claude -p` (or `gemini`) → re-run the gate. |
| `npm run driftor:watch` | Re-runs the gate when watched source changes. |
| `npm run driftor:preflight` | Checks Node, `kane-cli`, the Kane login, the running app and a heal agent. |
| `npm run test:unit` | The JSDOM unit suite ([`tests/unit/`](tests/unit/)). |

### Point it at your own app

Copy [`driftor.config.json`](driftor.config.json) and [`.claude/settings.json`](.claude/settings.json) into your project, plus `driftor.js`, `driftor_test.js` and `lib/heal.js`. Then edit the config:

```jsonc
{
  "app": "my storefront (Next.js, source in src/)",   // how the agent's bug report names your app
  "url": "http://localhost:5173",                     // or null to scan localhost ports for "marker"
  "reset": null,                                      // optional POST endpoint to reset state before each objective
  "unit": "npm test",                                 // optional: recorded next to Kane's verdict
  "watch": ["src"],                                   // the hook only runs Kane when these change
  "maxHealAttempts": 3,
  "objectives": [
    { "id": "checkout", "viewport": "1920x1080", "title": "Checkout works",
      "objective": "Open {{url}}/cart. Click \"Checkout\" with a mouse click, as a user would. Verify the page shows \"Order confirmed\"." }
  ]
}
```

### In CI

```yaml
- run: npm ci
- run: npm run build && (npm start &) && npx wait-on http://localhost:3000
- run: npx kane-cli login --username "$KANE_USER" --access-key "$KANE_KEY"
- run: npm run driftor:gate -- --headless
```

Store the Kane credentials as repository secrets.

---

## What's in the box

| Path | What |
|---|---|
| [`/`](app/(site)/page.tsx) | The Driftor site. Its bug zoo, verdict panels and run log read the archived runs in `kane-traces/runs/`. |
| [`/app`](app/app/) | **CloudScale**, the demo app Driftor guards: an API-gateway dashboard with a real backend ([`app/api/cloudscale/`](app/api/cloudscale/)). Keys come from a CSPRNG and only the prefix is stored; quota and an audit log persist to `.data/cloudscale.json`. |
| [`/hud`](app/(site)/hud/page.tsx) | Traces viewer: every objective's NDJSON events, plus the exact feedback the agent would get right now. |
| [`.claude/settings.json`](.claude/settings.json) | Registers the Stop hook. |
| [`driftor.js`](driftor.js) | CLI: gate, `--hook`, `--heal`, `--watch`, `--inject`, `--list`, `--reset`. |
| [`driftor_test.js`](driftor_test.js) | Kane runner: config, viewport switching, state reset, unit verdict, retry on no-verdict, archiving. |
| [`driftor.config.json`](driftor.config.json) | Objectives and app settings. |
| [`lib/heal.js`](lib/heal.js) | NDJSON → findings → the agent's bug report. Shared by the CLI, the hook and the website. |
| [`lib/regressions.js`](lib/regressions.js) | The bug zoo. |
| [`kane-traces/`](kane-traces/) | Archived gate runs (`runs/`), agent sessions (`agent-sessions/`) and runs set aside with an explanation (`discarded-runs/`). |
| [`specs/PRD.md`](specs/PRD.md) | The use cases (UC-01 to UC-03) the objectives check. |
| [`tests/unit/`](tests/unit/) | The JSDOM suite that can't see the bugs. |

---

## Honest limits

- **Kane's end-of-run summary can be wrong about transparent layers.** It reasons from a screenshot, and sometimes says the button was *not* covered when it was. The step-level events (the click that couldn't land) are right. The agent's feedback says so.
- **Kane can also be stricter than a browser.** An early version of the demo app had a decorative gradient layer *behind* the key button. Real clicks reached the button, but Kane's agent treated the overlapping layer as covering it and failed the healthy app. We removed the layer and re-ran everything; those runs are kept in [`kane-traces/discarded-runs/`](kane-traces/discarded-runs/). Keep decorative layers out of a button's box.
- **Kane can't render a phone-width web page.** `kane-cli config set-window` accepts widths from 800 to 3840 px, and Kane resets the viewport to its configured window even when attached to a phone-emulated Chrome over `--cdp-endpoint` (we tried). So the second objective runs at 800×1000: below the demo app's 1024px breakpoint, so it gets the mobile layout, but it isn't a 375px phone. Real phones in Kane mean its native-app emulator/device targets. Also note: `set-window` exits 0 even when it rejects a size, so the runner reads the setting back and stops if it didn't change.
- **Kane's window size is a global setting.** The runner changes it per objective and restores it afterwards. Don't run two gates at once.
- **The zoo's bugs are injected on purpose**, so the demo is repeatable. The hook and gate are generic: see the agent sessions in `kane-traces/agent-sessions/` for unscripted runs.
- **Kane runs cost credits.** Check with `npm run kane:balance`.

## License

[Apache 2.0](LICENSE)
