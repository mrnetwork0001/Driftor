/**
 * Red-to-green proof per task.
 * ---------------------------------------------------------------------------
 * A test that passes after a change proves little if it would have passed
 * before it. So Driftor runs the acceptance tests Kane designs from the task
 * twice:
 *
 *   before  (UserPromptSubmit hook, or `--redgreen --before "<task>"`): Kane
 *           designs the tests from the prompt, before the agent writes any code,
 *           and runs them on the current app. They should FAIL (red): that is
 *           what shows they test something the app doesn't do yet.
 *   after   (Stop hook, or `--redgreen --after`): the SAME test files run again,
 *           with no re-design, and must PASS (green).
 *
 * The receipt pairs the two verdicts per test. Only red→green counts as proof.
 * A test that already passed before (green→green) is kept as a regression check
 * but doesn't count: it doesn't test the new behaviour. A test with no verdict on
 * either side proves nothing either way, and the receipt says so.
 *
 * The baseline lives in `.driftor/redgreen/<session>/` (gitignored, outside
 * every watched directory): baseline.json plus the red run's Kane traces. The
 * receipt and those traces are archived in the after-run's folder
 * (kane-traces/runs/<ts>/redgreen.json, redgreen-before/).
 */

const fs = require("fs");
const path = require("path");

/* ── classification ───────────────────────────────────────────────────────── */

/** Before the change: failed = red (good: it tests something new), passed = already green, else no verdict. */
function classifyBefore(verdict) {
  if (verdict === "failed") return "red";
  if (verdict === "passed") return "green";
  return "none";
}

const SIDE = { passed: "green", failed: "red" };
const side = (verdict) => SIDE[verdict] || "none";

/**
 * One row per test: before/after verdicts, the transition label and what it means.
 *   red→green    proof: failed before the change, passes now
 *   red→red      the task isn't done yet (blocks the stop)
 *   green→green  passed before too: a regression check, not proof
 *   green→red    the change broke it (blocks the stop)
 *   ?→…, …→?     no verdict on one side: proves nothing
 */
function pairRow(before, after) {
  const b = before ? side(before.verdict) : "none";
  const a = after ? side(after.verdict) : "none";
  const label = `${b === "none" ? "?" : b}→${a === "none" ? "?" : a}`;
  let outcome;
  if (b === "red" && a === "green") outcome = "proven";
  else if (a === "red") outcome = b === "green" ? "regressed" : "still-failing";
  else if (b === "green" && a === "green") outcome = "regression-check";
  else outcome = "no-proof";
  return { label, outcome, blocks: a === "red" };
}

/**
 * The receipt: the baseline's before results paired with the after results by
 * test id. Tests that exist on only one side are reported, not dropped.
 */
function buildReceipt(baseline, afterResults) {
  const byId = new Map((afterResults || []).map((r) => [r.id, r]));
  const rows = [];
  for (const b of baseline.before || []) {
    const a = byId.get(b.id);
    byId.delete(b.id);
    rows.push(row(b, a));
  }
  for (const a of byId.values()) rows.push(row(null, a));
  const count = (o) => rows.filter((r) => r.outcome === o).length;
  const summary = {
    tests: rows.length,
    proven: count("proven"),
    stillFailing: count("still-failing"),
    regressed: count("regressed"),
    regressionChecks: count("regression-check"),
    noProof: count("no-proof"),
  };
  const blocking = rows.filter((r) => r.blocks).length;
  summary.verdict = blocking ? "failing" : summary.proven && summary.proven === rows.length ? "proven" : summary.proven ? "partly-proven" : "unproven";
  return {
    kind: "driftor-redgreen-receipt",
    task: baseline.task,
    session: baseline.session,
    designedAt: baseline.createdAt,
    beforeAt: baseline.ranAt,
    afterAt: new Date().toISOString(),
    review: "unreviewed: designed by Kane CLI from the task, never reviewed or promoted to trusted",
    summary,
    rows,
    credits: { design: baseline.credits?.assurance ?? null, before: baseline.credits?.browser ?? null },
  };
}

function row(b, a) {
  const t = a || b;
  const { label, outcome, blocks } = pairRow(b, a);
  return {
    id: t.id,
    title: t.title,
    before: b ? b.verdict : "not run",
    after: a ? a.verdict : "not run",
    label,
    outcome,
    blocks,
    beforeFailure: b?.failure?.message || undefined,
    afterFailure: a && a.verdict !== "passed" ? a.failure?.message || undefined : undefined,
  };
}

/** The compact block stored as run.json's `redGreen`. */
function receiptSummary(receipt, file = "redgreen.json") {
  return { ...receipt.summary, task: receipt.task, receipt: file, rows: receipt.rows.map((r) => ({ id: r.id, title: r.title, label: r.label, outcome: r.outcome })) };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const numberWord = (n) => ["no", "one", "two", "three", "four", "five"][n] || String(n);

/** One sentence for the Stop hook's systemMessage / the terminal. */
function describeReceipt(receipt) {
  const s = receipt.summary;
  const n = s.tests;
  const head = `Red→green: Kane designed ${plural(n, "test")} from your task`;
  if (s.verdict === "proven") {
    return n === 1 ? `${head}; it failed before the change and passes now.` : `${head}; ${n === 2 ? "both" : `all ${n}`} failed before the change and pass now.`;
  }
  const parts = [];
  if (s.proven) parts.push(`${numberWord(s.proven)} failed before the change and ${s.proven === 1 ? "passes" : "pass"} now (proof)`);
  if (s.stillFailing) parts.push(`${numberWord(s.stillFailing)} still ${s.stillFailing === 1 ? "fails" : "fail"}`);
  if (s.regressed) parts.push(`${numberWord(s.regressed)} passed before and ${s.regressed === 1 ? "fails" : "fail"} now`);
  if (s.regressionChecks) parts.push(`${numberWord(s.regressionChecks)} already passed before the change, so ${s.regressionChecks === 1 ? "it is" : "they are"} a regression check, not proof`);
  if (s.noProof) parts.push(`${numberWord(s.noProof)} reached no verdict on one side, so ${s.noProof === 1 ? "it proves" : "they prove"} nothing`);
  return `${head}: ${parts.join("; ")}.`;
}

/** The receipt as terminal lines. */
function formatReceipt(receipt) {
  const mark = { proven: "✓", "still-failing": "✗", regressed: "✗", "regression-check": "=", "no-proof": "?" };
  const lines = [];
  for (const r of receipt.rows) {
    lines.push(`${mark[r.outcome]} ${r.label.padEnd(12)} ${r.title}`);
    if (r.outcome === "regression-check") lines.push(`  ${"".padEnd(12)} passed before the change too: kept as a regression check, not counted as proof`);
    if (r.beforeFailure && r.label.startsWith("red")) lines.push(`  ${"".padEnd(12)} before: ${firstLine(r.beforeFailure)}`);
    if (r.afterFailure) lines.push(`  ${"".padEnd(12)} after:  ${firstLine(r.afterFailure)}`);
  }
  return lines;
}

const firstLine = (s) => String(s).split("\n")[0].slice(0, 200);

/* ── the before side: what the agent is told ──────────────────────────────── */

/** Title, summary and plain steps of a designed `_test.md` (no ids, no @verifies tags). */
function readTestSteps(file) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  return body
    .split(/^## Step \d+[^\n]*\n/m)
    .slice(1)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/**
 * additionalContext for the UserPromptSubmit hook: the acceptance criteria Kane
 * designed, and that they fail on the app as it is now, so the agent works
 * test-first. Evidence only: no file paths into Kane's store, no fix.
 */
function buildBeforeContext(baseline, { scrub = (s) => s, app } = {}) {
  const red = baseline.before.filter((r) => r.redGreen === "red");
  const green = baseline.before.filter((r) => r.redGreen === "green");
  const none = baseline.before.filter((r) => r.redGreen === "none");
  const lines = [
    "Driftor (red→green): before you write any code, Kane CLI turned this request into acceptance",
    `tests (designed by Kane from the user's words, not reviewed by a human) and ran them in real`,
    `Chrome${baseline.viewport ? ` at ${baseline.viewport}` : ""} against ${app || "the app"} as it is now.`,
    "",
    red.length
      ? `${plural(red.length, "test")} FAILED on the current app, as it should before the change. When you end your turn, Driftor runs the same tests again and they must pass; a test that still fails blocks the stop.`
      : "None of them failed on the current app, so none of them proves the change yet (see below).",
    "",
    "Acceptance criteria (work test-first against these):",
  ];
  for (const r of baseline.before) {
    const tag = r.redGreen === "red" ? "FAILS NOW" : r.redGreen === "green" ? "ALREADY PASSES" : "NO VERDICT";
    lines.push(`- [${tag}] "${r.title}"${r.summary ? `: ${r.summary}` : ""}`);
    (r.steps || []).forEach((s, i) => lines.push(`    ${i + 1}. ${s}`));
    if (r.redGreen === "red" && r.failure?.message) lines.push(`    kane's verdict now: ${scrub(firstLine(r.failure.message))}`);
    if (r.redGreen === "none" && r.failure?.message) lines.push(`    (${scrub(firstLine(r.failure.message))})`);
  }
  if (green.length) {
    lines.push(
      "",
      `${plural(green.length, "test")} already passed before any change: ${green.length === 1 ? "it doesn't" : "they don't"} test the new behaviour. Driftor still runs ${green.length === 1 ? "it" : "them"} at the end as a regression check, but won't count ${green.length === 1 ? "it" : "them"} as proof.`
    );
  }
  if (none.length) lines.push("", `${plural(none.length, "test")} reached no verdict before the change, so ${none.length === 1 ? "it" : "they"} can't count as proof either.`);
  lines.push(
    "",
    "These checks test what a user should be able to do, not how it is built. If one of them misreads",
    "the request, say so in your final message instead of working around it. Do not edit Kane's",
    "designed tests, driftor.js or kane-traces/."
  );
  return lines.join("\n");
}

/** One line for the UserPromptSubmit systemMessage / the terminal. */
function describeBefore(baseline) {
  const n = baseline.before.length;
  const red = baseline.before.filter((r) => r.redGreen === "red").length;
  const green = baseline.before.filter((r) => r.redGreen === "green").length;
  const none = n - red - green;
  const parts = [`${red} failed (red, as expected before the change)`];
  if (green) parts.push(`${green} already passed (a regression check, not proof)`);
  if (none) parts.push(`${none} reached no verdict`);
  return `Red→green baseline: Kane designed ${plural(n, "test")} from the task and ran them on the current app: ${parts.join(", ")}.`;
}

/* ── baseline storage ─────────────────────────────────────────────────────── */

const safe = (s) => String(s || "manual").replace(/[^\w.-]/g, "_").slice(0, 80);
const baselineDir = (root, session) => path.join(root, ".driftor", "redgreen", safe(session));
const traceName = (r) => `task-${r.id}.ndjson`;

/**
 * Stores the red run: baseline.json (manifest pointer, before verdicts, the
 * steps the agent was shown) and the before traces next to it.
 */
function saveBaseline(root, { session, task, manifest, results, fingerprint, appUrl, viewport, credits }) {
  const dir = baselineDir(root, session);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "before"), { recursive: true });
  const before = results.map((r) => {
    if (r.events?.length) fs.writeFileSync(path.join(dir, "before", traceName(r)), r.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    return {
      id: r.id,
      title: r.title,
      summary: r.summary || undefined,
      file: r.file,
      verdict: r.verdict,
      redGreen: classifyBefore(r.verdict),
      failure: r.failure ? { message: r.failure.message || "", step_index: r.failure.step_index } : undefined,
      unresolved: r.unresolved,
      duration_s: r.duration_s ?? undefined,
      trace: r.events?.length ? traceName(r) : undefined,
      steps: readTestSteps(path.join(manifest.dir, r.file)),
    };
  });
  const baseline = {
    kind: "driftor-redgreen-baseline",
    status: "open",
    session,
    task,
    createdAt: manifest.createdAt,
    ranAt: new Date().toISOString(),
    appUrl,
    viewport,
    fingerprint,
    manifest: { key: manifest.key, dir: path.relative(root, manifest.dir), tests: manifest.tests, status: manifest.status, requests: manifest.requests, useCases: manifest.useCases, commands: manifest.commands, pauses: manifest.pauses, warnings: manifest.warnings, variables: manifest.variables, createdAt: manifest.createdAt },
    credits,
    before,
  };
  fs.writeFileSync(path.join(dir, "baseline.json"), JSON.stringify(baseline, null, 2));
  return baseline;
}

function loadBaseline(root, session) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(baselineDir(root, session), "baseline.json"), "utf8"));
    return b.kind === "driftor-redgreen-baseline" ? b : null;
  } catch {
    return null;
  }
}

function updateBaseline(root, session, patch) {
  const b = loadBaseline(root, session);
  if (!b) return null;
  Object.assign(b, patch);
  fs.writeFileSync(path.join(baselineDir(root, session), "baseline.json"), JSON.stringify(b, null, 2));
  return b;
}

/** The acceptance manifest the after-run replays: the same test files, no re-design. */
function manifestFor(root, baseline) {
  return { ...baseline.manifest, dir: path.join(root, baseline.manifest.dir), reused: true, status: "designed" };
}

/** Writes redgreen.json + the before traces into the run folder and adds `redGreen` to run.json. */
function archiveReceipt(root, runDir, baseline, receipt) {
  fs.mkdirSync(runDir, { recursive: true });
  const src = path.join(baselineDir(root, baseline.session), "before");
  const dest = path.join(runDir, "redgreen-before");
  if (fs.existsSync(src)) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  const full = {
    ...receipt,
    before: baseline.before.map(({ steps, file, ...rest }) => ({ ...rest, trace: rest.trace ? `redgreen-before/${rest.trace}` : undefined })),
  };
  fs.writeFileSync(path.join(runDir, "redgreen.json"), JSON.stringify(full, null, 2));
  const runJson = path.join(runDir, "run.json");
  const meta = fs.existsSync(runJson) ? JSON.parse(fs.readFileSync(runJson, "utf8")) : {};
  meta.redGreen = receiptSummary(receipt);
  fs.writeFileSync(runJson, JSON.stringify(meta, null, 2));
  return full;
}

module.exports = {
  classifyBefore,
  pairRow,
  buildReceipt,
  receiptSummary,
  describeReceipt,
  formatReceipt,
  readTestSteps,
  buildBeforeContext,
  describeBefore,
  baselineDir,
  saveBaseline,
  loadBaseline,
  updateBaseline,
  manifestFor,
  archiveReceipt,
};
