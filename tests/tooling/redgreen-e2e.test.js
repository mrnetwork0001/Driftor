/**
 * Red→green end to end against a stub kane-cli and a stub app: the
 * UserPromptSubmit hook designs + runs red, the Stop hook leaves an unchanged
 * app alone, and `--redgreen --after` replays the same tests green and writes
 * the receipt. No browser, no credits.
 *
 *   npm run test:tooling
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, describe, it } = require("node:test");

const DRIFTOR = path.join(__dirname, "..", "..", "driftor.js");

// A kane-cli that designs one test and fails it until the "feature" file exists.
const STUB_KANE = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), out = (o) => console.log(JSON.stringify(o));
fs.appendFileSync(process.env.STUB_CALLS, a.join(" ") + "\\n");
if (a[0] === "context" && a[1] === "ingest") { out({ type: "usage", credits: 5 }); out({ type: "commit", minted: [{ logical_id: "uc-1" }] }); }
else if (a[0] === "design") {
  fs.mkdirSync(".testmuai/tests", { recursive: true });
  fs.writeFileSync(".testmuai/tests/revoke-key_test.md", "---\\nassurance:\\n  id: t-1\\n---\\n# Revoke KEY-001\\n\\n> Revoke a key; it stays gone after reload.\\n\\n## Step 1 @verifies ac-1\\n\\nOpen the app and assert each key row has a Revoke button.\\n\\n## Step 2\\n\\nRevoke KEY-001, reload, and assert it is absent.\\n");
  out({ type: "usage", credits: 7 }); out({ type: "receipt", warnings: [] });
}
else if (a[0] === "testrun") {
  const ok = fs.existsSync(process.env.STUB_FEATURE);
  out({ type: "testrun_member_end", status: ok ? "passed" : "failed", duration_s: 3, failure: ok ? null : { message: "No Revoke button next to KEY-001", step_index: 1 } });
}
else if (a[0] === "config" && a[1] === "show") out({ window_size: "1920x1080" });
else if (a[0] === "balance") console.log("Available credits: 100");
`;

function run(args, { input = "", env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DRIFTOR, ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

describe("red→green end to end (stub kane-cli)", () => {
  let root;
  let server;
  let env;
  const feature = () => path.join(root, "feature-shipped");

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-rg-e2e-"));
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "kane-cli"), STUB_KANE, { mode: 0o755 });
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "app.js"), "export const keys = [];\n");
    server = http.createServer((req, res) => res.end('<html data-driftor="active"></html>'));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}`;
    fs.writeFileSync(
      path.join(root, "driftor.config.json"),
      JSON.stringify({ app: "stub app", url, reset: "/reset", watch: ["src"], objectives: [{ id: "o", title: "o", objective: "o" }], acceptance: { enabled: true, max: 1, viewport: "1920x1080", budgetSeconds: 120 } })
    );
    env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DRIFTOR_ROOT: root, DRIFTOR_HOOK: "1", DRIFTOR_URL: "", STUB_FEATURE: feature(), STUB_CALLS: path.join(root, "calls.log") };
  });
  after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prompt hook: designs from the prompt, runs red, and tells the agent the failing criteria", async () => {
    const input = JSON.stringify({ session_id: "s-42", prompt: "Add a Revoke button to each API key that removes it and keeps it removed after reload", hook_event_name: "UserPromptSubmit" });
    const r = await run(["--prompt-hook"], { input, env });
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(out.hookSpecificOutput.additionalContext, /\[FAILS NOW\] "Revoke KEY-001"/);
    assert.match(out.hookSpecificOutput.additionalContext, /Open the app and assert each key row has a Revoke button\./);
    assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /\.testmuai/);
    assert.match(out.systemMessage, /1 failed \(red, as expected before the change\)/);
    const baseline = JSON.parse(fs.readFileSync(path.join(root, ".driftor", "redgreen", "s-42", "baseline.json"), "utf8"));
    assert.equal(baseline.before[0].redGreen, "red");
    assert.equal(baseline.credits.assurance, 12);
  });

  it("prompt hook: a follow-up keeps the baseline instead of designing again; short replies are ignored", async () => {
    const calls = fs.readFileSync(env.STUB_CALLS, "utf8");
    const followUp = await run(["--prompt-hook"], { input: JSON.stringify({ session_id: "s-42", prompt: "Also make the button red please" }), env });
    assert.match(JSON.parse(followUp.stdout).hookSpecificOutput.additionalContext, /still stand/);
    const short = await run(["--prompt-hook"], { input: JSON.stringify({ session_id: "s-43", prompt: "yes" }), env });
    assert.equal(short.stdout, "");
    assert.equal(fs.readFileSync(env.STUB_CALLS, "utf8"), calls, "no Kane calls");
  });

  it("stop hook: an app unchanged since the red run is not re-run (no red→red spend)", async () => {
    const r = await run(["--hook"], { input: JSON.stringify({ session_id: "s-42" }), env });
    assert.match(JSON.parse(r.stdout).systemMessage, /hasn't changed since Kane's red run/);
  });

  it("--redgreen --after: the same test, no re-design, goes green and the receipt is archived", async () => {
    // The CLI baseline (session "cli") from a --before run, then the change.
    const b = await run(["--redgreen", "--before", "Add a Revoke button to each API key that removes it"], { env: { ...env, DRIFTOR_HOOK: "" } });
    assert.equal(b.code, 0, b.stdout + b.stderr);
    assert.match(b.stdout, /🟥 red +Revoke KEY-001/);
    const designsBefore = fs.readFileSync(env.STUB_CALLS, "utf8").split("\n").filter((l) => l.startsWith("design")).length;
    fs.writeFileSync(feature(), "");
    fs.writeFileSync(path.join(root, "src", "app.js"), "export const keys = []; export const revoke = () => {};\n");

    const a = await run(["--redgreen", "--after", "--no-gate"], { env: { ...env, DRIFTOR_HOOK: "" } });
    assert.equal(a.code, 0, a.stdout + a.stderr);
    assert.match(a.stdout, /✓ red→green +Revoke KEY-001/);
    assert.match(a.stdout, /Red→green: Kane designed 1 test from your task; it failed before the change and passes now\./);
    assert.equal(fs.readFileSync(env.STUB_CALLS, "utf8").split("\n").filter((l) => l.startsWith("design")).length, designsBefore, "no re-design");
    const runs = fs.readdirSync(path.join(root, "kane-traces", "runs"));
    const runDir = path.join(root, "kane-traces", "runs", runs[runs.length - 1]);
    const receipt = JSON.parse(fs.readFileSync(path.join(runDir, "redgreen.json"), "utf8"));
    assert.equal(receipt.summary.verdict, "proven");
    assert.equal(receipt.rows[0].beforeFailure, "No Revoke button next to KEY-001");
    const meta = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    assert.equal(meta.redGreen.proven, 1);
    assert.equal(meta.acceptance.reusedDesign, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, ".driftor", "redgreen", "cli", "baseline.json"), "utf8")).status, "closed");
  });
});
