#!/usr/bin/env node
/**
 * Driftor - real-browser gate for AI-written UI changes
 * ---------------------------------------------------------------------------
 *   node driftor.js                 # run the Kane gate; exits 1 if any objective fails
 *   node driftor.js gate --dry-run  # check config, kane-cli and app discovery; no browser, no credits
 *   node driftor.js init            # set Driftor up in another Next.js or Vite repo (scripts/init.js)
 *   node driftor.js --hook          # Claude Code Stop hook: gate the agent's edits, feed failures back
 *   node driftor.js --heal          # send the failing Kane evidence to a coding agent, then re-verify
 *   node driftor.js --watch         # re-run the gate when watched source changes
 *   node driftor.js --inject [bug]  # ship a bug-zoo regression into the demo app (default: overlay)
 *   node driftor.js --list          # list the bug-zoo regressions
 *   node driftor.js --reset         # revert every injected regression (demo housekeeping, not a heal)
 *   node driftor.js --accept "<task>" [--no-gate] [--fresh]
 *                                   # what the hook does with a task: Kane designs acceptance tests
 *                                   # from it (lib/acceptance.js) and runs them next to the gate
 *
 * The hook is opt-in: it only acts when DRIFTOR_HOOK=1 is set for the Claude
 * Code session (`npm run agent`), so ordinary sessions in this repo never
 * spend Kane credits.
 */

const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { parseNdjson, extractFindings, buildHealPrompt } = require("./lib/heal");
const acceptance = require("./lib/acceptance");
// The bug zoo only exists in the Driftor repo; other projects don't need it.
const zooModule = () => {
  try {
    return require("./lib/regressions");
  } catch {
    console.error(" ✗ The bug zoo (lib/regressions.js) isn't in this project.");
    process.exit(1);
  }
};

// `driftor demo` replays archived evidence; it needs no config, no app and no Kane login,
// so it runs from anywhere (`npx -y github:mrnetwork0001/Driftor demo`).
if (process.argv[2] === "demo") {
  const demo = path.join(__dirname, "scripts", "demo.js");
  if (!fs.existsSync(demo)) {
    console.error(" ✗ The demo isn't in this copy of Driftor. Run `npx -y github:mrnetwork0001/Driftor demo`.");
    process.exit(1);
  }
  require(demo)
    .main(process.argv.slice(3))
    .then((code) => process.exit(code), (err) => (console.error(` ✗ demo: ${err.message}`), process.exit(1)));
  return;
}

// `driftor init` sets Driftor up in another repo; it runs before any config exists.
if (process.argv[2] === "init") {
  process.exit(require("./scripts/init").main(process.argv.slice(3)));
}

// The project root holds driftor.config.json: this folder in the Driftor repo, or the
// parent of the .driftor/ folder `driftor init` copies the runtime into.
const ROOT = resolveRoot();
function resolveRoot() {
  if (process.env.DRIFTOR_ROOT) return path.resolve(process.env.DRIFTOR_ROOT);
  const has = (dir) => fs.existsSync(path.join(dir, "driftor.config.json"));
  return [__dirname, path.dirname(__dirname)].find(has) || process.cwd();
}
if (!fs.existsSync(path.join(ROOT, "driftor.config.json"))) {
  console.error(` ✗ No driftor.config.json in ${ROOT}. Run \`npx github:mrnetwork0001/Driftor init\` to create one.`);
  process.exit(1);
}
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "driftor.config.json"), "utf8"));
const TRACE_DIR = path.join(ROOT, CONFIG.traceDir || "kane-traces");
const STATE_FILE = path.join(ROOT, ".data", "driftor-hook.json");
const MAX_ATTEMPTS = CONFIG.maxHealAttempts || 3;

const line = (c = "=") => console.log(c.repeat(78));
const passthrough = () => process.argv.slice(2).filter((a) => a === "--headless" || a === "--dry-run");

function runGate({ capture = false, env = {} } = {}) {
  const res = spawnSync(process.execPath, [path.join(__dirname, "driftor_test.js"), ...passthrough()], {
    cwd: ROOT,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { passed: res.status === 0, output: capture ? `${res.stdout || ""}${res.stderr || ""}` : "" };
}

/** runGate({ capture: true }) without blocking, so the hook can design derived checks meanwhile. */
function runGateAsync({ env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, "driftor_test.js"), ...passthrough()], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    child.on("close", (code) => resolve({ passed: code === 0, output }));
  });
}

const RUNS_DIR = path.join(TRACE_DIR, "runs");
const listRuns = () => (fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).sort() : []);

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

/* ── Claude Code Stop hook ────────────────────────────────────────────────── */

const SOURCE_EXT = /\.(tsx?|jsx?|css|json|mdx?)$/;

/** Hash of every watched source file, so the hook only runs Kane when code changed. */
function fingerprint() {
  const hash = crypto.createHash("sha1");
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXT.test(entry.name)) hash.update(path.relative(ROOT, full)).update(fs.readFileSync(full));
    }
  };
  for (const dir of CONFIG.watch || ["app"]) walk(path.join(ROOT, dir));
  return hash.digest("hex");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { verified: null, attempts: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** The app's base URL if it is running (the explicit URL, or the first port serving the marker), else null. */
async function appIsUp() {
  const explicit = process.env.DRIFTOR_URL || CONFIG.url;
  const { ports = [3000, 3010], marker } = CONFIG.discover || {};
  const candidates = explicit ? [explicit] : Array.from({ length: ports[1] - ports[0] + 1 }, (_, i) => `http://localhost:${ports[0] + i}`);
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (explicit || !marker || (await res.text()).includes(marker)) return url.replace(/\/$/, "");
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

/* ── acceptance checks derived from the task (lib/acceptance.js) ──────────── */

const ACCEPT = acceptance.acceptanceConfig(CONFIG);

/**
 * Starts designing the derived checks (no browser: Kane's assurance commands),
 * so it can overlap the standing gate. Resolves to a manifest, or null when
 * there is nothing to derive (disabled, or no task found).
 */
function startDerive({ requests, appUrl, fresh = false, log }) {
  if (!ACCEPT.enabled || !requests.length || !appUrl) return Promise.resolve(null);
  const deadline = Date.now() + ACCEPT.budgetSeconds * 1000;
  const changes = ACCEPT.includeDiff ? acceptance.changeSummary(ROOT, CONFIG.watch || ["app"], ACCEPT) : null;
  return acceptance
    .deriveChecks({ root: ROOT, requests, changes, appUrl, appName: CONFIG.app, cfg: ACCEPT, deadline, log, fresh })
    .then((manifest) => ({ manifest, deadline }))
    .catch((err) => ({ manifest: { status: "error", error: err.message, tests: [], requests }, deadline }));
}

/** Runs the designed checks after the gate (Kane's window size is global) and archives them in the gate's run folder. */
async function finishDerived(derived, { appUrl, runDir, log }) {
  if (!derived) return null;
  const { manifest, deadline } = derived;
  const startedAt = new Date().toISOString();
  let run = { results: [], browserCredits: null };
  if (manifest.status === "designed") {
    try {
      run = await acceptance.runChecks({
        root: ROOT,
        manifest,
        appUrl,
        reset: CONFIG.reset,
        cfg: ACCEPT,
        headless: passthrough().includes("--headless"),
        // The design's budget, but never less than enough to run what was designed.
        deadline: Math.max(deadline, Date.now() + manifest.tests.length * 150 * 1000),
        log,
      });
    } catch (err) {
      manifest.warnings = [...(manifest.warnings || []), `running the checks failed: ${err.message}`];
    }
  }
  const block = acceptance.archive(runDir, { manifest, results: run.results, browserCredits: run.browserCredits, startedAt, cfg: ACCEPT });
  return { manifest, results: run.results, block, runDir };
}

/** One line on what the derived checks did, for systemMessage / the terminal. */
function describeDerived(d) {
  if (!d) return "";
  const { manifest, results } = d;
  if (manifest.status !== "designed") {
    return ` Driftor couldn't derive acceptance checks from the task (${manifest.error || manifest.status}).`;
  }
  const passed = results.filter((r) => r.verdict === "passed").length;
  const noVerdict = results.filter((r) => r.verdict === "no-verdict").length;
  return (
    ` Kane also designed ${results.length} acceptance test${results.length === 1 ? "" : "s"} from the task (unreviewed) and ${passed} passed` +
    (noVerdict ? `; ${noVerdict} reached no verdict` : "") +
    "."
  );
}

/**
 * Runs when Claude Code is about to end its turn. If the watched source changed
 * since the last green gate, run Kane. On failure, block the stop and hand Claude
 * the evidence (the same prompt `--heal` uses), so it keeps fixing in the same
 * session. After MAX_ATTEMPTS failures, let it stop and tell the human.
 */
async function cmdHook() {
  const input = readStdin();
  if (process.env.DRIFTOR_HOOK !== "1") return; // opt-in; see header comment
  const out = (obj) => process.stdout.write(JSON.stringify(obj));
  const session = input.session_id || "manual";

  const state = loadState();
  const hash = fingerprint();
  if (hash === state.verified) return; // nothing changed since Kane last passed

  const appUrl = await appIsUp();
  if (!appUrl) {
    out({ systemMessage: "Driftor: no running app found, so Kane didn't check this change. Start it with `npm run dev`." });
    return;
  }

  // Run only the objectives the change can affect: diff against the files Kane last passed on.
  // No stored baseline (first run, or state from an older Driftor) → no list → every objective runs.
  const { snapshot, diffSnapshots } = require("./lib/select");
  const files = snapshot(ROOT, CONFIG);
  const changed = state.files ? diffSnapshots(state.files, files) : null;
  const selectEnv = changed ? { DRIFTOR_CHANGED_FILES: JSON.stringify(changed) } : {};

  process.stderr.write("Driftor: source changed — running the Kane gate in real Chrome…\n");
  // The task the agent was given, from the session transcript (lib/acceptance.js).
  const requests = ACCEPT.enabled ? acceptance.requestsFromTranscript(input.transcript_path, ACCEPT) : [];
  const { passed: gatePassed, output, derived } = await gateWithTask({ requests, appUrl, trigger: "claude-stop-hook", env: selectEnv });
  fs.mkdirSync(TRACE_DIR, { recursive: true });
  fs.appendFileSync(path.join(TRACE_DIR, "hook.log"), `\n# ${new Date().toISOString()} session ${session}\n${output}`);
  const derivedFailed = derived ? derived.results.filter((r) => r.verdict === "failed") : [];
  const passed = gatePassed && !derivedFailed.length;

  if (passed) {
    state.verified = fingerprint();
    state.files = files; // taken before the gate ran, so it's exactly what Kane checked
    delete state.attempts[session];
    saveState(state);
    let ran = CONFIG.objectives.length;
    let skipped = [];
    try {
      const sel = JSON.parse(fs.readFileSync(path.join(TRACE_DIR, "selection.json"), "utf8"));
      ran = sel.selected.length;
      skipped = sel.skipped.map((s) => s.id);
    } catch {
      /* older runner: assume everything ran */
    }
    out({
      systemMessage: skipped.length
        ? `Driftor: Kane verified the ${ran} objective(s) this change affects in real Chrome. ✓ Skipped as unaffected: ${skipped.join(", ")}.${describeDerived(derived)}`
        : `Driftor: Kane verified all ${ran} objectives in real Chrome. ✓${describeDerived(derived)}`,
    });
    return;
  }

  const attempt = (state.attempts[session] || 0) + 1;
  if (attempt > MAX_ATTEMPTS) {
    delete state.attempts[session];
    saveState(state);
    out({
      systemMessage: `Driftor: Kane still fails after ${MAX_ATTEMPTS} fix attempts. Stopping the loop — a human needs to look. Evidence: kane-traces/`,
    });
    return;
  }
  state.attempts[session] = attempt;
  saveState(state);

  const parts = [];
  if (!gatePassed) {
    const findings = readFindings();
    parts.push(
      findings.length
        ? buildHealPrompt(findings, { app: CONFIG.app })
        : `Kane CLI's gate failed but reported no failing step. Output:\n${output.slice(-3000)}`
    );
  }
  if (derivedFailed.length) parts.push(acceptance.buildAcceptancePrompt(derived.results, { app: CONFIG.app, viewport: ACCEPT.viewport }));
  out({
    decision: "block",
    reason:
      `Driftor ran your change through Kane CLI in real Chrome and it failed (attempt ${attempt} of ${MAX_ATTEMPTS}).\n\n` +
      `${parts.join("\n\n")}\n\n` +
      "Fix it, then end your turn. Driftor re-runs Kane automatically when you stop.",
  });
}

/**
 * The standing gate plus the checks derived from the task. Kane designs the
 * derived tests while the gate runs (design needs no browser), then runs them
 * after it, and records them in the gate's run folder.
 */
async function gateWithTask({ requests, appUrl, trigger, env = {}, noGate = false, fresh = false, log }) {
  log = log || ((m) => process.stderr.write(`Driftor: ${m}\n`));
  const before = new Set(listRuns());
  const startedAt = new Date().toISOString();
  if (ACCEPT.enabled && requests.length) log(`deriving acceptance checks from the task (${requests.length} request${requests.length === 1 ? "" : "s"} from the session)…`);
  const derivePromise = startDerive({ requests, appUrl, fresh, log });
  const gate = noGate ? { passed: true, output: "" } : await runGateAsync({ env: { DRIFTOR_TRIGGER: trigger, ...env } });
  const pending = await derivePromise;
  if (!pending) return { ...gate, derived: null };

  let runDir = listRuns().filter((d) => !before.has(d)).pop();
  if (!runDir || noGate) {
    runDir = startedAt.replace(/[:.]/g, "-");
    fs.mkdirSync(path.join(RUNS_DIR, runDir), { recursive: true });
    fs.writeFileSync(
      path.join(RUNS_DIR, runDir, "run.json"),
      JSON.stringify({ startedAt, passed: gate.passed, trigger, regression: [], unit: null, objectives: {}, standingGate: noGate ? "skipped" : "no run folder" }, null, 2)
    );
  }
  const derived = await finishDerived(pending, { appUrl, runDir: path.join(RUNS_DIR, runDir), log });
  return { ...gate, derived, runDir: path.join("kane-traces", "runs", runDir) };
}

/* ── --accept: the hook's derived checks for a task you type ──────────────── */

async function cmdAccept(task) {
  line();
  console.log(" 🧾 DRIFTOR — ACCEPTANCE CHECKS DERIVED FROM THE TASK");
  line();
  if (!task) {
    console.error(' ✗ Give the task in quotes: node driftor.js --accept "Add a Revoke button to each API key"');
    process.exit(1);
  }
  if (!ACCEPT.enabled && process.env.DRIFTOR_ACCEPT !== "0") {
    Object.assign(ACCEPT, { enabled: true }); // --accept is itself the opt-in
  }
  if (!ACCEPT.enabled) {
    console.error(" ✗ Derived checks are switched off (DRIFTOR_ACCEPT=0).");
    process.exit(1);
  }
  const appUrl = await appIsUp();
  if (!appUrl) {
    console.error(" ✗ No running app found. Start it (`npm run dev`), or set DRIFTOR_URL.");
    process.exit(1);
  }
  const noGate = args.includes("--no-gate");
  console.log(` ✓ Target: ${appUrl}`);
  console.log(` ✓ Task: ${task}`);
  console.log(` ✓ Kane designs at most ${ACCEPT.max} test(s); they run at ${ACCEPT.viewport}${noGate ? "" : ", after the standing objectives"}.`);
  console.log(" ⚠ Review: the designed tests run unreviewed (labelled so in run.json); nothing is promoted to trusted.\n");
  const t0 = Date.now();
  const { passed: gatePassed, output, derived, runDir } = await gateWithTask({
    requests: [task],
    appUrl,
    trigger: "accept-cli",
    noGate,
    fresh: args.includes("--fresh"),
    log: (m) => console.log(` · ${m}`),
  });
  if (!noGate) console.log(`\n Standing objectives: ${gatePassed ? "✓ passed" : "✗ FAILED"} (full output: npm run driftor:gate)`);
  if (!noGate && !gatePassed) console.log(output.split("\n").filter((l) => /✗|→/.test(l)).map((l) => `   ${l.trim()}`).join("\n"));
  const results = derived?.results || [];
  if (derived?.manifest) {
    const m = derived.manifest;
    console.log(`\n Derived from the task (${m.reused ? "reused earlier design" : `${m.useCases?.length || 0} use-case(s)`}, store ${path.relative(ROOT, m.dir || "")}):`);
    if (m.status !== "designed") console.log(`   ✗ no checks: ${m.error || m.status}`);
    for (const r of results) {
      console.log(`   ${r.verdict === "passed" ? "✓" : r.verdict === "failed" ? "✗" : "?"} ${r.title} — ${r.verdict}`);
      if (r.failure?.message && r.verdict !== "passed") console.log(`     ${String(r.failure.message).split("\n").join("\n     ")}`);
    }
    for (const p of m.pauses || []) for (const q of p.questions) console.log(`   ↪ Kane asked "${q.text}" → ${q.answered ?? "unanswered"}`);
    const c = derived.block.credits;
    console.log(`   credits: assurance ${c.assurance ?? "?"}, browser runs ${c.browser ?? "?"}`);
  }
  const failedDerived = results.filter((r) => r.verdict === "failed");
  if (failedDerived.length) {
    console.log("\n 📄 What the agent would be told (Stop hook block reason, derived part):\n");
    console.log(acceptance.buildAcceptancePrompt(results, { app: CONFIG.app, viewport: ACCEPT.viewport }).split("\n").map((l) => `   │ ${l}`).join("\n"));
  }
  line();
  console.log(` Archived: ${runDir || "(nothing ran)"} · ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(gatePassed && !failedDerived.length ? 0 : 1);
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

if (args.includes("--hook")) cmdHook();
else if (args.includes("--accept")) cmdAccept(after("--accept"));
else if (args.includes("--inject")) cmdInject(after("--inject"));
else if (args.includes("--list")) cmdList();
else if (args.includes("--heal")) cmdHeal();
else if (args.includes("--reset")) cmdReset();
else if (args.includes("--watch")) cmdWatch();
else process.exit(runGate().passed ? 0 : 1);
