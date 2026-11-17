# Driftor: 3-5 Minute Demo Video Script
### Target Duration: 3:30 - 4:00 | Video Host: YouTube (Public / Unlisted)

---

## ⏱️ [0:00 - 0:45] The Hook: The JSDOM Blind Spot in AI Coding Agents

**Visual:**
- Start on the Driftor Landing Page (`http://localhost:3000`).
- Highlight the headline: *"Catching What JSDOM Cannot See: Autonomous Visual Stacking & Viewport Gate"*.

**Narration:**
> "Hey everyone! Today, AI coding agents like Cursor, Claude Code, and Copilot can write code faster than ever before. But they have a dangerous blind spot:
>
> **They rely on JSDOM to test their code.**
>
> JSDOM has no CSS layout engine. It doesn't compute bounding boxes, and it knows nothing about stacking contexts or `z-index`. An agent can create a beautiful modal or toast, and all your unit tests will pass 100%. But in a real browser, an invisible backdrop overlay traps clicks, and your primary checkout button is completely dead.
>
> That's why we built **Driftor**: an autonomous visual stacking and viewport occlusion gate for AI-generated pull requests, powered by **Kane CLI 0.10.x**."

---

## ⏱️ [0:45 - 1:45] The Target Application (CloudScale Gateway)

**Visual:**
- Navigate to `/app` (CloudScale AI Inference Gateway).
- Point out the active API keys and the primary CTA button: **"Generate Production API Key"**.
- Click the button to show the normal, healthy behavior: key count increments, action status reads `KEY_GENERATED_HEALTHY`, and confetti fires.
- Switch to `/hud` (Driftor Mission Control HUD) to show real-time telemetry and the viewport matrix (Desktop 1920x1080 vs Mobile 375x812).

**Narration:**
> "Here is our target application: CloudScale, an AI inference gateway. The primary action on this page is generating a production API key.
>
> In normal state, Kane CLI runs across both desktop and mobile viewports, dispatches clicks, and confirms all CTAs are unobstructed. Everything is 100% green."

---

## ⏱️ [1:45 - 2:45] Injecting the Visual Stacking Bug & Kane Catching It

**Visual:**
- Open Terminal alongside the browser.
- Run: `npm run driftor:inject`
- Show Terminal output: `Patched lib/visual-drift.ts: BANNER_OCCLUSION = true`.
- Switch back to `/app` to show the floating emergency maintenance banner with its transparent full-width backdrop overlay.
- Run: `npm run driftor:test`
- Show Google Chrome opening via Kane CLI. Kane attempts to click the "Generate Production API Key" button.
- The click hits the backdrop overlay. Kane detects that `elementFromPoint` returned `DIV#occlusion-backdrop` instead of the button.
- Show Terminal output showing Kane's NDJSON failure verdict: `OCCLUSION_CLICK_INTERCEPTED at coordinates (840, 195)`.

**Narration:**
> "Now let's simulate what happens when an AI agent modifies UI styling.
>
> With one command—`npm run driftor:inject`—we introduce a real-world visual stacking bug: a floating maintenance notice renders with `z-index: 50` and an invisible backdrop that traps pointer events.
>
> If you run Jest or Vitest, tests still pass! But watch what happens when we run **Driftor with Kane CLI**.
>
> Kane CLI opens real Google Chrome, calculates coordinates, and attempts to dispatch the click. Boom! Kane catches the occlusion: the click hit the backdrop overlay instead of the button! Kane seals the evidence and outputs structured NDJSON."

---

## ⏱️ [2:45 - 3:45] The Closed Loop: Autonomous Self-Healing & Green Re-Run

**Visual:**
- In Terminal, run: `npm run driftor:heal`
- Show Driftor reading the failure trace, identifying the stacking context in `lib/visual-drift.ts`, repairing `BANNER_OCCLUSION = false`, and immediately triggering Kane re-verification.
- Show Chrome re-opening, clicking the button without obstruction, and passing with **100% GREEN (ALL VISUAL GATES PASSED)**.
- Show `/hud` with the live green verdict and self-healing CSS diff.

**Narration:**
> "Now for the magic: **Closing the Loop**.
>
> We run `npm run driftor:heal`. Driftor ingests Kane's NDJSON trace, feeds the exact overlay failure to the AI agent, automatically patches the CSS stacking context in `lib/visual-drift.ts`, and re-executes Kane CLI.
>
> Look at the screen: Kane re-tests the app in Chrome, confirms the button is reachable, and returns 100% GREEN.
>
> Zero human intervention. No broken UI ever reaches production. This is the power of combining AI coding agents with Kane CLI.
>
> Thank you to the TestMu AI team!"
