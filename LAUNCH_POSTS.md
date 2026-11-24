# Driftor launch posts

The hackathon asks for at least two public posts (X, LinkedIn, Hacker News or Reddit) linking to the project. Hashtags and who to tag: https://www.kaneclihack.sh/o/launch. Add the repo, video and live links before posting.

---

## Post 1 · X

```
AI coding agents say "done" when the unit tests pass, but those tests run in a simulated browser that never actually draws the page.
So a button covered by an invisible overlay, or a label that disappears on smaller screens, passes every test and ships broken.
I'm building Driftor for #KaneCLIHackathon: a Claude Code hook that won't let the agent finish until the app has been checked in a real browser.
When Claude stops, Driftor runs plain-English checks in real Chrome at desktop and narrow window sizes, and sends any failure back to Claude to fix.
It also has Kane write new tests from the task itself, so the new feature gets checked too, not just the old flows.
Why @TestMuAI Kane CLI: you describe what to check in plain English, and Kane does it in a real Chrome browser, so I don't maintain brittle Playwright selectors.
Each run also produces an evidence pack and a step-by-step trace, so Claude learns exactly which step failed and what was on screen.
To test it, I wrote 5 one-line bugs that the unit tests all miss, and Kane catches every one.
Built with @claudeai Claude Code.
Repo + demo: <repo link>
```

---

## Post 2 · LinkedIn / Hacker News / Reddit

**Title:** I made Claude Code prove its UI changes in a real browser before it's allowed to say "done"

```
Coding agents check their UI work with unit tests, and unit tests usually run in JSDOM. JSDOM builds the page but never draws it. It doesn't know what's on top of what, which elements are hidden at a given screen width, or what the browser cache hands back, so a test can "click" a button no real user can reach.

To test this, I wrote five one-line bugs an agent could easily make. The unit suite stays green on every one (27/27):
• a full-screen wrapper (there to position a toast) loses pointer-events-none, so every click on the page is swallowed
• a loading-state pointer-events-none is left on the main button
• a closed mobile menu is faded with opacity-0 but not made invisible, so it still catches taps
• the top-up link is hidden below the lg breakpoint, so it's gone on narrower screens
• a fetch uses the browser cache instead of no-store, so after a top-up the server has the new balance but the page still shows the old $4,500

For the TestMu AI Kane CLI hackathon I built Driftor, a Claude Code Stop hook. When the agent tries to end its turn, Driftor picks the plain-English Kane CLI checks that the changed files can affect and runs them in real Chrome, at 1920×1080 and 800×1000. It also has Kane design new tests from the task the agent was given, so the new feature is checked, not just the old flows. If anything fails, the hook blocks the stop and gives Claude Kane's failing steps and raw trace, in the same session, without telling it what the bug is. Claude fixes it, and Kane re-verifies. After three tries a human gets the evidence.

Kane fails each of the five bugs where it should, and every verdict is an archived run in the repo. In one real session Claude built a Revoke key button; Kane wrote two tests from the request ("revoke KEY-001 and keep KEY-002 after a reload", "revoke the last key") and both passed. The same gate also runs as a GitHub Actions check with a sticky PR comment.

Things I learned about Kane along the way:
• Ask it to "click the button" and it may Tab + Enter around a covered one. Say "with a mouse click".
• Trust the step-level verdicts, not the closing summary. The steps were right, but the summary sometimes named the wrong cause (it blamed a cookie banner for a hidden link).
• Web runs bottom out at 800px wide, and `config set-window` rejects smaller sizes but still exits 0, so check the setting actually changed. Kane also resets an attached Chrome to 1920px wide.
• Tests Kane designs can use {{variables}} it never fills in. Give it the app's starting data, and skip any test that still has an empty one.

Repo, with real traces and agent transcripts: <repo link>
```
