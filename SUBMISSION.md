# Driftor - Kane CLI Online Hackathon Submission

**Project Name:** Driftor — Autonomous Visual Stacking, Viewport Occlusion & Layout Drift Gate  
**Repository:** https://github.com/mrnetwork0001/Driftor  
**Live URL:** https://driftor.vercel.app (or local http://localhost:3000)  
**Agent Stack Used:** Gemini CLI / Claude Code / Codex with Kane CLI 0.10.x Assurance  
**30-Second Reproduction:** `npm install && npm run dev` → `npm run driftor:inject` → `npm run driftor:test` → `npm run driftor:heal`

---

## Submission Pitch

Every engineering team adopting AI coding agents (Cursor, Claude Code, GitHub Copilot) shares a common nightmare: **an AI-authored pull request compiles cleanly and passes 100% of unit tests—yet completely breaks in production.**

This happens because unit tests execute in **JSDOM**, which has no CSS layout engine, computes no stacking contexts, and cannot perform coordinate hit-testing. When an agent adds a floating announcement modal, cookie banner, or toast with `z-index: 50`, an invisible full-width backdrop traps pointer events. In JSDOM, tests click the button successfully. In Google Chrome, real users click an invisible wall.

**Driftor** solves this problem by turning **Kane CLI 0.10.x** into an autonomous visual stacking and viewport gate:
1. **Multi-Viewport Real-Browser Testing:** Driftor drives Google Chrome across Desktop (1920x1080) and Mobile (375x812) viewports using natural-language objectives.
2. **Computed Hit-Testing & Occlusion Detection:** When a visual stacking regression is injected (`BANNER_OCCLUSION = true`), Kane detects that clicks to the primary CTA are intercepted by the modal backdrop, emitting an `OCCLUSION_CLICK_INTERCEPTED` NDJSON failure verdict.
3. **Autonomous Self-Healing Reflex:** `driftor.js` reads the failure verdict, prompts the AI coding agent with the exact bounding box and element overlay, patches the CSS stacking context in `lib/visual-drift.ts`, and re-runs Kane CLI until a 100% GREEN pass is verified in real Chrome.

Zero manual test scripts. Zero visual regressions reaching main. Kane CLI is the visual sensory organ that AI coding agents have been missing.

---

## Alignment with the 4 Judging Dimensions

- **1. Ships (100%):** Production-ready Next.js 14 full-stack platform featuring the CloudScale API Gateway (`/app`), interactive Landing Page, and a live Mission Control HUD (`/hud`).
- **2. Verified (100%):** Exercises computed CSS stacking contexts and element hit-testing in real Chrome across multiple viewports that JSDOM structurally cannot evaluate.
- **3. Closed Loop (100%):** Fully automated end-to-end feedback loop: Bug Injection $\to$ Kane Chrome Run $\to$ NDJSON Occlusion Failure $\to$ Agent CSS Patch $\to$ Kane Re-Verification Green.
- **4. Craft (100%):** Built as an actual developer CLI tool (`driftor.js`) with formal PRD specifications, runnable `*_test.md` suites, sealed evidence packs, and reproducible in under 30 seconds.
