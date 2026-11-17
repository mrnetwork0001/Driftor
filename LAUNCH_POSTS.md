# Driftor: Public Launch Posts

> [!NOTE]
> The hackathon submission guidelines require at least **two public launch posts** (e.g. X / Twitter, LinkedIn, Reddit, Hacker News) sharing your project and linking to your submission. Use the pre-written posts below.

---

## 🐦 Post 1: X (Twitter) Launch Thread

**Post Text:**
```
🚨 AI coding agents generate code fast, but they have a massive blind spot: JSDOM.

Unit tests pass 100%. But in real browsers, invisible CSS z-index backdrops occlude buttons and mobile viewports collapse.

Introducing Driftor: Autonomous Visual Stacking & Viewport Occlusion Gate for AI PRs, powered by @TestMuAI Kane CLI! 🧵👇

1/ The JSDOM Blind Spot:
Vitest/Jest have no layout engine and compute no stacking contexts. An agent can create a modal where an overlay blocks your primary CTA, yet unit tests click right through it. Real users hit a wall.

2/ Plain-English Real-Browser Verification:
Kane CLI 0.10.x opens real Google Chrome across Desktop (1920x1080) and Mobile (375x812) viewports, dispatches coordinate-level clicks, and catches intercepted mouse events with structured NDJSON telemetry.

3/ The Closed Loop (Red -> Green -> Heal):
When an agent introduces a stacking bug (BANNER_OCCLUSION=true):
1. Kane catches the intercepted click in Chrome.
2. Driftor feeds the failure trace to the agent.
3. The agent auto-patches the CSS stacking context.
4. Kane re-runs in Chrome until 100% GREEN!
Zero humans in the loop!

Check out the repo & 30s reproduction:
🔗 GitHub: https://github.com/mrnetwork0001/Driftor
⚡ Built for the @TestMuAI Kane CLI Hackathon!

#KaneCLI #AIAgents #WebDev #Automation #DevOps #Testing
```

---

## 💼 Post 2: LinkedIn / Hacker News / Reddit Post

**Post Title:**
`Driftor: Catching What JSDOM Cannot See in AI Coding Agents with Kane CLI 0.10.x`

**Post Body:**
```markdown
While AI coding assistants (Cursor, Claude Code, Copilot) have accelerated software development, they share a critical vulnerability: they rely on unit tests running in JSDOM.

Because JSDOM has no CSS layout engine, it cannot compute stacking contexts (`z-index`) or perform coordinate hit-testing. When an AI agent introduces a floating banner, modal, or toast with a transparent backdrop, unit tests click the button successfully—while in real user browsers, the button is completely occluded and unreachable.

For the TestMu AI Kane CLI Online Hackathon, I built **Driftor**: an Autonomous Visual Stacking, Viewport Occlusion & Layout Drift Gate for AI PRs.

Here is how it works:
1. **Multi-Viewport Testing:** Driftor drives Google Chrome across Desktop (1920x1080) and Mobile (375x812) viewports using natural-language Kane CLI objectives.
2. **Computed Hit-Testing:** Kane evaluates real element hit-testing in Chrome, detecting when a modal overlay intercepts clicks intended for the primary CTA and emitting an `OCCLUSION_CLICK_INTERCEPTED` NDJSON failure verdict.
3. **Autonomous Self-Healing:** Driftor feeds the failure context to an AI coding agent, applies the surgical CSS patch in the component, and re-executes Kane CLI until a 100% GREEN pass is achieved.

Reproducible in under 30 seconds:
GitHub: https://github.com/mrnetwork0001/Driftor

Huge kudos to the TestMu AI team for building Kane CLI!
```
