#!/usr/bin/env node
/**
 * Driftor demo: replays archived evidence in the terminal. No account, no Kane
 * credits, no browser, no running app. Every line it prints comes from a file
 * under kane-traces/ (run.json, Kane's NDJSON traces, sanitized Claude Code
 * transcripts and diffs); nothing is generated.
 *
 *   npx -y github:mrnetwork0001/Driftor demo     # ~20 s, paced
 *   node driftor.js demo --fast                  # no pauses
 *   node scripts/demo.js session|accept|zoo      # one part only
 *   node scripts/demo.js --list                  # the parts and the evidence they read
 *
 * Pauses only happen on an interactive terminal; colour honours NO_COLOR.
 */

const fs = require("fs");
const path = require("path");
const { parseNdjson, extractFindings, buildHealPrompt } = require("../lib/heal");

const PKG_ROOT = path.join(__dirname, "..");
const TRACES = path.join(PKG_ROOT, "kane-traces");
const RUNS = path.join(TRACES, "runs");
const SESSIONS = path.join(TRACES, "agent-sessions");
const REPO = "https://github.com/mrnetwork0001/Driftor";

// The evidence each part replays (the archive is append-only; these never change).
const EVIDENCE = {
  session: {
    transcript: "2026-11-18T08-00-30Z-feature-with-bug-on-branch",
    failed: "2026-11-18T08-00-54-950Z",
    passed: "2026-11-18T08-03-06-216Z",
  },
  accept: { transcript: "2026-11-24T00-02-46Z-revoke-button", run: "2026-11-24T00-05-41-127Z" },
  zoo: { day: "2026-11-23" },
};

const PARTS = {
  session: "A Claude Code session: unit tests green, Kane catches the bug in real Chrome, Claude fixes it",
  accept: "Kane designs acceptance tests from the task itself, and runs them",
  zoo: "The bug zoo: 5 one-line UI bugs, unit tests vs Kane on desktop and narrow screens",
};

/* ── output ───────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const TTY = !!process.stdout.isTTY;
const FAST = argv.includes("--fast") || !TTY;
const COLOR = TTY && !("NO_COLOR" in process.env && process.env.NO_COLOR !== "");
const WIDTH = Math.max(60, Math.min(process.stdout.columns || 100, 110));

const sgr = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { bold: sgr(1), dim: sgr(2), red: sgr(31), green: sgr(32), yellow: sgr(33), cyan: sgr(36), magenta: sgr(35) };
const OK = c.green("✓");
const BAD = c.red("✗");

// Pauses below are written by feel, then scaled so the whole replay takes about 20 s.
const PACE = 0.62;
let planned = 0; // total pause, for tuning (DRIFTOR_DEMO_TIMING=1)
const sleep = (raw) => {
  const ms = Math.round(raw * PACE);
  planned += ms;
  return FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
};
const out = (s = "") => process.stdout.write(`${s}\n`);
async function say(s = "", pause = 90) {
  out(s);
  await sleep(pause);
}
const rule = (ch = "─") => c.dim(ch.repeat(WIDTH));

/** Word-wraps text to the terminal, with a prefix on every line. */
function wrap(text, prefix = "   ", width = WIDTH) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (cur && prefix.length + cur.length + 1 + word.length > width) {
        lines.push(prefix + cur);
        cur = word;
      } else cur = cur ? `${cur} ${word}` : word;
    }
    lines.push(prefix + cur);
  }
  return lines;
}
async function sayWrapped(text, prefix, pause = 70, style = (s) => s) {
  for (const l of wrap(text, prefix)) await say(style(l), pause);
}

/* ── reading the archive ──────────────────────────────────────────────────── */

const rel = (p) => path.relative(PKG_ROOT, p);
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function need(file) {
  if (!fs.existsSync(file)) throw new Error(`archived evidence missing: ${rel(file)}`);
  return file;
}
const runJson = (id) => readJson(need(path.join(RUNS, id, "run.json")));
const ndjson = (id, objective) => parseNdjson(fs.readFileSync(need(path.join(RUNS, id, `${objective}.ndjson`)), "utf8"));

/** Claude Code stream-json transcript → the parts the story needs. */
function readTranscript(base) {
  const events = parseNdjson(fs.readFileSync(need(path.join(SESSIONS, `${base}.jsonl`)), "utf8"));
  const texts = (e) =>
    Array.isArray(e.message?.content) ? e.message.content.filter((b) => b.type === "text").map((b) => b.text) : [];
  const turns = [];
  for (const e of events) {
    if (e.type === "assistant") for (const t of texts(e)) turns.push({ who: "claude", text: t });
    else if (e.type === "user") for (const t of texts(e)) turns.push({ who: "user", text: t });
    else if (e.type === "system" && e.subtype === "informational" && typeof e.content === "string")
      turns.push({ who: "hook", text: e.content });
  }
  return { events, turns };
}

/** Unified diff → [{ file, removed: [...], added: [...] }]. */
function readDiff(base) {
  const files = [];
  let cur = null;
  for (const l of fs.readFileSync(need(path.join(SESSIONS, `${base}.diff`)), "utf8").split("\n")) {
    if (l.startsWith("+++ ")) {
      cur = { file: l.slice(4).split("\t")[0].replace(/^b\//, ""), removed: [], added: [] };
      files.push(cur);
    } else if (!cur || l.startsWith("--- ") || l.startsWith("diff ") || l.startsWith("index ")) continue;
    else if (l.startsWith("-")) cur.removed.push(l.slice(1).trim());
    else if (l.startsWith("+")) cur.added.push(l.slice(1).trim());
  }
  return files;
}

/** Kane's step events that finished (done or failed), in order. */
const finishedSteps = (events) => events.filter((e) => e.step != null && e.status && e.status !== "running");
const firstSentences = (text, n = 2) => (text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text]).slice(0, n).join("").trim();
const shorten = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ── part 1: the session ──────────────────────────────────────────────────── */

async function partSession() {
  const ev = EVIDENCE.session;
  const meta = readJson(need(path.join(SESSIONS, `${ev.transcript}.meta.json`)));
  const { turns } = readTranscript(ev.transcript);
  const diff = readDiff(ev.transcript);
  const failed = runJson(ev.failed);
  const passed = runJson(ev.passed);
  const zoo = require("../lib/regressions").REGRESSIONS;

  const feedbackAt = turns.findIndex((t) => t.who === "user" && t.text.startsWith("Stop hook feedback"));
  if (feedbackAt < 0) throw new Error(`no Stop hook feedback in ${ev.transcript}.jsonl`);
  const done = turns.slice(0, feedbackAt).filter((t) => t.who === "claude").pop();
  const after = turns.slice(feedbackAt + 1);
  const diagnosis = after.filter((t) => t.who === "claude").sort((a, b) => b.text.length - a.text.length)[0];
  const verdict = after.find((t) => t.who === "hook");
  const feature = diff.find((d) => d.file.endsWith("CloudScaleDashboard.tsx"));
  const fix = diff.find((d) => d.file.endsWith(zoo[meta.injected]?.file.split("/").pop() || "MaintenanceNotice.tsx"));

  await say(c.bold(` 1/3  ${PARTS.session}`), 400);
  await say(rule(), 150);
  await say(` ${c.dim("Task given to Claude Code:")}`, 60);
  await sayWrapped(`"${meta.prompt}"`, "   ", 70, c.cyan);
  if (meta.injected && zoo[meta.injected]) {
    await say(` ${c.dim("Already on the branch (bug zoo:")} ${c.yellow(meta.injected)}${c.dim("):")} ${zoo[meta.injected].title}`, 500);
  }
  await say();
  if (feature) {
    await say(` ${c.dim("Claude edits")} ${feature.file}`, 80);
    for (const l of feature.removed) await say(c.red(`   - ${l}`), 60);
    for (const l of feature.added) await say(c.green(`   + ${l}`), 60);
  }
  // Markdown stripped from the quote: backticks and the colon that introduced a code block.
  const doneLine = done && done.text.split("\n")[0].replace(/`/g, "").replace(/:$/, "");
  if (done) await say(` ${c.magenta("Claude:")} "${shorten(doneLine, WIDTH - 12)}"`, 900);

  await say();
  await say(c.bold(` Claude stops → Driftor's Stop hook runs the gate`) + c.dim(`  (run ${ev.failed})`), 500);
  await say(`   ${failed.unit?.passed ? OK : BAD} unit tests (${failed.unit?.command}): ${failed.unit?.summary}  ${c.dim("← JSDOM sees nothing wrong")}`, 800);
  const failing = [];
  for (const [id, o] of Object.entries(failed.objectives)) {
    const events = ndjson(ev.failed, id);
    const found = extractFindings(`${id}.ndjson`, events).filter((f) => f.step != null);
    failing.push(...found);
    await say(`   ${c.bold("Kane CLI, real Chrome")} ${o.viewport}: ${o.title}`, 300);
    for (const s of finishedSteps(events)) {
      const bad = found.find((f) => f.step === s.step);
      await say(`     ${bad ? BAD : OK} step ${s.step}  ${bad ? c.red(bad.summary) : c.dim(shorten(s.remark, WIDTH - 16))}`, bad ? 900 : 220);
    }
    await say(`     ${o.verdict === "failed" ? BAD : OK} ${o.verdict === "failed" ? c.red(c.bold("FAILED")) : "passed"}`, 400);
  }

  await say();
  await say(c.red(c.bold(` ✗ BLOCKED — Claude's turn is not over. lib/heal.js sends the failing steps back:`)), 600);
  const fed = turns[feedbackAt].text.split("\n");
  const attemptLine = fed.find((l) => /attempt \d+ of \d+/.test(l));
  if (attemptLine) await say(c.dim(`   │ ${attemptLine}`), 120);
  for (const f of failing) {
    await say(c.dim(`   │ - [${f.trace}] step ${f.step}`), 100);
    await say(c.dim(`   │     what happened: ${f.summary}`), 160);
  }
  await say(c.dim(`   │ … (${fed.length} lines in all, with Kane's raw events; quoted from the transcript)`), 300);
  // Not a replay: rebuild the prompt from the archived NDJSON now and compare it with what Claude got.
  const all = Object.keys(failed.objectives).flatMap((id) => extractFindings(`${id}.ndjson`, ndjson(ev.failed, id)));
  const same = turns[feedbackAt].text.includes(buildHealPrompt(all));
  await say(`   ${same ? OK : BAD} ${c.dim(same ? "lib/heal.js, re-run on the archived NDJSON just now, rebuilds that feedback byte for byte" : "lib/heal.js output differs from the archived feedback")}`, 900);

  await say();
  if (diagnosis) {
    await say(` ${c.magenta("Claude:")}`, 60);
    await sayWrapped(`"${firstSentences(diagnosis.text, 3)}"`, "   ", 160);
  }
  if (fix) {
    await say(` ${c.dim("Claude's fix,")} ${fix.file}`, 120);
    for (const l of fix.removed) await say(c.red(`   - ${l}`), 120);
    for (const l of fix.added) await say(c.green(`   + ${l}`), 700);
  }

  await say();
  await say(c.bold(` Claude stops again → Kane re-runs`) + c.dim(`  (run ${ev.passed})`), 600);
  for (const [id, o] of Object.entries(passed.objectives)) {
    const steps = finishedSteps(ndjson(ev.passed, id));
    const ok = o.verdict === "passed";
    await say(`   ${ok ? OK : BAD} ${o.viewport.padEnd(9)} ${o.title}  ${c.dim(`${steps.filter((s) => s.status === "done").length} steps`)}`, 400);
  }
  if (verdict) await say(` ${c.green(c.bold(verdict.text.replace(/^Stop says:\s*/, "")))}`, 1400);
}

/* ── part 2: acceptance tests designed from the task ──────────────────────── */

async function partAccept() {
  const ev = EVIDENCE.accept;
  const meta = readJson(need(path.join(SESSIONS, `${ev.transcript}.meta.json`)));
  const { turns } = readTranscript(ev.transcript);
  const run = runJson(ev.run);
  const a = run.acceptance;
  if (!a) throw new Error(`no acceptance block in runs/${ev.run}/run.json`);
  const verdict = turns.filter((t) => t.who === "hook").pop();
  const checks = Object.entries(a.checks || {});
  const passedN = checks.filter(([, t]) => t.verdict === "passed").length;

  await say(c.bold(` 2/3  ${PARTS.accept}`), 400);
  await say(rule(), 150);
  await say(` ${c.dim("Task given to Claude Code:")}`, 60);
  await sayWrapped(`"${meta.prompt}"`, "   ", 70, c.cyan);
  await say();
  await say(c.bold(` Claude stops → the gate`) + c.dim(`  (run ${ev.run})`), 400);
  await say(`   ${run.unit?.passed ? OK : BAD} unit tests: ${run.unit?.summary}`, 250);
  for (const o of Object.values(run.objectives)) await say(`   ${o.verdict === "passed" ? OK : BAD} ${o.viewport.padEnd(9)} ${o.title}`, 250);
  await say();
  await say(` ${c.bold("Kane designs tests from the user's words")} ${c.dim(`(${a.review}; nobody wrote these)`)}`, 300);
  for (const cmd of a.commands || []) await say(c.dim(`   $ ${cmd}`), 300);
  for (const [id, t] of checks) {
    await say(`   ${t.verdict === "passed" ? OK : BAD} ${id}  ${c.bold(t.title)}  ${c.dim(`${t.viewport}, ${t.duration_s} s`)}`, 250);
    await sayWrapped(t.summary, "         ", 90, c.dim);
  }
  await say(`   ${passedN === checks.length ? OK : BAD} ${c.bold(`${checks.length} designed tests, ${passedN} passed`)}`, 500);
  if (verdict) await sayWrapped(verdict.text.replace(/^Stop says:\s*/, ""), " ", 1400, (s) => c.green(c.bold(s)));
}

/* ── part 3: the bug zoo ──────────────────────────────────────────────────── */

/** The latest full CLI gate run on the zoo day for each regression. */
function zooRuns() {
  const zoo = require("../lib/regressions").REGRESSIONS;
  const byBug = {};
  for (const id of fs.readdirSync(RUNS).filter((d) => d.startsWith(EVIDENCE.zoo.day)).sort()) {
    const r = runJson(id);
    if (r.trigger !== "cli" || !Array.isArray(r.regression) || r.regression.length !== 1) continue;
    if (r.selection && r.selection.mode !== "all") continue;
    byBug[r.regression[0]] = { id, run: r };
  }
  return Object.keys(zoo).map((name) => ({ name, title: zoo[name].title, ...byBug[name] }));
}

async function partZoo() {
  const rows = zooRuns();
  await say(c.bold(` 3/3  ${PARTS.zoo}`), 400);
  await say(rule(), 150);
  await say(c.dim(` Each bug is a one-line change (lib/regressions.js). Same gate, same app, one bug at a time.`), 300);
  await say();
  const col = (s, n) => s + " ".repeat(Math.max(0, n - s.replace(/\x1b\[[0-9;]*m/g, "").length));
  await say(c.bold(`   ${col("bug", 16)}${col("unit (JSDOM)", 18)}${col("Kane desktop", 16)}${col("Kane narrow", 16)}run`), 200);
  let caught = 0;
  let unitCaught = 0;
  for (const row of rows) {
    if (!row.run) {
      await say(`   ${col(row.name, 16)}${c.dim("no archived run")}`, 200);
      continue;
    }
    const u = row.run.unit;
    const v = (id) => row.run.objectives[id]?.verdict;
    const cell = (verdict) => (verdict === "failed" ? `${BAD} ${c.red("caught")}` : verdict === "passed" ? `${OK} passed` : c.dim("–"));
    const d = v("desktop-occlusion-gate");
    const n = v("narrow-viewport-gate");
    if (d === "failed" || n === "failed") caught++;
    if (u && !u.passed) unitCaught++;
    const unitCell = u ? `${u.passed ? OK : BAD} ${u.summary.replace(/^Tests\s+/, "").replace(/\s*\(\d+\)$/, "")}` : c.dim("–");
    await say(`   ${col(c.yellow(row.name), 16)}${col(unitCell, 18)}${col(cell(d), 16)}${col(cell(n), 16)}${c.dim(row.id)}`, 550);
  }
  await say();
  await say(` ${c.bold(`Unit tests caught ${unitCaught} of ${rows.length}. Kane in real Chrome caught ${caught} of ${rows.length}.`)}`, 600);
  await say(c.dim(` A "passed" cell means that bug doesn't show at that width (lib/regressions.js says which width each one breaks).`), 1200);
}

/* ── the end ──────────────────────────────────────────────────────────────── */

function evidenceFiles(parts) {
  const files = [];
  const add = (p) => fs.existsSync(p) && files.push(rel(p));
  if (parts.includes("session")) {
    const e = EVIDENCE.session;
    for (const ext of [".jsonl", ".diff", ".meta.json"]) add(path.join(SESSIONS, e.transcript + ext));
    for (const id of [e.failed, e.passed]) add(path.join(RUNS, id, "run.json"));
    add(path.join(RUNS, e.failed, "desktop-occlusion-gate.ndjson"));
    add(path.join(RUNS, e.failed, "narrow-viewport-gate.ndjson"));
  }
  if (parts.includes("accept")) {
    const e = EVIDENCE.accept;
    for (const ext of [".jsonl", ".diff", ".meta.json"]) add(path.join(SESSIONS, e.transcript + ext));
    for (const f of ["run.json", "task-requirements.md", "task-t-1.ndjson", "task-t-2.ndjson"]) add(path.join(RUNS, e.run, f));
  }
  if (parts.includes("zoo")) for (const r of zooRuns()) if (r.id) add(path.join(RUNS, r.id, "run.json"));
  return files;
}

async function outro(parts) {
  await say();
  await say(rule("═"), 100);
  await say(c.bold(" Put it on your own repo (a Next.js or Vite app; needs Claude Code and a Kane CLI login):"), 150);
  await say(`   ${c.cyan("npx -y github:mrnetwork0001/Driftor init")}   ${c.dim("# config, Stop hook in .claude/settings.json, npm scripts")}`, 120);
  await say(`   ${c.cyan("npm install -D @testmuai/kane-cli && npx kane-cli login")}`, 120);
  await say(`   ${c.cyan("npm run driftor:check")}                      ${c.dim("# config + app discovery, no browser")}`, 120);
  await say(`   ${c.cyan("npm run driftor:agent")}                      ${c.dim("# Claude Code with the Stop hook on")}`, 150);
  await say(` ${c.bold("Repo:")} ${REPO}`, 150);
  await say();
  await say(c.dim(" Everything above was replayed from these archived files (in the repo / this package):"), 100);
  for (const f of evidenceFiles(parts)) await say(c.dim(`   ${f}`), 25);
  if (process.env.DRIFTOR_DEMO_TIMING) process.stderr.write(`planned pauses: ${(planned / 1000).toFixed(1)} s\n`);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main(args = argv) {
  const wanted = args.filter((a) => !a.startsWith("-"));
  if (args.includes("--list") || args.includes("--help") || args.includes("-h")) {
    out("Driftor demo — replays archived Kane runs and Claude Code sessions. No browser, no credits.\n");
    out("  npx -y github:mrnetwork0001/Driftor demo [part] [--fast]\n");
    for (const [name, what] of Object.entries(PARTS)) out(`  ${name.padEnd(8)} ${what}`);
    out("\n  (no part) all three, about 20 seconds; --fast skips the pauses");
    return 0;
  }
  const unknown = wanted.filter((w) => !PARTS[w]);
  if (unknown.length) {
    console.error(` ✗ Unknown demo part "${unknown[0]}". Parts: ${Object.keys(PARTS).join(", ")} (or --list).`);
    return 1;
  }
  const parts = wanted.length ? Object.keys(PARTS).filter((p) => wanted.includes(p)) : Object.keys(PARTS);
  const run = { session: partSession, accept: partAccept, zoo: partZoo };

  await say(rule("═"), 50);
  await say(c.bold(" DRIFTOR") + " — a Claude Code Stop hook that won't let the turn end until Kane CLI passes in real Chrome", 50);
  await say(c.dim(" Replaying real archived runs: no account, no Kane credits, no browser."), 50);
  await say(rule("═"), 700);
  await say();
  for (const p of parts) {
    await run[p]();
    await say();
  }
  await outro(parts);
  return 0;
}

module.exports = { main, zooRuns, readDiff, readTranscript, EVIDENCE, PARTS };

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(` ✗ demo: ${err.message}`);
      process.exit(1);
    }
  );
}
