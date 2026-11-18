#!/usr/bin/env node
/**
 * Driftor runner — runs each objective through Kane CLI in real Chrome and
 * saves the NDJSON trace to kane-traces/<id>.ndjson.
 *
 *   node driftor_test.js                    # run every objective in driftor.config.json
 *   node driftor_test.js --headless         # headless Chrome (CI)
 *   node driftor_test.js --only <id>        # run one objective
 *   node driftor_test.js --url <url>        # gate an app at this URL
 *   node driftor_test.js --config <file>    # use another config file
 *
 * Before each objective it resets the app's state (config.reset, if set) and
 * sets Kane's browser window to the objective's viewport, restoring the
 * original window size afterwards. It also runs the unit suite (config.unit)
 * once, so every archived run records both verdicts side by side.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TRACE_DIR = path.join(ROOT, "kane-traces");
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const HEADLESS = argv.includes("--headless");
const ONLY = flag("--only");

/* ── config ───────────────────────────────────────────────────────────────── */

function loadConfig() {
  const file = path.resolve(flag("--config") || path.join(ROOT, "driftor.config.json"));
  if (!fs.existsSync(file)) {
    console.error(` ✗ No config at ${file}. Copy driftor.config.json from the Driftor repo and edit the objectives.`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(cfg.objectives) || !cfg.objectives.length) {
    console.error(` ✗ ${path.basename(file)} has no objectives.`);
    process.exit(1);
  }
  return cfg;
}

const CONFIG = loadConfig();
const line = (c = "=") => console.log(c.repeat(78));

function findKane() {
  const local = path.join(ROOT, "node_modules", ".bin", "kane-cli");
  if (fs.existsSync(local)) return local;
  const which = spawnSync("which", ["kane-cli"], { encoding: "utf8" });
  return which.status === 0 && which.stdout.trim() ? which.stdout.trim() : null;
}

const KANE = findKane();

/* ── Kane window size (a global Kane setting) ─────────────────────────────── */

function getWindow() {
  const res = spawnSync(KANE, ["config", "show", "--agent"], { encoding: "utf8" });
  try {
    return JSON.parse(res.stdout).window_size || null;
  } catch {
    return null;
  }
}

// kane-cli exits 0 even when it rejects a size, so check the setting actually changed.
function setWindow(size) {
  const res = spawnSync(KANE, ["config", "set-window", size], { encoding: "utf8" });
  if (getWindow() !== size) {
    throw new Error(`kane-cli config set-window ${size} did not take effect: ${(res.stdout || res.stderr || "").trim()}`);
  }
}


let originalWindow = null;
function restoreWindow() {
  if (originalWindow && getWindow() !== originalWindow) setWindow(originalWindow);
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    restoreWindow();
    process.exit(130);
  });
}

/* ── app discovery + reset ────────────────────────────────────────────────── */

async function discoverAppUrl() {
  const explicit = flag("--url") || process.env.DRIFTOR_URL || CONFIG.url;
  if (explicit) return explicit.replace(/\/$/, "");
  const { ports = [3000, 3010], marker } = CONFIG.discover || {};
  for (let port = ports[0]; port <= ports[1]; port++) {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (!marker || (await res.text()).includes(marker)) return url;
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

async function resetApp(appUrl) {
  if (!CONFIG.reset) return;
  const res = await fetch(`${appUrl}${CONFIG.reset}`, { method: "POST" });
  if (!res.ok) throw new Error(`reset failed: HTTP ${res.status}`);
}

/* ── unit suite (the verdict an agent usually trusts) ─────────────────────── */

function runUnit() {
  if (!CONFIG.unit) return null;
  const res = spawnSync(CONFIG.unit, { cwd: ROOT, shell: true, encoding: "utf8" });
  const out = `${res.stdout || ""}${res.stderr || ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  const summary = (out.match(/Tests\s+[^\n]+/) || [])[0]?.trim() || null;
  return { command: CONFIG.unit, passed: res.status === 0, summary };
}

/** Which bug-zoo regressions are live (only meaningful in the Driftor repo). */
function activeRegressions() {
  try {
    return require("./lib/regressions").active();
  } catch {
    return [];
  }
}

/* ── one objective ────────────────────────────────────────────────────────── */

/**
 * Resolves to { verdict: "passed" | "failed" | "no-verdict", code }.
 * Kane reports per-step progress as `running`/`done` and the outcome in a
 * final `run_end` event; a run that exits without `run_end` never judged the app.
 */
function runObjective(test, appUrl) {
  return new Promise((resolve) => {
    const objective = test.objective.replaceAll("{{url}}", appUrl);
    const args = ["run", objective, "--agent"];
    if (HEADLESS) args.push("--headless");

    const tracePath = path.join(TRACE_DIR, `${test.id}.ndjson`);
    const trace = fs.createWriteStream(tracePath, { flags: "w" });
    const latest = fs.createWriteStream(path.join(TRACE_DIR, "latest.ndjson"), { flags: "a" });
    const closeStreams = () => Promise.all([trace, latest].map((s) => new Promise((r) => s.end(r))));

    console.log(` $ kane-cli run "${objective.slice(0, 64)}…" --agent${HEADLESS ? " --headless" : ""}`);

    const child = spawn(KANE, args, { cwd: ROOT, env: { ...process.env, KANE_CLI_USER_AGENT: "driftor" } });
    let runEnd = null;
    let stepFailed = false;
    let buffer = "";

    const handleLine = (raw) => {
      if (!raw.trim()) return;
      let ev;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      const status = typeof ev.status === "string" ? ev.status.toLowerCase() : "";
      if (ev.type === "run_end") {
        runEnd = ev;
        const mark = status === "passed" ? "✓" : "✗";
        console.log(` ${mark} run_end ${status}${ev.one_liner ? ` — ${ev.one_liner}` : ""}`);
        if (status !== "passed" && (ev.summary || ev.reason)) {
          console.log(`   ${String(ev.summary || ev.reason).split("\n").join("\n   ")}`);
        }
      } else if (ev.step != null && status === "done") {
        console.log(` ✓ ${ev.remark || `step ${ev.step}`}`);
      } else if (ev.step != null && (status === "failed" || status === "error")) {
        stepFailed = true;
        console.log(` ✗ ${ev.remark || `step ${ev.step}`}`);
      } else if (ev.type === "error") {
        console.log(` ✗ ${ev.message || ev.error || "kane error"}`);
      }
    };

    child.stdout.on("data", (chunk) => {
      // Traces are committed as evidence; keep the local home directory out of them.
      const text = chunk.toString().split(require("os").homedir()).join("~");
      trace.write(text);
      latest.write(text);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(handleLine);
    });

    child.stderr.on("data", (chunk) => {
      const msg = chunk.toString().trim();
      if (msg && !msg.includes("ExperimentalWarning")) console.error(` [kane] ${msg}`);
    });

    const finish = (code) => {
      handleLine(buffer);
      buffer = "";
      let verdict;
      if (!runEnd) verdict = "no-verdict";
      else verdict = String(runEnd.status).toLowerCase() === "passed" && !stepFailed ? "passed" : "failed";
      closeStreams().then(() => resolve({ verdict, code }));
    };
    child.on("close", finish);
    child.on("error", (err) => {
      console.error(` ✗ Failed to start kane-cli: ${err.message}`);
      finish(null);
    });
  });
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  line();
  console.log(" DRIFTOR — KANE CLI GATE (real Chrome)");
  line();

  if (!KANE) {
    console.error(" ✗ kane-cli not found. Install it with `npm install` (or globally), then `npm run kane:login`.");
    process.exit(1);
  }

  const appUrl = await discoverAppUrl();
  if (!appUrl) {
    console.error(" ✗ No running app found. Start it (`npm run dev`), or pass --url / set DRIFTOR_URL.");
    process.exit(1);
  }
  console.log(` ✓ Target: ${appUrl}`);

  const tests = ONLY ? CONFIG.objectives.filter((t) => t.id === ONLY) : CONFIG.objectives;
  if (!tests.length) {
    console.error(` ✗ Unknown objective "${ONLY}". Available: ${CONFIG.objectives.map((t) => t.id).join(", ")}`);
    process.exit(1);
  }

  const regression = activeRegressions();
  if (regression.length) console.log(` ⚠ Injected regression live: ${regression.join(", ")}`);

  const unit = runUnit();
  if (unit) console.log(` ${unit.passed ? "✓" : "✗"} Unit suite (${unit.command}): ${unit.summary ?? (unit.passed ? "passed" : "failed")}`);

  fs.mkdirSync(TRACE_DIR, { recursive: true });
  fs.writeFileSync(path.join(TRACE_DIR, "latest.ndjson"), "");
  originalWindow = getWindow();

  let allPassed = true;
  const startedAt = new Date().toISOString();
  const verdicts = {};
  try {
    for (const test of tests) {
      line("-");
      console.log(` ${test.id} · ${test.viewport} · ${test.title}`);
      line("-");
      // Kane CLI accepts window widths from 800 to 3840 px.
      if (test.viewport) setWindow(test.viewport);
      let result;
      for (let attempt = 1; attempt <= 2; attempt++) {
        await resetApp(appUrl);
        result = await runObjective(test, appUrl);
        if (result.verdict !== "no-verdict") break;
        console.log(` ⚠ Kane exited (code ${result.code}) before reaching a verdict${attempt === 1 ? " — retrying once" : ""}.`);
      }
      const label = { passed: "passed", failed: "FAILED", "no-verdict": "NO VERDICT (Kane did not complete the run)" };
      console.log(` → ${label[result.verdict]}`);
      verdicts[test.id] = { verdict: result.verdict, viewport: test.viewport, title: test.title };
      if (result.verdict !== "passed") allPassed = false;
    }
  } finally {
    restoreWindow();
  }

  // Archive this run so earlier evidence survives the next run (e.g. the re-verify after a heal).
  const runDir = path.join(TRACE_DIR, "runs", startedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(runDir, { recursive: true });
  for (const id of Object.keys(verdicts)) {
    fs.copyFileSync(path.join(TRACE_DIR, `${id}.ndjson`), path.join(runDir, `${id}.ndjson`));
  }
  fs.writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        passed: allPassed,
        trigger: process.env.DRIFTOR_TRIGGER || "cli",
        regression,
        unit,
        objectives: verdicts,
      },
      null,
      2
    )
  );

  line();
  if (allPassed) {
    console.log(" ✓ GATE PASSED — every objective completed in real Chrome.");
  } else {
    console.log(" ✗ GATE FAILED — evidence saved to kane-traces/. Run `npm run driftor:heal` to send it to an agent.");
  }
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  restoreWindow();
  console.error(" ✗ Fatal:", err.message);
  process.exit(1);
});
