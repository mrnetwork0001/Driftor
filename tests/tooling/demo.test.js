/**
 * `driftor demo` replays archived evidence: it must run with no app, no config and
 * no Kane login, and every verdict it prints must come from kane-traces/.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { describe, it } = require("node:test");

const ROOT = path.join(__dirname, "..", "..");
const run = (args, opts = {}) =>
  spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, ...opts });

describe("driftor demo", () => {
  const res = run([path.join(ROOT, "scripts", "demo.js"), "--fast"]);
  const out = res.stdout;

  it("exits 0 without colour codes when piped", () => {
    assert.equal(res.status, 0, res.stderr);
    assert.doesNotMatch(out, /\x1b\[/);
  });

  it("replays the session: green unit tests, Kane catches the overlay, Claude fixes it, Kane passes", () => {
    assert.match(out, /✓ unit tests \(npx vitest run\): Tests\s+4 passed \(4\)/);
    assert.ok(out.includes('✗ step 5  wait: Waiting do not click the covered "Generate Production API Key" button'));
    assert.ok(out.includes("✗ step 6  wait: Waiting stop after the mouse click missed"));
    assert.match(out, /BLOCKED/);
    assert.match(out, /attempt 1 of 3/);
    assert.match(out, /✓ lib\/heal\.js, re-run on the archived NDJSON just now, rebuilds that feedback byte for byte/);
    assert.match(out, /\+ <div data-testid="maintenance-layer" className="pointer-events-none fixed inset-0 z-50">/);
    assert.match(out, /run 2026-11-18T08-03-06-216Z/);
    assert.match(out, /Driftor: Kane verified all 2 objectives in real Chrome\. ✓/);
  });

  it("replays the Revoke session: Kane designed 2 tests from the task and both passed", () => {
    assert.match(out, /✓ t-1  Revoke KEY-001 and retain KEY-002 after reload/);
    assert.match(out, /✓ t-2  Revoke the last remaining KEY-002/);
    assert.match(out, /✓ 2 designed tests, 2 passed/);
  });

  it("prints the bug zoo: 5 rows, every bug green in unit tests and caught by Kane", () => {
    const rows = out.split("\n").filter((l) => /^\s{3}\S+\s+✓ 27 passed/.test(l));
    assert.deepEqual(
      rows.map((l) => l.trim().split(/\s+/)[0]),
      ["overlay", "pointer-events", "opacity", "breakpoint", "stale-cache"]
    );
    for (const l of rows) assert.match(l, /caught/);
    assert.match(out, /Unit tests caught 0 of 5\. Kane in real Chrome caught 5 of 5\./);
  });

  it("ends with how to install it and the evidence files it replayed, all of which exist", () => {
    assert.match(out, /npx -y github:mrnetwork0001\/Driftor init/);
    assert.match(out, /https:\/\/github\.com\/mrnetwork0001\/Driftor/);
    const files = out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("kane-traces/"));
    assert.ok(files.length >= 15, `${files.length} evidence files listed`);
    for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  });

  it("runs one part on its own, and lists the parts", () => {
    const zoo = run([path.join(ROOT, "scripts", "demo.js"), "zoo", "--fast"]);
    assert.equal(zoo.status, 0, zoo.stderr);
    assert.match(zoo.stdout, /3\/3/);
    assert.doesNotMatch(zoo.stdout, /1\/3|2\/3/);
    const list = run([path.join(ROOT, "scripts", "demo.js"), "--list"]);
    assert.match(list.stdout, /session[\s\S]*accept[\s\S]*zoo/);
    assert.equal(run([path.join(ROOT, "scripts", "demo.js"), "nope"]).status, 1);
  });

  it("dispatches from driftor.js before it looks for a project config", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-demo-"));
    try {
      const env = { ...process.env, NO_COLOR: "1" };
      delete env.DRIFTOR_ROOT;
      const r = run([path.join(ROOT, "driftor.js"), "demo", "zoo", "--fast"], { cwd, env });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Kane in real Chrome caught 5 of 5/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
