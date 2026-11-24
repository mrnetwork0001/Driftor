/**
 * Red→green proof per task (lib/redgreen.js): classification, the receipt,
 * what the agent is told before it starts, and the baseline round trip.
 *
 *   npm run test:tooling
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, it } = require("node:test");
const rg = require("../../lib/redgreen");
const { acceptanceConfig } = require("../../lib/acceptance");

const res = (id, verdict, message) => ({ id, title: `Test ${id}`, verdict, failure: message ? { message } : null, events: [] });
const baselineOf = (...before) => ({
  task: "Add a Revoke button",
  session: "s1",
  createdAt: "2026-11-24T00:00:00Z",
  ranAt: "2026-11-24T00:05:00Z",
  credits: { assurance: 25, browser: 40 },
  before: before.map((r) => ({ ...r, redGreen: rg.classifyBefore(r.verdict) })),
});

describe("red→green: classification", () => {
  it("classifies the before run: failed is red (good), passed is already green, anything else no verdict", () => {
    assert.equal(rg.classifyBefore("failed"), "red");
    assert.equal(rg.classifyBefore("passed"), "green");
    assert.equal(rg.classifyBefore("no-verdict"), "none");
    assert.equal(rg.classifyBefore(undefined), "none");
  });

  it("pairs before and after verdicts; only red→green is proof, any red after blocks", () => {
    const pair = (b, a) => rg.pairRow(b && { verdict: b }, a && { verdict: a });
    assert.deepEqual(pair("failed", "passed"), { label: "red→green", outcome: "proven", blocks: false });
    assert.deepEqual(pair("failed", "failed"), { label: "red→red", outcome: "still-failing", blocks: true });
    assert.deepEqual(pair("passed", "passed"), { label: "green→green", outcome: "regression-check", blocks: false });
    assert.deepEqual(pair("passed", "failed"), { label: "green→red", outcome: "regressed", blocks: true });
    assert.deepEqual(pair("no-verdict", "passed"), { label: "?→green", outcome: "no-proof", blocks: false });
    assert.deepEqual(pair("failed", "no-verdict"), { label: "red→?", outcome: "no-proof", blocks: false });
    assert.deepEqual(pair("no-verdict", "failed"), { label: "?→red", outcome: "still-failing", blocks: true });
    assert.deepEqual(pair(null, "passed"), { label: "?→green", outcome: "no-proof", blocks: false });
  });
});

describe("red→green: the receipt", () => {
  it("two red tests that pass now are proven, in one sentence", () => {
    const receipt = rg.buildReceipt(baselineOf(res("t-1", "failed", "no Revoke button"), res("t-2", "failed", "no Revoke button")), [res("t-1", "passed"), res("t-2", "passed")]);
    assert.equal(receipt.summary.verdict, "proven");
    assert.equal(receipt.summary.proven, 2);
    assert.equal(rg.describeReceipt(receipt), "Red→green: Kane designed 2 tests from your task; both failed before the change and pass now.");
    assert.deepEqual(receipt.rows.map((r) => r.label), ["red→green", "red→green"]);
    assert.equal(receipt.rows[0].beforeFailure, "no Revoke button");
    assert.equal(receipt.rows[0].afterFailure, undefined);
    assert.equal(rg.receiptSummary(receipt).rows[1].outcome, "proven");
  });

  it("a test that already passed before is a regression check, not proof, and says so", () => {
    const receipt = rg.buildReceipt(baselineOf(res("t-1", "failed", "x"), res("t-2", "passed")), [res("t-1", "passed"), res("t-2", "passed")]);
    assert.equal(receipt.summary.verdict, "partly-proven");
    assert.equal(receipt.summary.regressionChecks, 1);
    assert.match(rg.describeReceipt(receipt), /one failed before the change and passes now \(proof\); one already passed before the change, so it is a regression check, not proof\./);
    assert.ok(rg.formatReceipt(receipt).some((l) => /regression check, not counted as proof/.test(l)));
  });

  it("red→red and green→red block; a missing or no-verdict side proves nothing", () => {
    const receipt = rg.buildReceipt(baselineOf(res("t-1", "failed", "x"), res("t-2", "passed"), res("t-3", "no-verdict", "empty variable")), [
      res("t-1", "failed", "still no button"),
      res("t-2", "failed", "broke it"),
      res("t-3", "passed"),
      res("t-4", "passed"),
    ]);
    assert.equal(receipt.summary.verdict, "failing");
    assert.deepEqual(receipt.rows.map((r) => [r.id, r.label, r.blocks]), [
      ["t-1", "red→red", true],
      ["t-2", "green→red", true],
      ["t-3", "?→green", false],
      ["t-4", "?→green", false],
    ]);
    assert.equal(receipt.rows[3].before, "not run");
    assert.equal(receipt.summary.noProof, 2);
    assert.match(rg.describeReceipt(receipt), /one still fails; one passed before and fails now; two reached no verdict on one side/);
  });

  it("nothing red before means nothing is proven", () => {
    const receipt = rg.buildReceipt(baselineOf(res("t-1", "passed")), [res("t-1", "passed")]);
    assert.equal(receipt.summary.verdict, "unproven");
  });
});

describe("red→green: baseline, agent context and archive", () => {
  let root;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("saves the red run, tells the agent the criteria without store paths, and archives the receipt", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-rg-"));
    const store = path.join(root, ".driftor", "acceptance", "abc");
    fs.mkdirSync(path.join(store, ".testmuai", "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(store, ".testmuai", "tests", "revoke_test.md"),
      "---\nassurance:\n  id: t-1\n---\n# Revoke KEY-001\n\n> Revoke a key and it stays gone.\n\n## Step 1 @verifies ac-1\n\nOpen http://localhost:3003/app and assert each row has a Revoke button.\n\n## Step 2\n\nReload and assert KEY-001 is absent.\n"
    );
    const manifest = { key: "abc", dir: store, status: "designed", createdAt: "2026-11-24T00:00:00Z", tests: [{ id: "t-1", title: "Revoke KEY-001", file: ".testmuai/tests/revoke_test.md", summary: "Revoke a key and it stays gone." }] };
    const results = [{ ...manifest.tests[0], verdict: "failed", failure: { message: "There is no Revoke button in Foo.tsx" }, events: [{ type: "step_end", status: "failed" }] }];
    const baseline = rg.saveBaseline(root, { session: "sess/1", task: "Add revoke", manifest, results, fingerprint: "f1", appUrl: "http://localhost:3003", viewport: "1920x1080", credits: { assurance: 20, browser: 30 } });

    const loaded = rg.loadBaseline(root, "sess/1");
    assert.equal(loaded.status, "open");
    assert.equal(loaded.before[0].redGreen, "red");
    assert.deepEqual(loaded.before[0].steps, ["Open http://localhost:3003/app and assert each row has a Revoke button.", "Reload and assert KEY-001 is absent."]);
    assert.equal(loaded.manifest.dir, path.join(".driftor", "acceptance", "abc"));
    assert.equal(rg.manifestFor(root, loaded).dir, store);
    assert.ok(fs.existsSync(path.join(rg.baselineDir(root, "sess/1"), "before", "task-t-1.ndjson")));

    const scrub = (s) => s.replace(/\w+\.tsx/g, "[a source file]");
    const ctx = rg.buildBeforeContext(baseline, { scrub, app: "CloudScale" });
    assert.match(ctx, /1 test FAILED on the current app/);
    assert.match(ctx, /\[FAILS NOW\] "Revoke KEY-001": Revoke a key and it stays gone\./);
    assert.match(ctx, /1\. Open http:\/\/localhost:3003\/app and assert each row has a Revoke button\./);
    assert.match(ctx, /kane's verdict now: There is no Revoke button in \[a source file\]/);
    assert.doesNotMatch(ctx, /\.testmuai|@verifies|Foo\.tsx/);
    assert.match(rg.describeBefore(baseline), /1 failed \(red, as expected before the change\)/);

    const runDir = path.join(root, "kane-traces", "runs", "r1");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify({ passed: true }));
    const receipt = rg.buildReceipt(loaded, [{ ...manifest.tests[0], verdict: "passed", events: [] }]);
    rg.archiveReceipt(root, runDir, loaded, receipt);
    const archived = JSON.parse(fs.readFileSync(path.join(runDir, "redgreen.json"), "utf8"));
    assert.equal(archived.summary.verdict, "proven");
    assert.equal(archived.before[0].trace, "redgreen-before/task-t-1.ndjson");
    assert.ok(fs.existsSync(path.join(runDir, "redgreen-before", "task-t-1.ndjson")));
    const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    assert.equal(run.passed, true);
    assert.equal(run.redGreen.proven, 1);
    assert.equal(run.redGreen.receipt, "redgreen.json");

    rg.updateBaseline(root, "sess/1", { status: "closed" });
    assert.equal(rg.loadBaseline(root, "sess/1").status, "closed");
    assert.equal(rg.loadBaseline(root, "nobody"), null);
  });

  it("acceptance.redGreen defaults to on and can be switched off", () => {
    assert.equal(acceptanceConfig({ acceptance: { enabled: true } }).redGreen, true);
    assert.equal(acceptanceConfig({ acceptance: { enabled: true, redGreen: false } }).redGreen, false);
  });
});
