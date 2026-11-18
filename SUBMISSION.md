# Driftor — Kane CLI Online Hackathon submission

**Repository:** _add GitHub link_
**Demo video (≤ 3 min, unlisted):** _add link_
**Live URL:** _add Vercel link_. Locally: `npm install && npm run dev`, then open http://localhost:3000
**Agent:** Claude Code (Stop hook). `driftor:heal` falls back to Gemini CLI.

## The paragraph

Driftor is a Claude Code Stop hook that won't let a coding agent finish a UI change until Kane CLI has clicked through the app in real Chrome. It's for developers who let agents touch their frontend and have been burned by changes that pass every unit test but leave a button dead: a transparent overlay, a `pointer-events-none` left behind, a closed menu that still catches taps. When Claude tries to end its turn, the hook runs plain-English Kane objectives at 1920×1080 and at 800×1000 (the app's mobile layout), with app state reset before each. If a click doesn't land, the hook blocks the stop and hands Claude Kane's failing steps and raw NDJSON in the same session. Claude fixes the bug and stops again, and the hook re-runs Kane, for up to three attempts before a human is called. In our recorded session, Claude was asked for an unrelated feature while a click-swallowing bug sat on the branch. Kane caught it, Claude found and fixed it from the evidence alone, and Kane verified the fix: 12 turns, no human. Kane is the only judge of "done".

## Quick checks for judges

- **It runs:** `npm install && npm run dev`. The site, the demo app (`/app`) and the traces viewer (`/hud`) all read the committed evidence, so no Kane login is needed just to look.
- **Kane caught something:** the bug zoo has three one-line bugs. Unit tests pass 4/4 on each, and Kane fails each one where it should. Every verdict is an archived run in `kane-traces/runs/`.
- **Kane proved something:** the healthy baseline, and Claude's unscripted cookie banner, both pass in Chrome.
- **Agent ↔ Kane:** `kane-traces/agent-sessions/` holds the sanitized transcripts. The site's "The loop" section replays the hook blocking Claude with Kane's evidence, and Claude fixing it.
- **Run the loop yourself:** `npm run kane:login`, `npm run driftor:inject -- overlay`, then `npm run agent` and ask Claude for any change.

## What we learned about Kane

- **Kane's agent will route around a blocked button.** Asked to "click the button", it once used Tab and Enter on a covered button and passed. The objectives now require a mouse click and forbid workarounds.
- **Its end-of-run summary can misjudge transparent layers.** It sometimes says the button was "visibly available" while the step-level evidence correctly says the click never landed. The heal prompt tells the agent to trust the steps.
- **It can be stricter than a browser.** A decorative layer *behind* a button made Kane fail a healthy page. We removed the layer and kept those runs, with an explanation, in `kane-traces/discarded-runs/`.
- **Web runs can't go below 800px wide.** `config set-window 375x812` is rejected, but the command still exits 0. Attaching Kane to a phone-emulated Chrome doesn't help either: Kane resets the viewport. So we test the mobile layout at 800×1000, and the runner now checks that the window size really changed.
