# Driftor

> **Autonomous Visual Stacking, Viewport Occlusion & Layout Drift Gate for AI Coding Agents**  
> *Built for the Kane CLI Online Hackathon (November 12 – 19, 2026) by TestMu AI*

[![Kane CLI Verified](https://img.shields.io/badge/Verified%20with-Kane%20CLI%200.10.x-fuchsia.svg)](https://kaneclihack.sh)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.2.5-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-emerald.svg)](LICENSE)

---

## 🎯 The Problem: The JSDOM Blind Spot in AI Coding Agents

Engineering teams using AI coding agents (Cursor, Claude Code, GitHub Copilot, Devin) face a common, silent failure mode:

> **AI-generated pull requests compile cleanly and pass 100% of unit tests—yet completely break in real user browsers.**

Why? Because unit test runners (Jest, Vitest) execute inside **JSDOM**:
- JSDOM has **no CSS layout engine**.
- JSDOM cannot compute **stacking contexts (`z-index`)**.
- JSDOM does not perform coordinate hit-testing (`document.elementFromPoint`).
- JSDOM does not simulate viewport resizing or mobile layout reflows.

When an AI agent adds a floating announcement modal, cookie banner, or sticky toast, it often leaves a transparent full-width backdrop with `z-index: 50` and `pointer-events: auto`. 
- In JSDOM, `getByRole('button').click()` succeeds.
- In Google Chrome, real users click the invisible backdrop—and the button **never receives the click**.

---

## 💡 The Solution: Driftor + Kane CLI 0.10.x

**Driftor** is an autonomous pre-commit and CI/CD quality gate that closes this open loop. 

Using **Kane CLI 0.10.x**, Driftor:
1. Boots the application across **Desktop (1920x1080)** and **Mobile (375x812)** viewports.
2. Dispatches coordinate-level user journeys in real Google Chrome.
3. Performs live element hit-testing: if a modal backdrop or floating layer intercepts the mouse event, Kane immediately captures the `OCCLUSION_CLICK_INTERCEPTED` NDJSON failure verdict.
4. Triggers an autonomous **Red-Green-Heal reflex**: passes the failure evidence to an AI agent, surgically patches the CSS stacking context in the source file, and re-runs Kane until **100% GREEN**.

---

## 🏛️ Architecture Overview

```
                                  ┌─────────────────────────────┐
                                  │   PRD / Specification Docs  │
                                  │       (specs/PRD.md)        │
                                  └──────────────┬──────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────┐   kane-cli context & design   ┌─────────────────────────────┐
│    CloudScale Target App    │◄──────────────────────────────┤  Kane CLI Assurance Engine  │
│      (Next.js 14 + TS)      │                               │  - Multi-Viewport Journeys  │
│  - Desktop (1920x1080)      │                               │  - Computed Hit-Testing     │
│  - Mobile Viewport (375px)  │                               │  - NDJSON Telemetry Stream  │
│  - Primary CTA Provisioning │                               └──────────────┬──────────────┘
└──────────────┬──────────────┘                                              │
               │                                                             │
               │ real Chrome click dispatch                                  ▼
               └───────────────────────────► ┌──────────────────────────────────────────────┐
                                             │       Autonomous Guardian (driftor.js)       │
                                             │  1. Injects modal backdrop occlusion         │
                                             │  2. Kane catches CLICK_INTERCEPTED in Chrome │
                                             │  3. NDJSON trace parsed for failing bounds   │
                                             │  4. Coding Agent auto-patches CSS stacking   │
                                             │  5. Re-runs Kane to 100% GREEN verification  │
                                             └──────────────────────────────────────────────┘
```

---

## ⚡ 30-Second Reproduction Guide for Judges

You can run and verify the entire autonomous closed loop locally in under 30 seconds:

```bash
# 1. Clone & install dependencies
git clone https://github.com/mrnetwork0001/Driftor.git
cd Driftor
npm install

# 2. Start the local server in Terminal 1
npm run dev
# Running at http://localhost:3000

# 3. In Terminal 2: Run baseline visual verification
npm run driftor:test
# ✓ Kane drives Chrome: All viewports unobstructed (100% GREEN)

# 4. Inject visual stacking regression (passes JSDOM, blocks Chrome)
npm run driftor:inject
# Patches lib/visual-drift.ts: BANNER_OCCLUSION = true (Backdrop z-50 traps clicks)

# 5. Kane CLI catches the click interception live in Chrome
npm run driftor:test
# ❌ Step 2 FAILED: Click intercepted by DIV#occlusion-backdrop at (840, 195)

# 6. Trigger Autonomous Self-Healing
npm run driftor:heal
# 🔁 Agent reads NDJSON trace, repairs stacking context, Kane re-runs to 100% GREEN!
```

*(Note: For offline judge evaluation without an active TestMu AI cloud balance, pass `--mock` to run with deterministic NDJSON emulation: `node driftor_test.js --mock`)*

---

## 🎯 Evaluated Against the 4 Judging Dimensions

| Judging Dimension | How Driftor Delivers |
|---|---|
| **1. Ships** | Production-ready Next.js 14 full-stack platform featuring the CloudScale API Gateway target application (`/app`), interactive Overview, and a live Mission Control HUD (`/hud`). |
| **2. Verified** | Exercises computed visual stacking contexts and element hit-testing across desktop and mobile viewports in real Chrome that unit tests structurally cannot inspect. |
| **3. Closed Loop** | Fully automated end-to-end feedback loop: Bug Injection $\to$ Kane Chrome Run $\to$ NDJSON Occlusion Failure $\to$ Agent CSS Patch $\to$ Kane Re-Verification Green. |
| **4. Craft** | Built as a real developer tool (`driftor.js`) with formal PRD specifications, runnable `*_test.md` suites, sealed NDJSON evidence packs, and zero-config reproducibility. |

---

## 📁 Repository Structure

```
Driftor/
├── app/
│   ├── app/page.tsx         # CloudScale API Gateway (Target app under Driftor protection)
│   ├── hud/page.tsx         # Driftor Mission Control HUD (Telemetry & Stacking Inspector)
│   ├── globals.css          # Tailwind CSS styling & glow filters
│   ├── layout.tsx           # Root Layout with data-driftor="active" marker
│   └── page.tsx             # Interactive Overview & JSDOM Blind Spot Showcase
├── lib/
│   └── visual-drift.ts      # CSS Stacking & Occlusion anchor point
├── specs/
│   └── PRD.md               # Kane CLI 0.10.x Requirements Specification
├── tests/
│   ├── desktop_occlusion_test.md   # Kane CLI Markdown Test: Desktop Stacking
│   └── mobile_viewport_test.md     # Kane CLI Markdown Test: Mobile Viewport
├── kane-traces/             # Sealed NDJSON execution evidence packs
├── driftor_test.js          # Kane CLI Verification Runner with --agent NDJSON streaming
├── driftor.js               # Autonomous Developer CLI & Closed-Loop Guardian
├── package.json
└── README.md
```

---

## 📜 License

Licensed under the [Apache License, Version 2.0](LICENSE).
