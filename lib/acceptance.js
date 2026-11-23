/**
 * Acceptance checks derived from the task.
 * ---------------------------------------------------------------------------
 * The agent says it's done. Kane writes the test for what it claims, and checks
 * it in a real browser.
 *
 *   1. Recover the task: the user's own prompts from the Claude Code transcript
 *      (the Stop hook's `transcript_path`), plus a capped `git diff` of the
 *      watched source as context.
 *   2. Write them to a requirements file and hand it to Kane's assurance
 *      commands: `kane-cli context ingest <file> --mode agent --local` (extract
 *      use-cases), then `kane-cli design tests --use-case <uc> --mode agent
 *      --max <n> --allow-unreviewed` (acceptance criteria, scenarios, runnable
 *      `_test.md`). Nothing here writes a test by hand.
 *   3. Run each designed test with `kane-cli testrun run <file> --agent < /dev/null`
 *      at the configured viewport, after resetting the app, and turn the result
 *      into verdicts + findings the hook merges with the standing objectives.
 *
 * Review checkpoint (honest version). Kane's assurance flow says promoting a
 * use-case or a design from `derived` to `trusted` is a human's decision. A Stop
 * hook has no human in the loop, so Driftor never promotes anything: it designs
 * with `--allow-unreviewed`, leaves every node `derived` in the store, and labels
 * the checks everywhere as "derived from the task, unreviewed". Opting in with
 * `acceptance.enabled` in driftor.config.json is the explicit instruction to run
 * unreviewed checks. A human can review them later with `kane-cli context review`
 * inside the store directory.
 *
 * Pauses (exit 3). Extract and design pause on every question in agent mode.
 * Headless, Driftor answers each question with Kane's own recommended option
 * (`--answer <id>=<n>`), up to `maxPauses` rounds, and records every question and
 * the answer it picked in the run archive. With no recommended option it stops
 * and reports, rather than guessing.
 *
 * The store lives in `.driftor/acceptance/<key>/` (gitignored, outside every
 * watched directory, so it never changes the hook's source fingerprint). The key
 * hashes the task, the app URL and the size cap, so a retry after a block replays
 * the same designed tests instead of paying to design them again.
 */

const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseNdjson, extractFindings } = require("./heal");

const DEFAULTS = {
  enabled: true,
  max: 2, // cap on designed tests (Kane's --max, and the number Driftor runs)
  viewport: "1920x1080",
  startPath: "/",
  includeDiff: true,
  diffChars: 4000,
  maxRequests: 3,
  requestChars: 2000,
  maxPauses: 3,
  budgetSeconds: 480, // derive + run; the Stop hook itself is allowed 900 s
};

function acceptanceConfig(config) {
  const raw = config.acceptance;
  if (raw === false) return { ...DEFAULTS, enabled: false };
  const cfg = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (raw == null) cfg.enabled = false; // opt-in: absent means off
  if (process.env.DRIFTOR_ACCEPT === "0") cfg.enabled = false;
  cfg.max = Math.max(1, Math.min(Number(cfg.max) || DEFAULTS.max, 5));
  return cfg;
}

/* ── the task: transcript + diff ──────────────────────────────────────────── */

const NOT_A_REQUEST = [
  /^Stop hook feedback:/,
  /^<(command-|local-command|system-reminder|bash-|user-memory)/,
  /^Caveat: The messages below/,
  /^\[Request interrupted/,
  /^Base directory for this skill:/,
];

/** The user's own prompts in a Claude Code transcript (JSONL), oldest first. */
function requestsFromTranscript(file, { maxRequests = DEFAULTS.maxRequests, requestChars = DEFAULTS.requestChars } = {}) {
  if (!file || !fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type !== "user" || e.isMeta || e.isSidechain || !e.message) continue;
    const content = e.message.content;
    const texts =
      typeof content === "string"
        ? [content]
        : Array.isArray(content)
          ? content.filter((c) => c && c.type === "text" && typeof c.text === "string").map((c) => c.text)
          : [];
    // A message that carries tool results is the harness talking, not the user.
    if (Array.isArray(content) && content.some((c) => c && c.type === "tool_result")) continue;
    for (const t of texts) {
      const text = t.trim();
      if (!text || NOT_A_REQUEST.some((re) => re.test(text))) continue;
      out.push(text.length > requestChars ? `${text.slice(0, requestChars)} […]` : text);
    }
  }
  return out.slice(-maxRequests);
}

/** Obvious secrets out of anything Driftor sends to Kane or archives. */
function redact(text) {
  return String(text)
    .split(os.homedir())
    .join("~")
    .replace(/((?:api[_-]?key|access[_-]?key|token|secret|password|passwd)\s*[:=]\s*)["']?[^\s"']{6,}/gi, "$1[redacted]")
    .replace(/\b(sk|pk|rk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{16,}\b/g, "[redacted]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]");
}

const SOURCE_EXT = /\.(tsx?|jsx?|css|mdx?)$/;

/** A short, capped summary of what changed in the watched source (tracked diff + new files). */
function changeSummary(root, watch, { diffChars = DEFAULTS.diffChars } = {}) {
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) return null;
  const dirs = watch.filter((d) => fs.existsSync(path.join(root, d)));
  if (!dirs.length) return null;
  const stat = (git(["diff", "HEAD", "--stat", "--", ...dirs]).stdout || "").trim();
  let diff = git(["diff", "HEAD", "--unified=2", "--", ...dirs]).stdout || "";
  const untracked = (git(["ls-files", "--others", "--exclude-standard", "--", ...dirs]).stdout || "")
    .split("\n")
    .filter((f) => f && SOURCE_EXT.test(f));
  for (const f of untracked) {
    const full = path.join(root, f);
    if (fs.statSync(full).size > 64 * 1024) continue;
    diff += `\nnew file ${f}\n${fs.readFileSync(full, "utf8")}`;
  }
  // Source only: drop hunks for non-source files (lockfiles, json data).
  diff = diff
    .split(/^(?=diff --git )/m)
    .filter((chunk) => !chunk.startsWith("diff --git") || SOURCE_EXT.test((chunk.match(/^diff --git a\/(\S+)/) || [])[1] || ""))
    .join("");
  if (!stat && !untracked.length) return null;
  const files = [stat, untracked.length ? `new: ${untracked.join(", ")}` : ""].filter(Boolean).join("\n");
  const capped = diff.length > diffChars ? `${diff.slice(0, diffChars)}\n[… diff truncated at ${diffChars} characters]` : diff;
  return { files, diff: redact(capped) };
}

function requirementsDoc({ requests, changes, appName, appUrl, startPath }) {
  const lines = [
    "# What the coding agent was asked to build",
    "",
    "A coding agent was given the request(s) below and says it has finished. The requests are",
    "the user's own words, quoted as given; they are the requirement. Test that the running app",
    "does what they ask, from a user's point of view.",
    "",
    `The app under test is ${appName || "a web app"}. It is running at ${appUrl}${startPath === "/" ? "" : startPath}.`,
    "",
  ];
  requests.forEach((r, i) => {
    lines.push(`## Request ${i + 1}${i === requests.length - 1 && requests.length > 1 ? " (most recent)" : ""}`, "", redact(r), "");
  });
  if (changes) {
    lines.push(
      "## Context only: what the agent changed (not a requirement)",
      "",
      "Use this to see which part of the app the request touches. Do not test implementation",
      "details from it; test what the request asks for.",
      "",
      "```",
      changes.files,
      "```",
      ""
    );
    if (changes.diff.trim()) lines.push("```diff", changes.diff.trim(), "```", "");
  }
  return lines.join("\n");
}

/* ── kane-cli plumbing ────────────────────────────────────────────────────── */

/**
 * Prefer the kane-cli on PATH: on 0.10.5 the assurance agent from a project-local
 * install can fail to resolve ("assurance agent not found") while the global
 * install works. Fall back to the local one.
 */
function findKane(root) {
  const which = spawnSync("which", ["kane-cli"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  const local = path.join(root, "node_modules", ".bin", "kane-cli");
  return fs.existsSync(local) ? local : null;
}

const KANE_ENV = { ...process.env, KANE_CLI_USER_AGENT: "driftor" };

/** Runs kane-cli with stdin closed (NDJSON mode); resolves with its events. */
function runKane(kane, args, { cwd, timeoutMs, logFile }) {
  return new Promise((resolve) => {
    const child = spawn(kane, args, { cwd, env: KANE_ENV, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGINT");
      setTimeout(() => child.kill("SIGKILL"), 10000).unref();
    }, Math.max(timeoutMs, 1000));
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const done = (code) => {
      clearTimeout(timer);
      if (logFile) fs.appendFileSync(logFile, `# $ kane-cli ${args.join(" ")}  (exit ${code}${timedOut ? ", timed out" : ""})\n${redact(stdout)}${stderr.trim() ? `# stderr: ${redact(stderr.trim())}\n` : ""}`);
      resolve({ code, timedOut, events: parseNdjson(stdout), stderr });
    };
    child.on("close", done);
    child.on("error", (err) => {
      stderr += err.message;
      done(null);
    });
  });
}

/**
 * One assurance command, through its pause loop. Exit 3 is a pause, not a
 * failure: answer each question with Kane's recommended option and resume.
 */
async function assurance(kane, baseArgs, resumeVerb, ctx) {
  let args = baseArgs;
  const all = [];
  for (let round = 0; ; round++) {
    const r = await runKane(kane, args, { cwd: ctx.dir, timeoutMs: ctx.deadline - Date.now(), logFile: ctx.log });
    all.push(...r.events);
    for (const e of r.events) if (e.type === "usage" && typeof e.credits === "number") ctx.credits += e.credits;
    const paused = r.code === 3 && r.events.find((e) => e.type === "session_paused");
    if (!paused) return { ...r, events: all };
    if (round >= ctx.maxPauses) return { ...r, events: all, error: `Kane still had questions after ${ctx.maxPauses} rounds of answers` };
    const answers = [];
    const record = { verb: resumeVerb.join(" "), sid: paused.sid, questions: [] };
    for (const q of paused.pending_questions || []) {
      const idx = q.recommended_index;
      const opt = Number.isInteger(idx) && q.options ? q.options[idx] : null;
      if (!opt || opt.input) {
        record.questions.push({ id: q.id, text: q.text, risk: q.risk, answered: null });
        ctx.pauses.push(record);
        return { ...r, events: all, error: `Kane asked a question with no recommended answer: "${q.text}"` };
      }
      answers.push("--answer", `${q.id}=${idx + 1}`);
      record.questions.push({ id: q.id, text: q.text, risk: q.risk, answered: opt.label, how: "Kane's recommended option, auto-picked by the headless hook" });
    }
    ctx.pauses.push(record);
    // A crash-pause carries no questions: resuming re-enters the session.
    args = [...resumeVerb, "--resume", paused.sid, "--mode", "agent", ...answers];
  }
}

/* ── derive: requirements → designed tests ────────────────────────────────── */

function taskKey({ requests, appUrl, cfg }) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify({ requests, appUrl, max: cfg.max, startPath: cfg.startPath }))
    .digest("hex")
    .slice(0, 12);
}

function designedTests(dir) {
  const testsDir = path.join(dir, ".testmuai", "tests");
  if (!fs.existsSync(testsDir)) return [];
  return fs
    .readdirSync(testsDir)
    .filter((f) => f.endsWith("_test.md"))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(testsDir, f), "utf8");
      return {
        id: (text.match(/^\s*id:\s*(t-[\w-]+)/m) || [])[1] || f.replace(/_test\.md$/, ""),
        title: (text.match(/^# (.+)$/m) || [])[1] || f,
        file: path.join(".testmuai", "tests", f),
        summary: ((text.match(/^> (.+)$/m) || [])[1] || "").trim(),
      };
    });
}

/**
 * Turns the task into designed `_test.md` files with Kane's assurance commands.
 * Resolves to a manifest; reuses an earlier manifest for the same task.
 */
async function deriveChecks({ root, requests, changes, appUrl, appName, cfg, deadline, log = () => {}, fresh = false }) {
  const key = taskKey({ requests, appUrl, cfg });
  const dir = path.join(root, ".driftor", "acceptance", key);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fresh && fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (m.status === "designed" || m.status === "no-tests") {
      log(`reusing the checks Kane designed for this task earlier (${m.tests.length} test(s), ${path.relative(root, dir)})`);
      return { ...m, reused: true, dir };
    }
  }
  if (fresh) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "requirements"), { recursive: true });

  const kane = findKane(root);
  const manifest = {
    key,
    status: "error",
    review: "unreviewed: designed with --allow-unreviewed; nothing promoted to trusted (a human can run `kane-cli context review` in this directory)",
    requests: requests.map(redact),
    appUrl,
    max: cfg.max,
    createdAt: new Date().toISOString(),
    commands: [],
    useCases: [],
    tests: [],
    warnings: [],
    variables: [],
    pauses: [],
    assuranceCredits: 0,
  };
  const save = () => fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, assuranceCredits: Math.round(manifest.assuranceCredits * 100) / 100 }, null, 2));
  if (!kane) {
    manifest.error = "kane-cli not found";
    save();
    return { ...manifest, dir };
  }

  const reqFile = path.join("requirements", "task.md");
  fs.writeFileSync(path.join(dir, reqFile), requirementsDoc({ requests, changes, appName, appUrl, startPath: cfg.startPath }));

  const ctx = { dir, deadline, log: path.join(dir, "kane.log"), credits: 0, pauses: manifest.pauses, maxPauses: cfg.maxPauses };
  const finish = (status, error) => {
    manifest.status = status;
    if (error) manifest.error = redact(error);
    manifest.assuranceCredits = ctx.credits;
    save();
    return { ...manifest, dir };
  };

  // 1. Ingest + extract the use-cases.
  log("Kane is reading the task (context ingest)…");
  const ingestArgs = ["context", "ingest", reqFile, "--mode", "agent", "--local"];
  manifest.commands.push(`kane-cli ${ingestArgs.join(" ")}`);
  const ing = await assurance(kane, ingestArgs, ["context", "extract"], ctx);
  const errEvent = ing.events.find((e) => e.type === "error");
  if (ing.error || ing.timedOut || ing.code !== 0) {
    return finish("error", ing.error || (ing.timedOut ? "context ingest ran out of time" : errEvent?.message || `context ingest exited ${ing.code}`));
  }
  for (const e of ing.events) {
    if (e.type === "commit") for (const m of e.minted || []) if (/^uc-/.test(m.logical_id)) manifest.useCases.push(m.logical_id);
    if (e.type === "warning") manifest.warnings.push(e.message || e.code);
  }
  if (!manifest.useCases.length) return finish("no-tests", "Kane found no testable use-case in the task");

  // 2. Design tests per use-case until the cap is reached.
  for (const uc of manifest.useCases) {
    const have = designedTests(dir).length;
    if (have >= cfg.max) break;
    if (Date.now() > deadline - 60000) {
      manifest.warnings.push(`stopped designing before ${uc}: out of time`);
      break;
    }
    log(`Kane is designing acceptance tests for ${uc} (design tests --max ${cfg.max - have})…`);
    const designArgs = ["design", "tests", "--use-case", uc, "--mode", "agent", "--max", String(cfg.max - have), "--allow-unreviewed"];
    manifest.commands.push(`kane-cli ${designArgs.join(" ")}`);
    const des = await assurance(kane, designArgs, ["design", "tests"], ctx);
    for (const e of des.events) {
      if (e.type === "receipt") manifest.warnings.push(...(e.warnings || []).filter((w) => !/not approved yet/.test(w)));
      if (e.type === "variables_declared" || e.type === "variables_summary") {
        for (const v of e.variables || []) if (!manifest.variables.some((x) => x.name === v.name)) manifest.variables.push({ name: v.name, file: e.file });
      }
    }
    if (des.error || des.timedOut || des.code !== 0) {
      const msg = des.error || (des.timedOut ? "design ran out of time" : des.events.find((e) => e.type === "error")?.message || `design exited ${des.code}`);
      manifest.warnings.push(`${uc}: ${redact(msg)}`);
    }
  }

  fillUrlVariables(dir, manifest.variables, appUrl);
  manifest.tests = designedTests(dir).slice(0, cfg.max);
  if (!manifest.tests.length) return finish(manifest.warnings.length ? "error" : "no-tests", manifest.warnings.join("; ") || "Kane designed no tests");
  return finish("designed");
}

/** Design may declare a {{variable}} for the app's address; that one value Driftor knows. */
function fillUrlVariables(dir, variables, appUrl) {
  for (const v of variables) {
    if (!/url|host|base|origin|address/i.test(v.name)) continue;
    const file = v.file ? path.resolve(dir, v.file) : path.join(dir, ".testmuai", "variables", "assurance.json");
    try {
      const pool = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
      const slot = pool[v.name] && typeof pool[v.name] === "object" ? pool[v.name] : {};
      if (!slot.value) pool[v.name] = { ...slot, value: appUrl };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(pool, null, 2));
      v.filled = appUrl;
    } catch {
      /* leave it; the run reports the unresolved variable */
    }
  }
}

/* ── run: designed tests → verdicts ───────────────────────────────────────── */

function getWindow(kane) {
  const res = spawnSync(kane, ["config", "show", "--agent"], { encoding: "utf8", env: KANE_ENV });
  try {
    return JSON.parse(res.stdout).window_size || null;
  } catch {
    return null;
  }
}

function setWindow(kane, size) {
  spawnSync(kane, ["config", "set-window", size], { encoding: "utf8", env: KANE_ENV });
  if (getWindow(kane) !== size) throw new Error(`kane-cli config set-window ${size} did not take effect`);
}

function balance(kane) {
  const res = spawnSync(kane, ["balance"], { encoding: "utf8", env: KANE_ENV, timeout: 20000 });
  const m = `${res.stdout || ""}`.match(/credits:\s*([\d.]+)/i);
  return m ? Number(m[1]) : null;
}

async function resetApp(appUrl, reset) {
  if (!reset) return;
  const res = await fetch(`${appUrl}${reset}`, { method: "POST" });
  if (!res.ok) throw new Error(`reset failed: HTTP ${res.status}`);
}

/**
 * Runs each designed test on its own (`testrun run <file>`), resetting the app
 * first, at the configured viewport. Resolves to one result per test:
 * { id, title, file, verdict: passed|failed|no-verdict, failure, duration_s, events }.
 */
async function runChecks({ root, manifest, appUrl, reset, cfg, headless, deadline, log = () => {} }) {
  const kane = findKane(root);
  const results = [];
  if (!kane || !manifest.tests?.length) return { results, browserCredits: null };
  const before = balance(kane);
  const original = getWindow(kane);
  const restore = () => {
    try {
      if (original && getWindow(kane) !== original) setWindow(kane, original);
    } catch {
      /* reported by the next run's set-window check */
    }
  };
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    if (cfg.viewport) setWindow(kane, cfg.viewport);
    for (const t of manifest.tests) {
      const left = deadline - Date.now();
      if (left < 45000) {
        results.push({ ...t, verdict: "no-verdict", failure: { message: "skipped: Driftor's time budget for derived checks ran out" }, events: [] });
        continue;
      }
      log(`Kane is running "${t.title}" in real Chrome (${cfg.viewport})…`);
      await resetApp(appUrl, reset);
      const args = ["testrun", "run", t.file, "--agent"];
      if (headless) args.push("--headless");
      const r = await runKane(kane, args, { cwd: manifest.dir, timeoutMs: left, logFile: path.join(manifest.dir, "kane.log") });
      const end = [...r.events].reverse().find((e) => e.type === "testrun_member_end" || e.type === "testrun_authored_member_end");
      const status = String(end?.status || "").toLowerCase();
      const verdict = status === "passed" ? "passed" : status === "failed" ? "failed" : "no-verdict";
      let events = [];
      if (end?.log_path && fs.existsSync(end.log_path)) events = parseNdjson(redact(fs.readFileSync(end.log_path, "utf8")));
      const failure = end?.failure || (verdict === "no-verdict" ? { message: r.timedOut ? "Kane ran out of time" : `Kane exited ${r.code} without a verdict` } : null);
      results.push({ ...t, verdict, failure, duration_s: end?.duration_s ?? null, events, suite: r.events });
      log(`  → ${verdict}${failure?.message ? `: ${String(failure.message).split("\n")[0].slice(0, 160)}` : ""}`);
    }
  } finally {
    restore();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
  const after = balance(kane);
  return { results, browserCredits: before != null && after != null ? Math.round((before - after) * 100) / 100 : null };
}

/* ── report + archive ─────────────────────────────────────────────────────── */

const traceName = (t) => `task-${t.id}.ndjson`;

function acceptanceFindings(results) {
  const findings = [];
  for (const r of results.filter((x) => x.verdict === "failed")) {
    const f = extractFindings(traceName(r), r.events);
    if (f.length) findings.push({ result: r, findings: f });
    else findings.push({ result: r, findings: [{ trace: traceName(r), step: r.failure?.step_index ?? null, summary: r.failure?.message, raw: JSON.stringify(r.failure || {}) }] });
  }
  return findings;
}

/**
 * The block feedback for derived checks: the same evidence shape as the
 * standing objectives (failing steps + Kane's analysis + raw event), and like
 * them it never names a file or a fix.
 */
function buildAcceptancePrompt(results, { app, viewport } = {}) {
  const failed = acceptanceFindings(results);
  if (!failed.length) return null;
  const lines = [
    `Kane CLI also turned the task you were given into acceptance tests (designed by Kane from`,
    `the user's request, not reviewed by a human) and ran them in real Chrome${viewport ? ` at ${viewport}` : ""}`,
    `against ${app || "the app"}. ${failed.length} of ${results.length} failed: the app does not yet do what the task asked.`,
    "",
    "Failing checks derived from the task:",
  ];
  for (const { result, findings } of failed) {
    lines.push(`- "${result.title}"${result.summary ? ` (${result.summary})` : ""}`);
    if (result.failure?.message) lines.push(`    kane's verdict: ${String(result.failure.message).split("\n").join("\n      ")}`);
    for (const f of findings) {
      const seen = new Set([result.failure?.message]);
      const add = (label, text) => {
        if (!text || seen.has(text)) return;
        seen.add(text);
        lines.push(`    ${label}: ${text.split("\n").join("\n      ")}`);
      };
      lines.push(`  [${f.trace}]${f.step != null ? ` step ${f.step}` : ""}`);
      add("what happened", f.summary);
      add("kane's analysis", f.rootCause);
      add("kane's suggestion", f.suggestion);
      if (f.raw) lines.push(`    raw event: ${f.raw}`);
    }
  }
  lines.push(
    "",
    "These checks come from the request, so they test what a user should be able to do, not",
    "how it is built. If one of them misreads the request, say so in your final message",
    "instead of working around it. Do not edit Kane's designed tests, driftor.js or kane-traces/."
  );
  return lines.join("\n");
}

/** Copies the derived checks' traces into the run folder and records them in run.json. */
function archive(runDir, { manifest, results, browserCredits, startedAt, cfg }) {
  fs.mkdirSync(runDir, { recursive: true });
  const checks = {};
  for (const r of results) {
    if (r.events.length) fs.writeFileSync(path.join(runDir, traceName(r)), r.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    checks[r.id] = {
      verdict: r.verdict,
      viewport: cfg.viewport,
      title: r.title,
      summary: r.summary || undefined,
      failure: r.failure ? { message: redact(r.failure.message || ""), step_index: r.failure.step_index } : undefined,
      duration_s: r.duration_s ?? undefined,
      trace: r.events.length ? traceName(r) : undefined,
    };
  }
  const testsDir = path.join(runDir, "task-tests");
  fs.mkdirSync(testsDir, { recursive: true });
  for (const t of manifest.tests || []) fs.copyFileSync(path.join(manifest.dir, t.file), path.join(testsDir, path.basename(t.file)));
  const reqSrc = path.join(manifest.dir, "requirements", "task.md");
  if (fs.existsSync(reqSrc)) fs.copyFileSync(reqSrc, path.join(runDir, "task-requirements.md"));

  const block = {
    derivedFrom: "task",
    review: "unreviewed",
    note: "Designed by Kane CLI's assurance commands from the user's request(s) in the agent session; run as written, never reviewed or promoted to trusted.",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: manifest.status,
    error: manifest.error,
    passed: results.length ? results.every((r) => r.verdict === "passed") : null,
    requests: manifest.requests,
    reusedDesign: !!manifest.reused,
    commands: manifest.commands,
    useCases: manifest.useCases,
    pauses: manifest.pauses,
    warnings: manifest.warnings,
    variables: manifest.variables,
    credits: { assurance: manifest.reused ? 0 : manifest.assuranceCredits, browser: browserCredits },
    checks,
  };
  const runJson = path.join(runDir, "run.json");
  const meta = fs.existsSync(runJson) ? JSON.parse(fs.readFileSync(runJson, "utf8")) : { startedAt, objectives: {} };
  meta.acceptance = block;
  fs.writeFileSync(runJson, JSON.stringify(meta, null, 2));
  return block;
}

module.exports = {
  acceptanceConfig,
  requestsFromTranscript,
  changeSummary,
  requirementsDoc,
  deriveChecks,
  runChecks,
  buildAcceptancePrompt,
  archive,
  redact,
};
