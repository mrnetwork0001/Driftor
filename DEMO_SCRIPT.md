# Driftor demo video (aim for 2:50; judges stop at 3:00)

Judges watch this first, so open on the most interesting moment.

**Before recording:**
- `npm run dev` is running.
- `npm run driftor:preflight` is all green.
- Open these tabs: the landing page, `/app`, and `/hud`.
- Have a terminal ready with a large font.

Kane takes about a minute per objective. Record the hook session live and speed up the waiting (2–4×) in editing, keeping Kane's step lines readable.

---

## 0:00–0:20 · The hook

**Show:** `/app`. Click **Generate Production API Key** and nothing happens. Then the terminal: `npm run test:unit` shows 4/4 green.

> This button is dead, and every unit test passes. Unit tests run in JSDOM, which never lays out the page, so it can't see that something invisible is sitting on top of the button.

(Before recording, run `npm run driftor:inject -- overlay` off camera.)

## 0:20–1:30 · The loop, live

**Terminal:** `npm run agent`, then ask Claude: *"Show each API key's age next to its created date."*

> I'm asking Claude for something unrelated. Driftor is a Claude Code Stop hook, so Claude can't finish until Kane CLI has clicked through the app in real Chrome.

Show Claude finishing the feature and trying to stop. The hook runs Kane: show Chrome opening and Kane's steps, ending in `✗ … button is covered`. Then the hook feedback appears in Claude's session.

> Kane's verdict goes straight back into the same Claude session, with the failing steps and the raw trace. Claude isn't told what the bug is.

Claude says *"Let me look for what's covering those buttons"*, edits `MaintenanceNotice.tsx`, and stops. Kane runs again: `Driftor: Kane verified all 2 objectives in real Chrome. ✓`

> It found a missing `pointer-events-none` on an invisible full-screen layer, fixed one word, and Kane proved it. No human in the loop. After three failed tries, it hands over to a person.

## 1:30–2:10 · Not a one-trick demo

**Show:** the landing page, section *03 · Bug zoo*.

> Three one-line bugs, each a plausible agent mistake. Unit tests pass every one. Kane fails each in the layout it actually breaks: desktop, the narrow mobile layout, or both. Every cell here is read from an archived Kane run.

**Show:** the run log in *05 · The evidence*. Point at the "Claude Code stop hook" rows.

> And it isn't only a bug catcher. Asked for a cookie banner, Claude built one and Kane passed it first time. That's proof the change is safe.

## 2:10–2:45 · Install it

**Show:** `driftor.config.json`, then `.claude/settings.json`.

> Your objectives are plain English in one config file, with no selectors. The hook is a single entry in Claude Code's settings. Point it at your own app and every UI change your agent makes has to get past a real browser.

## 2:45–2:55 · Close

**Show:** the landing hero.

> Your tests clicked the button. Your users can't. Driftor makes Kane check before your agent says done.
