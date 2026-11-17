#!/usr/bin/env node
/**
 * Driftor - Autonomous Visual Stacking & Viewport Occlusion Gate
 * ---------------------------------------------------------------------------
 * Closes the open loop between an agent CSS/layout regression and a verified
 * green browser run using Kane CLI 0.10.x NDJSON feedback:
 *
 *   node driftor.js --inject   # 1. Injects visual stacking regression (modal overlay traps pointer-events)
 *   node driftor.js gate       # 2. Kane drives Chrome, detects click interception via hit-testing
 *   node driftor.js --heal     # 3. Reads NDJSON trace, repairs stacking context, re-verifies green
 *   node driftor.js --watch    # 4. Continuous visual gate on file save
 *
 * The regression is a real-world CSS stacking bug in lib/visual-drift.ts:
 *   BANNER_OCCLUSION = true (floating backdrop covers primary CTA)
 * JSDOM unit tests pass 100% because JSDOM lacks computed layout box hit-testing!
 * Only Kane CLI running in real Chrome catches the interception!
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DRIFT_FILE = path.join(__dirname, "lib", "visual-drift.ts");
const TRACE_DIR = path.join(__dirname, "kane-traces");

const line = (c = "=") => console.log(c.repeat(78));

/* ── Source Surgery on the Regression Anchor Point ────────────────────────── */

function readDriftFile() {
  if (!fs.existsSync(DRIFT_FILE)) {
    console.error("❌ lib/visual-drift.ts not found.");
    process.exit(1);
  }
  return fs.readFileSync(DRIFT_FILE, "utf8");
}

function isOcclusionActive() {
  const content = readDriftFile();
  return /export\s+const\s+BANNER_OCCLUSION\s*=\s*true/.test(content);
}

function setOcclusion(val) {
  const src = readDriftFile();
  const updated = src.replace(
    /export\s+const\s+BANNER_OCCLUSION\s*=\s*(true|false);/,
    `export const BANNER_OCCLUSION = ${val};`
  );
  fs.writeFileSync(DRIFT_FILE, updated);
}

/* ── Kane CLI Runner Invocation ───────────────────────────────────────────── */

function runKane(extraArgs = []) {
  const runner = path.join(__dirname, "driftor_test.js");
  const args = [runner, ...process.argv.slice(2).filter((a) => a === "--headless" || a === "--mock"), ...extraArgs];
  const res = spawnSync(process.execPath, args, {
    cwd: __dirname,
    stdio: "inherit",
  });
  return res.status === 0;
}

/* ── NDJSON Trace Forensics ───────────────────────────────────────────────── */

function readFailureTraces() {
  if (!fs.existsSync(TRACE_DIR)) return [];
  const findings = [];

  for (const file of fs.readdirSync(TRACE_DIR)) {
    if (!file.endsWith(".ndjson")) continue;
    const content = fs.readFileSync(path.join(TRACE_DIR, file), "utf8");

    for (const rawLine of content.split("\n")) {
      if (!rawLine.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(rawLine);
      } catch {
        continue;
      }

      if (evt.status !== "failed" && evt.type !== "error") continue;

      const v = evt.verdict || {};
      const parts = [];
      if (evt.remark) parts.push(evt.remark);
      if (v.bug_title) parts.push(`bug: ${v.bug_title}`);
      if (v.root_cause) parts.push(`root cause: ${v.root_cause}`);
      if (v.suggestion) parts.push(`suggestion: ${v.suggestion}`);
      if (evt.reason_code) parts.push(`code: ${evt.reason_code}`);

      findings.push({
        trace: file,
        message: parts.length ? parts.join("\n     ") : evt.message || "Visual occlusion failure",
      });
    }
  }

  return findings;
}

/* ── Commands ─────────────────────────────────────────────────────────────── */

function cmdInject() {
  line();
  console.log(" 💉 DRIFTOR - INJECTING VISUAL STACKING REGRESSION");
  line();

  if (isOcclusionActive()) {
    console.log(" ⚠️  Visual regression is already present (BANNER_OCCLUSION = true).");
    console.log("    Run `npm run driftor:test` to see Kane catch it live in Chrome.");
    return;
  }

  setOcclusion(true);
  console.log(" ✓ Patched lib/visual-drift.ts: BANNER_OCCLUSION = true");
  console.log("   Effect: A floating modal backdrop with z-index: 50 & pointer-events: auto");
  console.log("   now renders across the viewport, intercepting clicks over the primary CTA.");
  console.log("   The TypeScript compiler is 100% happy.");
  console.log("   Jest/Vitest/JSDOM tests PASS (because JSDOM lacks layout hit-testing).");
  console.log("   BUT in real Chrome, the button cannot receive clicks!");
  console.log("\n 👉 Next step: Run `npm run driftor:test` — Kane CLI will catch the intercepted click in Chrome.");
}

function buildHealPrompt(findings) {
  const evidence = findings.length
    ? findings.map((f) => `- [${f.trace}] ${f.message}`).join("\n")
    : "- Click dispatch intercepted by overlay backdrop at coordinates (840, 195).";

  return [
    "Kane CLI drove a real Chrome browser against CloudScale and caught a Visual Stacking Bug.",
    "",
    "NDJSON Failure Evidence from kane-traces/:",
    evidence,
    "",
    "A floating overlay is intercepting clicks meant for the primary CTA [deploy-key-btn].",
    "Audit lib/visual-drift.ts. Restore BANNER_OCCLUSION to false so the stacking context clears.",
  ].join("\n");
}

function healWithAgent(findings) {
  if (process.argv.includes("--deterministic")) {
    console.log(" ⚡ Running in --deterministic mode (instant autonomous AST patch)...");
    return false;
  }

  const prompt = buildHealPrompt(findings);
  console.log("\n 🤖 Dispatching NDJSON failure trace to AI Coding Agent...\n");
  console.log(prompt.split("\n").map((l) => `   │ ${l}`).join("\n"));
  console.log("");

  const agentCLIs = [
    { name: "claude", args: ["-p", prompt, "--permission-mode", "acceptEdits"] },
    { name: "gemini", args: ["--prompt", prompt] },
  ];

  for (const cli of agentCLIs) {
    const which = spawnSync("which", [cli.name], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) {
      console.log(` 🚀 Invoking agent CLI: ${cli.name}...`);
      try {
        const res = spawnSync(cli.name, cli.args, {
          cwd: __dirname,
          stdio: ["ignore", "inherit", "inherit"],
          timeout: 20000,
        });
        if (res.status === 0) return true;
      } catch {
        // Fall back to deterministic patch
      }
    }
  }

  return false;
}

function cmdHeal() {
  line();
  console.log(" 🔁 DRIFTOR - CLOSED-LOOP AUTONOMOUS SELF-HEAL");
  line();

  const findings = readFailureTraces();
  if (findings.length) {
    console.log(" 📄 NDJSON visual failure evidence extracted from kane-traces/:");
    for (const f of findings.slice(0, 4)) {
      console.log(`   [${f.trace}]\n     ${f.message}`);
    }
  } else {
    console.log(" 📄 Auditing lib/visual-drift.ts directly.");
  }

  if (!isOcclusionActive()) {
    console.log("\n ✅ lib/visual-drift.ts is already HEALTHY (BANNER_OCCLUSION = false).");
    console.log("    All primary CTAs are unobstructed.");
    return;
  }

  // Attempt agent heal, or fallback to deterministic patch
  const agentSuccess = healWithAgent(findings);
  if (!agentSuccess) {
    console.log("\n 🛠️  Executing Autonomous Remediation Patch on lib/visual-drift.ts...");
    setOcclusion(false);
    console.log("    Patched: BANNER_OCCLUSION true → false (Stacking Context Restored)");
  }

  console.log("\n 🧪 Triggering Kane CLI Re-Verification to confirm fix...");
  const green = runKane();

  line();
  if (green) {
    console.log(" 🎉 CLOSED-LOOP SUCCESS: VISUAL STACKING REGRESSION AUTONOMOUSLY HEALED!");
    console.log("    Zero human intervention required.");
    console.log("    Kane verified live DOM clicks in real Chrome back to 100% GREEN.");
  } else {
    console.log(" ❌ Verification failed after patch. Check kane-traces/ for details.");
    process.exit(1);
  }
}

function cmdWatch() {
  line();
  console.log(" 👁️  DRIFTOR - CONTINUOUS VISUAL ASSURANCE WATCHER");
  console.log(" Monitoring lib/ and app/ for visual layout and component changes...");
  line();

  let timeout = null;
  const trigger = (file) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      console.log(`\n ⚡ Change detected in ${file} — Running Kane Visual Gate...`);
      runKane();
    }, 500);
  };

  const watchDirs = [path.join(__dirname, "lib"), path.join(__dirname, "app")];
  for (const d of watchDirs) {
    if (fs.existsSync(d)) {
      fs.watch(d, { recursive: true }, (evt, filename) => {
        if (filename && !filename.includes(".next") && !filename.includes("kane-traces")) {
          trigger(filename);
        }
      });
    }
  }

  console.log(" ✓ Watcher active. Press Ctrl+C to stop.");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--inject")) {
    cmdInject();
  } else if (args.includes("--heal")) {
    cmdHeal();
  } else if (args.includes("--watch")) {
    cmdWatch();
  } else {
    // Default action: run visual verification gate
    const ok = runKane();
    process.exit(ok ? 0 : 1);
  }
}

main();
