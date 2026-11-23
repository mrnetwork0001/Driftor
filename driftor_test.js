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
 *   node driftor_test.js --changed          # only objectives affected by git changes (vs HEAD + untracked)
 *   node driftor_test.js --files a,b        # only objectives affected by these files
 *   node driftor_test.js --parallel         # run objectives at once, each in its own Chrome (see below)
 *   node driftor_test.js --dry-run          # check config, kane-cli and the app, print the plan; run nothing
 *   node driftor_test.js --parallel --probe # check parallel isolation without Kane (Chrome only, no credits)
 *
 * Before each objective it resets the app's state (config.reset, if set) and
 * sets Kane's browser window to the objective's viewport, restoring the
 * original window size afterwards. It also runs the unit suite (config.unit)
 * once, so every archived run records both verdicts side by side.
 *
 * Selection (lib/select.js): with --changed, --files or DRIFTOR_CHANGED_FILES
 * (set by the Stop hook), only the objectives whose `covers` globs match a
 * changed file run. Shared and unknown files run everything; the archived
 * run.json records what ran, what was skipped and why.
 *
 * Parallel (--parallel, DRIFTOR_PARALLEL=1 or config.parallel.enabled):
 * Kane 0.10.5 has no per-test window size (`window_size` is one global config
 * value; `testrun --parallel` gives every worker that same size), so the
 * runner launches one Chrome per objective at the objective's viewport and
 * points `kane-cli run --cdp-endpoint` at it. Each objective also gets its own
 * app state via `?run=<id>`. While Kane runs, the runner reads the page's real
 * viewport and URL over CDP; if it can't confirm the viewport and the run id,
 * that objective's verdict is not trusted and it re-runs sequentially.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { selectObjectives, gitChangedFiles } = require("./lib/select");

// The project root holds driftor.config.json: this folder in the Driftor repo, or the
// parent of the .driftor/ folder `driftor init` copies the runtime into.
const ROOT = process.env.DRIFTOR_ROOT
  ? path.resolve(process.env.DRIFTOR_ROOT)
  : [__dirname, path.dirname(__dirname)].find((d) => fs.existsSync(path.join(d, "driftor.config.json"))) || process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const HEADLESS = argv.includes("--headless");
const DRY_RUN = argv.includes("--dry-run");
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
const TRACE_DIR = path.join(ROOT, CONFIG.traceDir || "kane-traces");
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

const chromes = new Set(); // Chromes launched for --parallel, killed on exit
function killChromes() {
  for (const c of chromes) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  chromes.clear();
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    killChromes();
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

const isolateParam = () => (CONFIG.parallel && CONFIG.parallel.isolateParam) || "run";

async function resetApp(appUrl, run = null) {
  if (!CONFIG.reset) return;
  const query = run ? `?${isolateParam()}=${encodeURIComponent(run)}` : "";
  const res = await fetch(`${appUrl}${CONFIG.reset}${query}`, { method: "POST" });
  if (!res.ok) throw new Error(`reset failed: HTTP ${res.status}`);
}

/**
 * The objective's text with {{url}} filled in. With a run id, every
 * `{{url}}/path` also carries `?run=<id>`, so the page Kane opens uses that
 * run's own state.
 */
function objectiveText(test, appUrl, run = null) {
  if (!run) return test.objective.replaceAll("{{url}}", appUrl);
  return test.objective.replace(
    /\{\{url\}\}(\/[A-Za-z0-9_\-/]*)?/g,
    (_m, p) => `${appUrl}${p || "/"}?${isolateParam()}=${encodeURIComponent(run)}`
  );
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

/* ── selection ────────────────────────────────────────────────────────────── */

function computeSelection() {
  const all = CONFIG.objectives.map((t) => t.id);
  if (ONLY) {
    if (!all.includes(ONLY)) {
      console.error(` ✗ Unknown objective "${ONLY}". Available: ${all.join(", ")}`);
      process.exit(1);
    }
    return {
      mode: "only",
      changed: null,
      selected: [ONLY],
      skipped: all.filter((id) => id !== ONLY).map((id) => ({ id, reason: `--only ${ONLY}` })),
      files: [],
    };
  }
  let mode = "all";
  let changed = null;
  if (flag("--files") != null) {
    mode = "files";
    changed = flag("--files").split(",").map((s) => s.trim()).filter(Boolean);
  } else if (argv.includes("--changed")) {
    mode = "git";
    changed = gitChangedFiles(ROOT); // null if git is unavailable → everything runs
  } else if (process.env.DRIFTOR_CHANGED_FILES) {
    mode = "hook";
    try {
      const parsed = JSON.parse(process.env.DRIFTOR_CHANGED_FILES);
      changed = Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      changed = null;
    }
  }
  if (mode === "all") return { mode, changed: null, selected: all, skipped: [], files: [] };
  const res = selectObjectives(changed, CONFIG);
  return { mode, changed, selected: res.selected, skipped: res.skipped, files: res.files };
}

/* ── parallel: one Chrome per objective, at its viewport ──────────────────── */

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** Why parallel can't run here, or null if it can. */
function parallelBlocker(tests) {
  if (tests.length < 2) return "only one objective selected";
  if (typeof globalThis.WebSocket !== "function") return `Node ${process.version} has no WebSocket, so the viewport can't be verified over CDP (needs Node 22+)`;
  if (!findChrome()) return "Chrome not found (set CHROME_PATH)";
  const noUrl = tests.filter((t) => !/\{\{url\}\}/.test(t.objective)).map((t) => t.id);
  if (noUrl.length) return `objective(s) without {{url}} can't be given a run id: ${noUrl.join(", ")}`;
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function launchChrome(viewport, startUrl = "about:blank") {
  const [width, height] = viewport.split("x").map(Number);
  const port = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-chrome-"));
  // The same window flags Kane uses when it launches Chrome itself.
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-popup-blocking",
    "--disable-notifications",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
    ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ...(HEADLESS ? ["--headless=new"] : []),
    startUrl,
  ];
  const proc = spawn(findChrome(), args, { stdio: "ignore" });
  chromes.add(proc);
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const close = async () => {
    chromes.delete(proc);
    proc.kill("SIGTERM");
    await new Promise((r) => (proc.exitCode != null ? r() : proc.once("exit", r)));
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  };
  return { endpoint, port, width, height, close };
}

/** Evaluates `expression` in one CDP page target. Resolves null on any failure. */
function cdpEval(wsUrl, expression) {
  return new Promise((resolve) => {
    let ws;
    const done = (v) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* closing anyway */
      }
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 2000);
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return done(null);
    }
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.id === 1) done(data.result?.result?.value ?? null);
      } catch {
        done(null);
      }
    };
    ws.onerror = () => done(null);
  });
}

/**
 * Samples the real viewport and URL of every app page in this Chrome while
 * Kane drives it. stop() returns the samples.
 */
function watchViewport(chrome, appUrl) {
  const samples = [];
  let stopped = false;
  const tick = async () => {
    try {
      const targets = await (await fetch(`${chrome.endpoint}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
      for (const t of targets) {
        if (t.type !== "page" || !String(t.url).startsWith(appUrl) || !t.webSocketDebuggerUrl) continue;
        const v = await cdpEval(t.webSocketDebuggerUrl, "JSON.stringify({ w: innerWidth, h: innerHeight, url: location.href })");
        const sample = v && JSON.parse(v);
        // The target list can name the app while the document is still about:blank mid-navigation.
        if (sample && String(sample.url).startsWith(appUrl)) samples.push(sample);
      }
    } catch {
      /* Chrome busy or gone; try again */
    }
  };
  const loop = (async () => {
    while (!stopped) {
      await tick();
      await new Promise((r) => setTimeout(r, 1500));
    }
  })();
  return {
    async stop() {
      stopped = true;
      await loop;
      return samples;
    },
  };
}

/** Did Kane really run this objective at its viewport, on its own state? */
function judgeIsolation(samples, width, run) {
  const tolerance = 32; // scrollbars and rounding, far below any breakpoint gap
  if (!samples.length) return { ok: false, reason: "no app page was observed over CDP", samples: 0 };
  const widths = [...new Set(samples.map((s) => s.w))];
  const wrongWidth = widths.filter((w) => Math.abs(w - width) > tolerance);
  const runParam = `${isolateParam()}=${run}`;
  const shared = samples.filter((s) => !String(s.url).includes(runParam)).map((s) => s.url);
  if (wrongWidth.length) return { ok: false, reason: `viewport width ${wrongWidth.join("/")} px, expected ${width}`, widths, samples: samples.length };
  if (shared.length) return { ok: false, reason: `page without ${runParam} (shared state): ${shared[0]}`, widths, samples: samples.length };
  return { ok: true, widths, samples: samples.length };
}

/* ── one objective ────────────────────────────────────────────────────────── */

/**
 * Resolves to { verdict: "passed" | "failed" | "no-verdict", code }.
 * Kane reports per-step progress as `running`/`done` and the outcome in a
 * final `run_end` event; a run that exits without `run_end` never judged the app.
 */
function runObjective(test, appUrl, { run = null, cdpEndpoint = null, log = console.log } = {}) {
  return new Promise((resolve) => {
    const objective = objectiveText(test, appUrl, run);
    const args = ["run", objective, "--agent"];
    if (cdpEndpoint) args.push("--cdp-endpoint", cdpEndpoint);
    else if (HEADLESS) args.push("--headless");

    const tracePath = path.join(TRACE_DIR, `${test.id}.ndjson`);
    const trace = fs.createWriteStream(tracePath, { flags: "w" });
    const latest = fs.createWriteStream(path.join(TRACE_DIR, "latest.ndjson"), { flags: "a" });
    const closeStreams = () => Promise.all([trace, latest].map((s) => new Promise((r) => s.end(r))));

    log(` $ kane-cli run "${objective.slice(0, 64)}…" ${args.slice(2).join(" ")}`);

    const child = spawn(KANE, args, { cwd: ROOT, env: { ...process.env, KANE_CLI_USER_AGENT: "driftor" } });
    let runEnd = null;
    let stepFailed = false;
    let buffer = "";

    const handleLine = (raw) => {
      if (!raw.trim()) return;
      // Whole lines only, so parallel runs can share latest.ndjson without interleaving mid-line.
      latest.write(`${raw}\n`);
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
        log(` ${mark} run_end ${status}${ev.one_liner ? ` — ${ev.one_liner}` : ""}`);
        if (status !== "passed" && (ev.summary || ev.reason)) {
          log(`   ${String(ev.summary || ev.reason).split("\n").join("\n   ")}`);
        }
      } else if (ev.step != null && status === "done") {
        log(` ✓ ${ev.remark || `step ${ev.step}`}`);
      } else if (ev.step != null && (status === "failed" || status === "error")) {
        stepFailed = true;
        log(` ✗ ${ev.remark || `step ${ev.step}`}`);
      } else if (ev.type === "error") {
        log(` ✗ ${ev.message || ev.error || "kane error"}`);
      }
    };

    child.stdout.on("data", (chunk) => {
      // Traces are committed as evidence; keep the local home directory out of them.
      const text = chunk.toString().split(os.homedir()).join("~");
      trace.write(text);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(handleLine);
    });

    child.stderr.on("data", (chunk) => {
      const msg = chunk.toString().trim();
      if (msg && !msg.includes("ExperimentalWarning")) console.error(` [kane${run ? ` ${test.id}` : ""}] ${msg}`);
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

const LABEL = { passed: "passed", failed: "FAILED", "no-verdict": "NO VERDICT (Kane did not complete the run)" };

/** The classic path: one objective at a time, global Kane window size, shared app state. */
async function runSequential(test, appUrl) {
  line("-");
  console.log(` ${test.id} · ${test.viewport} · ${test.title}`);
  line("-");
  if (originalWindow == null) originalWindow = getWindow();
  // Kane CLI accepts window widths from 800 to 3840 px.
  if (test.viewport) setWindow(test.viewport);
  const started = Date.now();
  let result;
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    await resetApp(appUrl);
    result = await runObjective(test, appUrl);
    if (result.verdict !== "no-verdict") break;
    console.log(` ⚠ Kane exited (code ${result.code}) before reaching a verdict${attempt === 1 ? " — retrying once" : ""}.`);
  }
  console.log(` → ${LABEL[result.verdict]}`);
  return { verdict: result.verdict, attempts, durationMs: Date.now() - started, mode: "sequential" };
}

/** One objective in its own Chrome at its viewport, on its own app state. */
async function runIsolated(test, appUrl, run) {
  const log = (msg) => console.log(` [${test.id}]${msg}`);
  const started = Date.now();
  let chrome;
  try {
    chrome = await launchChrome(test.viewport || "1920x1080");
    log(` Chrome ${chrome.width}x${chrome.height} on ${chrome.endpoint} · state ?${isolateParam()}=${run}`);
    let result;
    let isolation;
    let attempts = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      attempts = attempt;
      await resetApp(appUrl, run);
      const watcher = watchViewport(chrome, appUrl);
      result = await runObjective(test, appUrl, { run, cdpEndpoint: chrome.endpoint, log });
      isolation = judgeIsolation(await watcher.stop(), chrome.width, run);
      if (result.verdict !== "no-verdict") break;
      log(` ⚠ Kane exited (code ${result.code}) before reaching a verdict${attempt === 1 ? " — retrying once" : ""}.`);
    }
    log(` → ${LABEL[result.verdict]} · isolation ${isolation.ok ? `confirmed (${isolation.widths.join("/")} px, ${isolation.samples} samples)` : `NOT confirmed: ${isolation.reason}`}`);
    return { verdict: result.verdict, attempts, durationMs: Date.now() - started, mode: "parallel", run, isolation };
  } catch (err) {
    log(` ✗ ${err.message}`);
    return { verdict: "no-verdict", attempts: 0, durationMs: Date.now() - started, mode: "parallel", run, isolation: { ok: false, reason: err.message } };
  } finally {
    if (chrome) await chrome.close().catch(() => {});
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

function printSelection(sel) {
  if (sel.mode === "all") return;
  const how = { only: "--only", files: "--files", git: "git diff HEAD + untracked", hook: "changes since the last green gate" }[sel.mode];
  console.log(` ◆ Selection (${how}): running ${sel.selected.length} of ${CONFIG.objectives.length}`);
  if (sel.changed == null && sel.mode !== "only") console.log("   changed files unknown — running everything");
  for (const f of sel.files) console.log(`   ${f.effect.padEnd(7)} ${f.file}${f.objectives.length ? ` → ${f.objectives.join(", ")}` : ""}`);
  for (const s of sel.skipped) console.log(`   skip ${s.id}: ${s.reason}`);
}

function archive({ startedAt, wallMs, allPassed, regression, unit, verdicts, selection, execution }) {
  const runDir = path.join(TRACE_DIR, "runs", startedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(runDir, { recursive: true });
  for (const id of Object.keys(verdicts)) {
    fs.copyFileSync(path.join(TRACE_DIR, `${id}.ndjson`), path.join(runDir, `${id}.ndjson`));
  }
  const record = {
    startedAt,
    finishedAt: new Date().toISOString(),
    wallMs,
    passed: allPassed,
    trigger: process.env.DRIFTOR_TRIGGER || "cli",
    regression,
    unit,
    objectives: verdicts,
    selection: {
      mode: selection.mode,
      changed: selection.changed,
      selected: selection.selected,
      skipped: selection.skipped,
      files: selection.files,
    },
    execution,
  };
  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(record, null, 2));
  // Read by the Stop hook to tell the agent what ran and what was skipped.
  fs.writeFileSync(path.join(TRACE_DIR, "selection.json"), JSON.stringify({ startedAt, ...record.selection, execution }, null, 2));
}

/**
 * --probe: checks the parallel machinery without Kane (no credits). Launches
 * one Chrome per selected objective at its viewport on `/app?run=<id>`, reads
 * the viewport and URL back over CDP, and reports what parallel mode would see.
 */
async function probe(tests, appUrl, runIds) {
  const results = await Promise.all(
    tests.map(async (t) => {
      const run = runIds[t.id];
      const chrome = await launchChrome(t.viewport || "1920x1080", `${appUrl}/app?${isolateParam()}=${run}`);
      try {
        const watcher = watchViewport(chrome, appUrl);
        await new Promise((r) => setTimeout(r, 5000));
        return [t, judgeIsolation(await watcher.stop(), chrome.width, run)];
      } finally {
        await chrome.close().catch(() => {});
      }
    })
  );
  for (const [t, iso] of results) {
    console.log(` ${iso.ok ? "✓" : "✗"} ${t.id} · ${t.viewport}: ${iso.ok ? `viewport ${iso.widths.join("/")} px, run state confirmed (${iso.samples} samples)` : iso.reason}`);
  }
  return results.every(([, iso]) => iso.ok);
}

async function main() {
  line();
  console.log(` DRIFTOR — KANE CLI GATE (real Chrome)${DRY_RUN ? " · DRY RUN" : ""}`);
  line();

  if (!KANE && !DRY_RUN) {
    console.error(" ✗ kane-cli not found. Install it with `npm install` (or globally), then `npm run kane:login`.");
    process.exit(1);
  }

  const selection = computeSelection();
  printSelection(selection);
  const tests = CONFIG.objectives.filter((t) => selection.selected.includes(t.id));

  const wantParallel =
    !argv.includes("--sequential") &&
    (argv.includes("--parallel") || process.env.DRIFTOR_PARALLEL === "1" || !!(CONFIG.parallel && CONFIG.parallel.enabled));
  const blocker = wantParallel ? parallelBlocker(tests) : null;
  const parallel = wantParallel && !blocker;
  if (wantParallel && blocker) console.log(` ⚠ Parallel mode unavailable: ${blocker}. Running sequentially.`);
  const stamp = `gate${Date.now().toString(36)}`;
  const runIds = Object.fromEntries(tests.map((t, i) => [t.id, `${stamp}-${i + 1}`]));

  const appUrl = await discoverAppUrl();

  // Objectives `driftor init` wrote are placeholders until someone edits them.
  const placeholders = tests.filter((t) => t.placeholder);

  if (DRY_RUN) {
    const url = appUrl || "{{url}}";
    console.log(` ${appUrl ? "✓" : "·"} Target: ${appUrl || "(no running app found; showing {{url}})"}`);
    console.log(` ${KANE ? "✓" : "✗"} kane-cli: ${KANE ? (KANE.startsWith(ROOT) ? path.relative(ROOT, KANE) : KANE) : "not found"}`);
    console.log(` ◆ Execution: ${parallel ? `parallel — ${tests.length} Chromes via --cdp-endpoint (${findChrome()})` : "sequential — kane-cli config set-window per objective"}`);
    for (const t of tests) {
      console.log(`   ${t.placeholder ? "!" : "•"} ${t.id} · ${t.viewport || "default window"}${t.title ? ` · ${t.title}` : ""}`);
      console.log(`     ${objectiveText(t, url, parallel ? runIds[t.id] : null).slice(0, 160)}…`);
    }
    if (!tests.length) console.log("   (nothing to run)");
    console.log(`\n Reset: ${CONFIG.reset ? `${url}${CONFIG.reset}` : "none"} · Unit: ${CONFIG.unit || "none"} · Traces: ${path.relative(ROOT, TRACE_DIR)}/`);
    if (placeholders.length) console.log(` ! ${placeholders.length} placeholder objective(s): edit them and remove "placeholder": true before a real run.`);
    console.log(` ${appUrl ? "✓" : "!"} Dry run: ${appUrl ? "config, kane-cli and the app are in place" : "config checked, but no running app was found"}. Kane was not started.`);
    process.exit(appUrl || !tests.length ? 0 : 1);
  }

  if (placeholders.length) {
    console.error(` ✗ Placeholder objectives: ${placeholders.map((t) => t.id).join(", ")}. Edit them in driftor.config.json and remove "placeholder": true.`);
    process.exit(1);
  }

  if (argv.includes("--probe")) {
    if (!appUrl) {
      console.error(" ✗ No running app found. Start it (`npm run dev`), or pass --url / set DRIFTOR_URL.");
      process.exit(1);
    }
    if (blocker) process.exit(1);
    console.log(` ◆ Probe (no Kane): one Chrome per objective on ${appUrl}`);
    const ok = await probe(tests, appUrl, runIds);
    killChromes();
    process.exit(ok ? 0 : 1);
  }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const regression = activeRegressions();
  if (regression.length) console.log(` ⚠ Injected regression live: ${regression.join(", ")}`);

  const unit = runUnit();
  if (unit) console.log(` ${unit.passed ? "✓" : "✗"} Unit suite (${unit.command}): ${unit.summary ?? (unit.passed ? "passed" : "failed")}`);

  fs.mkdirSync(TRACE_DIR, { recursive: true });

  if (!tests.length) {
    archive({ startedAt, wallMs: Date.now() - t0, allPassed: true, regression, unit, verdicts: {}, selection, execution: { mode: "none" } });
    line();
    console.log(" ✓ GATE PASSED — no objective is affected by this change; Kane was not run.");
    process.exit(0);
  }

  if (!appUrl) {
    console.error(" ✗ No running app found. Start it (`npm run dev`), or pass --url / set DRIFTOR_URL.");
    process.exit(1);
  }
  console.log(` ✓ Target: ${appUrl}`);
  fs.writeFileSync(path.join(TRACE_DIR, "latest.ndjson"), "");

  const verdicts = {};
  const record = (test, r) => {
    verdicts[test.id] = { verdict: r.verdict, viewport: test.viewport, title: test.title, durationMs: r.durationMs, attempts: r.attempts, mode: r.mode };
    if (r.run) verdicts[test.id].run = r.run;
    if (r.isolation) verdicts[test.id].isolation = r.isolation;
    if (r.fallbackFrom) verdicts[test.id].fallbackFrom = r.fallbackFrom;
  };
  const execution = { mode: parallel ? "parallel" : "sequential", ...(blocker ? { parallelBlocked: blocker } : {}) };
  const kaneStart = Date.now();

  try {
    if (parallel) {
      line("-");
      console.log(` Running ${tests.length} objectives at once, each in its own Chrome:`);
      for (const t of tests) console.log(`   ${t.id} · ${t.viewport} · ${t.title}`);
      line("-");
      const pStart = Date.now();
      const results = await Promise.all(tests.map((t) => runIsolated(t, appUrl, runIds[t.id])));
      execution.parallelWallMs = Date.now() - pStart;
      // A verdict is only trusted if the viewport and the run's own state were confirmed.
      const redo = [];
      tests.forEach((t, i) => {
        const r = results[i];
        if (r.verdict !== "no-verdict" && r.isolation && r.isolation.ok) record(t, r);
        else redo.push([t, r]);
      });
      if (redo.length) {
        console.log(` ⚠ Re-running ${redo.map(([t]) => t.id).join(", ")} sequentially: parallel isolation not confirmed.`);
        execution.fallback = redo.map(([t, r]) => ({ id: t.id, verdict: r.verdict, reason: r.isolation ? r.isolation.reason : "no verdict" }));
        for (const [t, r] of redo) {
          const seq = await runSequential(t, appUrl);
          record(t, { ...seq, fallbackFrom: { verdict: r.verdict, isolation: r.isolation, durationMs: r.durationMs } });
        }
      }
    } else {
      for (const test of tests) record(test, await runSequential(test, appUrl));
    }
  } finally {
    killChromes();
    restoreWindow();
  }

  const allPassed = Object.values(verdicts).every((v) => v.verdict === "passed");
  const wallMs = Date.now() - t0;
  // Kane time only (excludes the unit suite): the number to compare sequential vs parallel by.
  execution.kaneWallMs = Date.now() - kaneStart;
  // Archive this run so earlier evidence survives the next run (e.g. the re-verify after a heal).
  archive({ startedAt, wallMs, allPassed, regression, unit, verdicts, selection, execution });

  line();
  const ran = Object.keys(verdicts).length;
  const skippedNote = selection.skipped.length ? ` (${selection.skipped.length} unaffected, skipped)` : "";
  console.log(` ⏱ ${ran} objective(s), ${execution.mode}: Kane ${(execution.kaneWallMs / 1000).toFixed(1)} s, total ${(wallMs / 1000).toFixed(1)} s`);
  if (allPassed) {
    console.log(` ✓ GATE PASSED — ${ran === CONFIG.objectives.length ? "every" : `${ran} selected`} objective completed in real Chrome${skippedNote}.`);
  } else {
    console.log(" ✗ GATE FAILED — evidence saved to kane-traces/. Run `npm run driftor:heal` to send it to an agent.");
  }
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  killChromes();
  restoreWindow();
  console.error(" ✗ Fatal:", err.message);
  process.exit(1);
});
