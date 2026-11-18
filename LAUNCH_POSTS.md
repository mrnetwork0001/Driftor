# Driftor launch posts

The hackathon asks for at least two public posts (X, LinkedIn, Hacker News or Reddit) linking to the project. Hashtags and who to tag: https://www.kaneclihack.sh/o/launch. Add the repo, video and live links before posting.

---

## Post 1 · X thread

```
Your tests clicked the button. Your users can't.

I built Driftor for the #KaneCLIHackathon: a Claude Code hook that won't let the agent say "done" until @TestMuAI Kane CLI has clicked through the app in real Chrome. 🧵

1/ The bug class: one missing class on an invisible full-screen layer. Every button on the page is dead. Unit tests: 4/4 green, because JSDOM never lays out the page, so it can't see what's on top.

2/ The loop: Claude finishes a change → Stop hook runs Kane on desktop + mobile layout → a click doesn't land → the hook blocks the stop and hands Claude Kane's evidence, same session → Claude fixes it → Kane re-verifies. 3 tries, then a human.

3/ In the recorded run I asked Claude for an unrelated feature while that bug sat on the branch. It shipped the feature, Kane caught the dead button, Claude found the missing pointer-events-none on its own, and Kane passed it. 12 turns, no human.

4/ Plus a bug zoo of three one-line UI bugs that all pass unit tests and all fail in Kane, and every verdict is a real archived run. No mocks.

<repo link> · <video link>
#KaneCLI #ClaudeCode #AIAgents
```

---

## Post 2 · LinkedIn / Hacker News / Reddit

**Title:** I made Claude Code prove its UI changes in a real browser before it's allowed to say "done"

```
Coding agents check their UI work with unit tests, and unit tests run in JSDOM. JSDOM builds the DOM but never lays it out. It doesn't know what's on top of what, so a test can "click" a button that no real user can reach.

Three one-line changes an agent could easily make, each of which leaves the unit suite green and a button dead:
• a full-screen wrapper (there to position a toast) loses pointer-events-none
• a loading-state pointer-events-none is left on the button
• a closed mobile menu is faded with opacity-0 but not made invisible, so it still catches taps

For the TestMu AI Kane CLI hackathon I built Driftor, a Claude Code Stop hook. When the agent tries to end its turn after changing the UI, Driftor runs plain-English Kane CLI objectives in real Chrome, at desktop size and in the app's mobile layout. If a click doesn't land, the hook blocks the stop and gives Claude Kane's failing steps and raw trace, in the same session, without telling it what the bug is. Claude fixes it, and Kane re-verifies. After three tries a human gets the evidence.

Things I learned about Kane along the way:
• Ask it to "click the button" and it may Tab + Enter around a covered one. Say "with a mouse click".
• Its end-of-run summary can misjudge transparent layers; the step-level evidence is what to trust.
• Web runs bottom out at 800px wide, and `config set-window` rejects smaller sizes but still exits 0, so check the setting actually changed.

Repo, with real traces and agent transcripts: <repo link>
```
