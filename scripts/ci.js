#!/usr/bin/env node
/**
 * Driftor in CI: turn an archived gate run into a policy verdict and a PR comment.
 *
 *   node scripts/ci.js latest                      # print the newest kane-traces/runs/<stamp> folder
 *   node scripts/ci.js verdict [runDir] [--policy policies/driftor-gate.yaml]
 *   node scripts/ci.js comment [runDir] [--out comment.md]
 *
 * verdict: `kane-cli run` seals one evidence pack per objective in its session
 * folder (~/.testmuai/kaneai/sessions/<session_id>/evidence/). The session id is
 * in each trace's `recording_state` event, so this copies those packs into
 * <runDir>/evidence/, merges them into one sealed pack and judges it with
 * `kane-cli evidence merge … --policy`. The summary lands in <runDir>/verdict.json
 * and the exit code is Kane's: 0 pass, 1 fail, 3 errored, 2 no pack / usage.
 *
 * comment: renders run.json, the failing steps (lib/heal.js extractFindings) and
 * the verdict as Markdown, headed by a marker so CI can update one sticky comment.
 * Each failing objective's "what the user saw" card (lib/card.js) is embedded as
 * an image when it is committed at the checked-out commit (a GitHub comment needs
 * a URL; raw.githubusercontent.com serves public repos only), and otherwise named
 * with a link to the run's artifact, which holds it. See docs/ci.md.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseNdjson, extractFindings, buildHealPrompt } = require("../lib/heal");

const ROOT = path.join(__dirname, "..");
const MARKER = "<!-- driftor-gate -->";

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

function traceDir() {
  const cfg = readJson(path.join(ROOT, "driftor.config.json")) || {};
  return path.join(ROOT, cfg.traceDir || "kane-traces");
}

function latestRun() {
  const runs = path.join(traceDir(), "runs");
  if (!fs.existsSync(runs)) return null;
  const dirs = fs.readdirSync(runs).filter((d) => fs.existsSync(path.join(runs, d, "run.json"))).sort();
  return dirs.length ? path.join(runs, dirs[dirs.length - 1]) : null;
}

/** Objective traces in a run folder: { id, file, events }. */
function traces(runDir) {
  return fs
    .readdirSync(runDir)
    .filter((f) => f.endsWith(".ndjson"))
    .sort()
    .map((f) => ({ id: f.replace(/\.ndjson$/, ""), file: f, events: parseNdjson(fs.readFileSync(path.join(runDir, f), "utf8")) }));
}

/* ── evidence pack + verdict ──────────────────────────────────────────────── */

const sessionsDir = () => process.env.KANE_SESSIONS_DIR || path.join(os.homedir(), ".testmuai", "kaneai", "sessions");

/** Copies each objective's sealed pack into <runDir>/evidence/. Returns { packs, missing }. */
function collectPacks(runDir) {
  const out = path.join(runDir, "evidence");
  fs.mkdirSync(out, { recursive: true });
  const packs = [];
  const missing = [];
  for (const t of traces(runDir)) {
    const session = t.events.find((e) => e.type === "recording_state" && e.session_id)?.session_id;
    const dir = session && path.join(sessionsDir(), session, "evidence");
    const pack = dir && fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith(".evidence"));
    if (!pack) {
      missing.push(t.id);
      continue;
    }
    const dest = path.join(out, `${t.id}.evidence`);
    fs.copyFileSync(path.join(dir, pack), dest);
    packs.push(dest);
  }
  return { packs, missing };
}

function findKane() {
  const local = path.join(ROOT, "node_modules", ".bin", "kane-cli");
  return fs.existsSync(local) ? local : "kane-cli";
}

function cmdVerdict(runDir, policy) {
  const { packs, missing } = collectPacks(runDir);
  const write = (summary) => fs.writeFileSync(path.join(runDir, "verdict.json"), JSON.stringify(summary, null, 2));
  if (missing.length) console.error(` ! No sealed evidence pack found for: ${missing.join(", ")}`);
  if (!packs.length) {
    write({ result: "errored", error: { message: "No sealed evidence pack found for any objective." }, missing });
    console.error(" ✗ Nothing to judge.");
    return 2;
  }
  const merged = path.join(runDir, "evidence", "driftor-gate.evidence");
  fs.rmSync(merged, { force: true });
  fs.rmSync(`${merged}.verdicts`, { recursive: true, force: true });
  const runId = `driftor-${path.basename(runDir)}`;
  const res = spawnSync(
    findKane(),
    ["evidence", "merge", ...packs, "--run-id", runId, "-o", merged, "--policy", policy, "--json"],
    { encoding: "utf8", env: { ...process.env, KANE_CLI_USER_AGENT: process.env.KANE_CLI_USER_AGENT || "driftor" } }
  );
  let report = null;
  try {
    report = JSON.parse(res.stdout.slice(res.stdout.indexOf("{")));
  } catch {
    /* fall through */
  }
  const verdict = report?.verdict;
  if (!verdict) {
    write({ result: "errored", error: { message: (res.stderr || res.stdout || "").trim().slice(-2000) }, missing });
    console.error(` ✗ kane-cli evidence merge exited ${res.status} without a verdict.`);
    return res.status || 2;
  }
  const doc = (verdict.verdicts || [])[0] || {};
  write({
    result: verdict.result,
    exit_code: verdict.exit_code,
    pack: path.relative(runDir, merged),
    policy: doc.policy?.id,
    gates: (doc.gates || []).map(({ id, metric, expr, op, expected, actual, severity, status, message }) => ({
      id, metric: metric || expr, op, expected, actual, severity, status, message,
    })),
    missing,
  });
  console.log(` ${verdict.result === "pass" ? "✓" : "✗"} Policy ${doc.policy?.id || path.basename(policy)}: ${verdict.result}`);
  return res.status ?? 2;
}

/* ── PR comment ───────────────────────────────────────────────────────────── */

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
const quote = (s) => String(s).split("\n").map((l) => `> ${l}`).join("\n");

/**
 * A URL GitHub can show for a file in this repo, or null: only for a file
 * committed unchanged at HEAD, on GitHub Actions (where HEAD is on GitHub).
 * DRIFTOR_CARD_BASE_URL (e.g. a deployed copy of the site) overrides it.
 */
function committedFileUrl(file, env = process.env) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (rel.startsWith("..")) return null;
  if (env.DRIFTOR_CARD_BASE_URL) return `${env.DRIFTOR_CARD_BASE_URL.replace(/\/$/, "")}/${rel}`;
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo } = env;
  if (!server || !repo) return null;
  const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (git("ls-files", "--error-unmatch", "--", rel).status !== 0) return null; // made in this job, not committed
  if (git("diff", "--quiet", "HEAD", "--", rel).status !== 0) return null;
  const sha = git("rev-parse", "HEAD").stdout.trim();
  if (!sha) return null;
  return server === "https://github.com" ? `https://raw.githubusercontent.com/${repo}/${sha}/${rel}` : `${server}/${repo}/raw/${sha}/${rel}`;
}

/**
 * Markdown for one archived run. `artifactUrl` links the uploaded run folder;
 * `cardUrl(file)` gives an embeddable URL for a card, or null to link the artifact instead.
 */
function renderComment(runDir, { artifactUrl, cardUrl = () => null } = {}) {
  const run = readJson(path.join(runDir, "run.json")) || {};
  const verdict = readJson(path.join(runDir, "verdict.json"));
  const cfg = readJson(path.join(ROOT, "driftor.config.json")) || {};
  const all = traces(runDir);
  const findings = all.flatMap((t) => extractFindings(t.file, t.events));
  const objectives = Object.entries(run.objectives || {});
  const failed = objectives.filter(([, o]) => o.verdict !== "passed");
  const policyFailed = verdict && verdict.result !== "pass";
  const passed = run.passed === true && !policyFailed;

  const out = [MARKER];
  out.push(`## Driftor gate: ${passed ? "✅ passed" : "❌ failed"}`, "");
  out.push(
    passed
      ? `Kane CLI ran all ${objectives.length} objectives in real Chrome and every one passed.`
      : `Kane CLI ran ${objectives.length} objectives in real Chrome; ${failed.length} did not pass.`
  );
  if (run.unit) {
    const unit = `${run.unit.command}: ${run.unit.summary || (run.unit.passed ? "passed" : "failed")}`;
    out.push(
      "",
      run.unit.passed && !run.passed
        ? `Unit suite (\`${unit}\`) is green. It runs in JSDOM, which has no layout engine, so it can't see this.`
        : `Unit suite: \`${unit}\``
    );
  }

  out.push("", "| Objective | Viewport | Kane |", "|---|---|---|");
  for (const [id, o] of objectives) {
    const mark = o.verdict === "passed" ? "✅ passed" : o.verdict === "failed" ? "❌ failed" : "⚠️ no verdict";
    out.push(`| **${cell(id)}**<br>${cell(o.title)} | ${cell(o.viewport || "default")} | ${mark} |`);
  }

  if (verdict) {
    const name = verdict.policy || "policy";
    out.push("", `### Evidence policy \`${name}\`: ${verdict.result === "pass" ? "✅ pass" : verdict.result === "fail" ? "❌ fail" : "⚠️ errored"}`);
    const bad = (verdict.gates || []).filter((g) => g.status !== "pass");
    if (bad.length) {
      out.push("", "| Gate | Metric | Expected | Actual | |", "|---|---|---|---|---|");
      for (const g of bad) {
        out.push(`| ${cell(g.id)} | \`${cell(g.metric)}\` | ${cell(`${g.op} ${JSON.stringify(g.expected)}`)} | ${cell(g.actual)} | ${cell(g.status)} (${cell(g.severity)}) |`);
      }
    } else if (verdict.error) {
      out.push("", `The pack couldn't be judged: ${cell(verdict.error.message)}`);
    } else {
      out.push("", `All ${(verdict.gates || []).length} gates passed.`);
    }
    if (verdict.missing?.length) out.push("", `No sealed evidence pack for: ${verdict.missing.map((m) => `\`${m}\``).join(", ")}.`);
  }

  if (findings.length) {
    let prompt = buildHealPrompt(findings, { app: cfg.app });
    // GitHub caps a comment at 65,536 characters; the raw events are the bulky part.
    if (prompt.length > 30000) prompt = `${prompt.slice(0, 30000)}\n… (truncated; the full traces are in the artifact)`;
    out.push("", "### Failing steps");
    for (const t of all) {
      const mine = findings.filter((f) => f.trace === t.file);
      if (!mine.length) continue;
      out.push("", `**${t.id}**`);
      const card = path.join(runDir, `card-${t.id}.png`);
      if (fs.existsSync(card)) {
        const url = cardUrl(card);
        out.push(
          "",
          url
            ? `![What the user saw: ${t.id}](${url})`
            : `What the user saw: \`${path.basename(card)}\`${artifactUrl ? ` in the [run artifact](${artifactUrl})` : " in the run folder"}: Kane's screenshot of the failing step.`
        );
      }
      for (const f of mine) {
        if (f.step != null) out.push(`- Step ${f.step}: ${cell(f.summary)}${f.code ? ` (\`${f.code}\`)` : ""}`);
      }
      const analysis = mine.find((f) => f.step == null);
      if (analysis) {
        out.push("", quote(`Kane's end-of-run analysis${analysis.code ? ` (\`${analysis.code}\`)` : ""}: ${analysis.rootCause || analysis.summary}`));
        if (analysis.suggestion) out.push(quote(""), quote(`Suggestion: ${analysis.suggestion}`));
      }
    }
    out.push(
      "",
      "_Kane's end-of-run analysis is based on a screenshot; trust the step-level evidence._",
      "",
      "<details><summary>Prompt a coding agent gets for this failure (<code>npm run driftor:heal</code>)</summary>",
      "",
      "```text",
      prompt,
      "```",
      "",
      "</details>"
    );
  }

  const meta = [`run \`${path.basename(runDir)}\``];
  if (run.regression?.length) meta.push(`injected regression: ${run.regression.join(", ")}`);
  if (artifactUrl) meta.push(`[traces + evidence pack](${artifactUrl})`);
  out.push("", `<sub>${meta.join(" · ")}</sub>`, "");
  return out.join("\n");
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i !== -1 ? rest[i + 1] : null;
  };
  const positional = rest.find((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));
  const runDir = positional ? path.resolve(positional) : latestRun();

  if (cmd === "latest") {
    if (!runDir) return 1;
    console.log(runDir);
    return 0;
  }
  if (cmd !== "verdict" && cmd !== "comment") {
    console.error("Usage: node scripts/ci.js latest | verdict [runDir] [--policy file] | comment [runDir] [--out file]");
    return 2;
  }
  if (!runDir || !fs.existsSync(path.join(runDir, "run.json"))) {
    console.error(" ✗ No archived gate run found (kane-traces/runs/<stamp>/run.json). Did the gate run?");
    return 2;
  }
  if (cmd === "verdict") {
    return cmdVerdict(runDir, path.resolve(flag("--policy") || path.join(ROOT, "policies", "driftor-gate.yaml")));
  }
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = process.env;
  // DRIFTOR_ARTIFACT_URL: the uploaded run folder itself (actions/upload-artifact's artifact-url output).
  const artifactUrl = process.env.DRIFTOR_ARTIFACT_URL || (server && repo && id ? `${server}/${repo}/actions/runs/${id}` : undefined);
  const md = renderComment(runDir, { artifactUrl, cardUrl: (file) => committedFileUrl(file) });
  if (flag("--out")) fs.writeFileSync(flag("--out"), md);
  else process.stdout.write(md);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { renderComment, committedFileUrl, collectPacks, latestRun, MARKER };
