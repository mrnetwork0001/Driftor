# Driftor: Kane CLI Online Hackathon submission

**Repository:** https://github.com/mrnetwork0001/Driftor
**Demo video (≤ 3 min, unlisted):** _add link_
**Live URL:** _add Vercel link_. Locally: `npm install && npm run dev`, then open http://localhost:3000
**Agent:** Claude Code (Stop hook). `driftor:heal` falls back to Gemini CLI.

## The paragraph

Driftor is a Claude Code Stop hook that won't let a coding agent finish a UI change until Kane CLI has checked the app in real Chrome. It's for developers who let agents touch their frontend and have been burned by changes that pass every unit test but still break the page: a transparent overlay that eats clicks, a control that vanishes on narrow screens, a page that shows an old balance after a successful save. When Claude tries to end its turn, the hook works out which plain-English objectives the changed files can affect, runs them at 1920×1080 and 800×1000 with fresh app state for each run, and has Kane design new acceptance tests from the task Claude was given, so the new feature gets checked too, not just the old flows. If anything fails, the hook blocks the stop and hands Claude Kane's failing steps and raw NDJSON in the same session. Claude fixes it and stops again, and Kane re-runs, for up to three attempts before a human is called. In one recorded session Claude was asked for an unrelated feature while a click-swallowing bug sat on the branch: Kane caught it, Claude fixed it from the evidence alone, and Kane verified the fix in 12 turns with no human. In another, Claude built a Revoke button and Kane designed two tests from the request and passed both. The same gate runs in CI and posts one sticky PR comment. Kane is the only judge of "done".

## Quick checks for judges

- **It runs:** `npm install && npm run dev`. The site, the demo app (`/app`) and the traces viewer (`/hud`) all read the committed evidence, so no Kane login is needed just to look.
- **Kane caught something:** the bug zoo (`lib/regressions.js`) has five one-line bugs. The unit suite stays green on every one (27/27 in the 2026-11-23 runs), and Kane fails each where it should: `overlay` on both viewports, `pointer-events` on desktop, `opacity` and `breakpoint` on the narrow layout, and `stale-cache` on both (the server recorded the top-up, but the page kept showing $4,500.00). Every verdict is an archived run in `kane-traces/runs/`.
- **Kane proved something:** the healthy baseline passes in Chrome, and so do two features Claude built under the hook: a cookie banner, and a Revoke key button (run `2026-11-24T00-05-41-127Z`). For the Revoke button Kane designed two acceptance tests from the task, "Revoke KEY-001 and retain KEY-002 after reload" and "Revoke the last remaining KEY-002", and both passed.
- **Agent ↔ Kane:** `kane-traces/agent-sessions/` holds the sanitized transcripts. The site's "The loop" section replays the hook blocking Claude with Kane's evidence, and Claude fixing it.
- **Only what changed runs:** `node driftor_test.js --changed` or `--files a,b`. The hook passes the changed files in `DRIFTOR_CHANGED_FILES`, and each objective lists the files it `covers` in `driftor.config.json`. Shared or unknown files run everything.
- **Tests from the task:** `npm run driftor:accept -- "<task>"` has Kane's assurance commands design acceptance tests from a sentence and run them next to the gate (`lib/acceptance.js`, the `acceptance` block in the config).
- **CI:** `.github/workflows/driftor.yml` runs the gate headless, judges the evidence pack against `policies/driftor-gate.yaml` and keeps one sticky PR comment (`scripts/ci.js`). It needs the `KANE_USERNAME` and `KANE_ACCESS_KEY` secrets (`docs/ci.md`) and has not been run on GitHub yet.
- **Another app:** `npx github:mrnetwork0001/Driftor init` (`scripts/init.js`) sets Driftor up in a Next.js or Vite repo. On mdn/todo-react it passed the healthy app in 119 s and caught an injected `pointerEvents: none` on the Add button in 61 s. Those runs are not archived in this repo.
- **Run the loop yourself:** `npm run kane:login`, `npm run driftor:inject -- overlay`, then `npm run agent` and ask Claude for any change.

## What we learned about Kane

- **Kane's agent will route around a blocked button.** Asked to "click the button", it once used Tab and Enter on a covered button and passed. The objectives now require a mouse click and forbid workarounds.
- **Trust the steps, not the closing summary.** The step-level verdicts were right every time, but the end-of-run explanation sometimes named the wrong cause. It blamed the cookie banner for the `breakpoint` and `opacity` failures, and said the click "landed above" the button for `stale-cache`, where the click worked and the page was showing cached data. The heal prompt tells the agent to trust the steps.
- **It can be stricter than a browser.** A decorative layer *behind* a button made Kane fail a healthy page. We removed the layer and kept those runs, with an explanation, in `kane-traces/discarded-runs/`.
- **Web runs can't go below 800px wide.** `config set-window 375x812` is rejected, but the command still exits 0, so the runner checks that the window size really changed. We test the narrow layout at 800×1000.
- **Kane resets an attached Chrome to 1920px.** Attaching Kane to a phone-emulated Chrome doesn't help, and it is also why `--parallel` gives no speedup. Driftor gives each objective its own Chrome at its own size, but Kane resizes that Chrome, the runner sees the viewport is wrong and does not trust the verdict, and the objective re-runs one at a time.
- **Designed tests can declare variables with no values.** Kane sometimes writes tests that use `{{variables}}` it never fills in. Driftor now gives Kane the app's starting data (`acceptance.startingData`), and skips any test that still has an empty variable, reporting it as "no verdict" instead of a failure.
