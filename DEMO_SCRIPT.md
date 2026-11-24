# Driftor demo video (aim for 2:50; judges stop at 3:00)

Judges watch this first, so open on the most interesting moment.

**Before recording:**
- `npm run dev` is running.
- `npm run driftor:preflight` is all green.
- Open these tabs: the landing page, `/app`, and `/hud`.
- Have a terminal ready with a large font.

Kane takes about a minute per objective, and a few more minutes when it designs tests from the task. Record the hook session live and speed up the waiting (2–4×) in editing, keeping Kane's step lines readable.

---

## 0:00–0:20 · The hook

**Show:** `/app`. Click **Generate Production API Key** and nothing happens. Then the terminal: `npm run test:unit` shows 27/27 green.

> This button is dead, and every unit test passes. Unit tests run in JSDOM, which never draws the page, so it can't see that something invisible is sitting on top of the button.

(Before recording, run `npm run driftor:inject -- overlay` off camera.)

## 0:20–1:20 · The loop, live

**Terminal:** `npm run agent`, then ask Claude: *"Show each API key's age next to its created date."*

> I'm asking Claude for something unrelated. Driftor is a Claude Code Stop hook, so Claude can't finish until Kane CLI has checked the app in real Chrome.

Show Claude finishing the feature and trying to stop. The hook runs Kane: show Chrome opening and Kane's steps, ending in `✗ … button is covered`. Then the hook feedback appears in Claude's session.

> The hook only runs the checks the changed files can affect. Kane's verdict goes straight back into the same Claude session, with the failing steps and the raw trace. Claude isn't told what the bug is.

Claude says *"Let me look for what's covering those buttons"*, edits `MaintenanceNotice.tsx`, and stops. Kane runs again and passes.

> It found a missing `pointer-events-none` on an invisible full-screen layer, fixed one word, and Kane proved it. No human in the loop. After three failed tries, it hands over to a person.

## 1:20–1:50 · Not a one-trick demo

**Show:** the landing page, section *03 · Bug zoo*.

> Five one-line bugs, each a plausible agent mistake: dead clicks, a link hidden on narrow screens, and a page that shows a stale balance after a successful top-up. Unit tests pass every one. Kane fails each in the layout it actually breaks. Every cell here is read from an archived Kane run.

## 1:50–2:20 · Tests from the task

**Show:** *05 · The evidence*, the run log row whose "from task" column reads 2/2. Then `/hud` or the run folder `kane-traces/runs/2026-11-24T00-05-41-127Z`.

> The old checks only cover the old flows. So when Claude stops, Kane also designs new tests from the task it was given. Here Claude built a Revoke key button, and Kane wrote two tests from that one sentence: revoke KEY-001 and keep KEY-002 after a reload, then revoke the last key. Both passed in Chrome.

## 2:20–2:45 · Install it

**Show:** `driftor.config.json`, then `.claude/settings.json`, then `.github/workflows/driftor.yml`.

> Your checks are plain English in one config file, with no selectors. The hook is one entry in Claude Code's settings, `driftor init` sets it up in another Next.js or Vite repo, and the same gate runs on pull requests with one sticky comment.

## 2:45–2:55 · Close

**Show:** the landing hero.

> Your tests clicked the button. Your users can't. Driftor makes Kane check before your agent says done.
