#!/usr/bin/env node
/**
 * Driftor - real-browser gate for AI-written UI changes
 * ---------------------------------------------------------------------------
 *   node driftor.js                 # run the Kane gate; exits 1 if any objective fails
 *   node driftor.js --heal          # send the failing Kane evidence to a coding agent, then re-verify
 *   node driftor.js --watch         # re-run the gate when watched source changes
 *   node driftor.js --inject [bug]  # ship a bug-zoo regression into the demo app (default: overlay)
 *   node driftor.js --list          # list the bug-zoo regressions
 *   node driftor.js --reset         # revert every injected regression (demo housekeeping, not a heal)
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { parseNdjson, extractFindings, buildHealPrompt } = require("./lib/heal");
// The bug zoo only exists in the Driftor repo; other projects don't need it.
const zooModule = () => {
  try {
    return require("./lib/regressions");
  } catch {
    console.error(" ✗ The bug zoo (lib/regressions.js) isn't in this project.");
    process.exit(1);
  }
};

const ROOT = __dirname;
const TRACE_DIR = path.join(ROOT, "kane-traces");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "driftor.config.json"), "utf8"));

const line = (c = "=") => console.log(c.repeat(78));
const passthrough = () => process.argv.slice(2).filter((a) => a === "--headless");

function runGate({ capture = false, env = {} } = {}) {
  const res = spawnSync(process.execPath, [path.join(ROOT, "driftor_test.js"), ...passthrough()], {
    cwd: ROOT,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { passed: res.status === 0, output: capture ? `${res.stdout || ""}${res.stderr || ""}` : "" };
}

function runUnitTests() {
  const res = spawnSync("npx", ["vitest", "run", "--reporter=dot"], { cwd: ROOT, stdio: "inherit" });
  return res.status === 0;
}

function readFindings() {
  if (!fs.existsSync(TRACE_DIR)) return [];
  const findings = [];
  for (const file of fs.readdirSync(TRACE_DIR).sort()) {
    if (!file.endsWith(".ndjson") || file === "latest.ndjson") continue;
    const events = parseNdjson(fs.readFileSync(path.join(TRACE_DIR, file), "utf8"));
    findings.push(...extractFindings(file, events));
  }
  return findings;
}

/* ── bug zoo ──────────────────────────────────────────────────────────────── */

function cmdList() {
  const zoo = zooModule();
  line();
  console.log(" 🐛 DRIFTOR BUG ZOO — one-line regressions JSDOM can't see");
  line();
  const live = zoo.active();
  for (const [name, r] of Object.entries(zoo.REGRESSIONS)) {
    console.log(` ${live.includes(name) ? "●" : "○"} ${name.padEnd(15)} ${r.title}`);
    console.log(`   ${"".padEnd(15)} ${r.story}`);
  }
  console.log("\n Inject one with `npm run driftor:inject -- <name>`.");
}

function cmdInject(name = "overlay") {
  const zoo = zooModule();
  line();
  console.log(" 💉 DRIFTOR — SHIPPING A UI REGRESSION INTO THE DEMO APP");
  line();
  const r = zoo.REGRESSIONS[name];
  if (!r) {
    console.error(` ✗ Unknown regression "${name}". Available: ${Object.keys(zoo.REGRESSIONS).join(", ")}`);
    process.exit(1);
  }
  const reverted = zoo.resetAll();
  if (reverted.length) console.log(` ↺ Reverted earlier injection: ${reverted.join(", ")}`);

  const result = zoo.inject(name);
  if (result === "missing") {
    console.error(` ✗ Couldn't find the healthy code for "${name}" in ${r.file}. Was the file edited?`);
    process.exit(1);
  }
  console.log(` ✓ ${name}: ${r.title}`);
  console.log(`   ${r.file}`);
  console.log(`   - ${r.healthy}`);
  console.log(`   + ${r.regressed}`);
  console.log(`   ${r.story}\n`);

  console.log(" 🧪 Unit tests (Vitest + JSDOM) on the regressed code:");
  const ok = runUnitTests();
  console.log(ok ? "\n   JSDOM: all green. It has no layout engine, so it can't see this." : "\n   (unit tests failed — check the output above)");
  console.log("\n 👉 Next: `npm run driftor:gate` — Kane runs the same flows in real Chrome.");
}

function cmdReset() {
  const reverted = zooModule().resetAll();
  console.log(reverted.length ? ` ✓ Reverted: ${reverted.join(", ")}` : " ✓ No injected regression found; nothing to reset.");
}

/* ── heal (one-shot agent call) ───────────────────────────────────────────── */

function healWithAgent(prompt) {
  const agents = [
    { name: "claude", args: ["-p", prompt, "--permission-mode", "acceptEdits"] },
    { name: "gemini", args: ["--prompt", prompt, "--yolo"] },
  ];
  for (const agent of agents) {
    const which = spawnSync("which", [agent.name], { encoding: "utf8" });
    if (which.status !== 0 || !which.stdout.trim()) continue;
    console.log(` 🚀 Handing the evidence to ${agent.name}…\n`);
    const res = spawnSync(agent.name, agent.args, {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      timeout: 10 * 60 * 1000,
    });
    if (res.status === 0) return agent.name;
    console.log(`\n ⚠️  ${agent.name} exited with ${res.status ?? res.signal}.`);
  }
  return null;
}

function cmdHeal() {
  line();
  console.log(" 🔁 DRIFTOR — HEAL FROM KANE EVIDENCE");
  line();

  const findings = readFindings();
  if (!findings.length) {
    console.log(" ✓ No failing steps in kane-traces/. Run `npm run driftor:gate` first.");
    return;
  }

  const prompt = buildHealPrompt(findings, { app: CONFIG.app });
  console.log(" 📄 Prompt for the agent, built from the failing NDJSON events:\n");
  console.log(prompt.split("\n").map((l) => `   │ ${l}`).join("\n"));
  console.log("");

  const agent = healWithAgent(prompt);
  if (!agent) {
    console.error(" ❌ No coding agent completed the fix. Install Claude Code (`claude`) or Gemini CLI (`gemini`).");
    process.exit(1);
  }

  console.log("\n 🧪 Re-running the Kane gate to verify the agent's fix in real Chrome…");
  const { passed } = runGate({ env: { DRIFTOR_TRIGGER: "heal-verify" } });
  line();
  if (passed) {
    console.log(` 🎉 HEALED: ${agent} fixed it and Kane verified every objective in Chrome.`);
  } else {
    console.log(` ❌ Still failing after ${agent}'s patch. New evidence is in kane-traces/.`);
    process.exit(1);
  }
}

/* ── watch ────────────────────────────────────────────────────────────────── */

function cmdWatch() {
  const dirs = CONFIG.watch || ["app"];
  line();
  console.log(` 👁️  DRIFTOR — WATCHING ${dirs.join(", ")}`);
  line();
  let timer = null;
  const trigger = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n ⚡ ${file} changed — running the Kane gate…`);
      runGate({ env: { DRIFTOR_TRIGGER: "watch" } });
    }, 800);
  };
  for (const dir of dirs) {
    if (fs.existsSync(path.join(ROOT, dir))) {
      fs.watch(path.join(ROOT, dir), { recursive: true }, (_evt, file) => file && trigger(file));
    }
  }
  console.log(" ✓ Watching. Ctrl+C to stop.");
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const after = (f) => {
  const v = args[args.indexOf(f) + 1];
  return v && !v.startsWith("--") ? v : undefined;
};

if (args.includes("--inject")) cmdInject(after("--inject"));
else if (args.includes("--list")) cmdList();
else if (args.includes("--heal")) cmdHeal();
else if (args.includes("--reset")) cmdReset();
else if (args.includes("--watch")) cmdWatch();
else process.exit(runGate().passed ? 0 : 1);
