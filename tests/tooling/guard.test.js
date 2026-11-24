/**
 * The guard (lib/guard.js): the agent can't mark its own homework.
 * Each case builds a throwaway git repo holding a copy of the demo app, the
 * config and a test file, makes one change, and asks the guard for a verdict.
 *
 *   node --test tests/tooling/guard.test.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { afterEach, beforeEach, describe, it } = require("node:test");
const guard = require("../../lib/guard");
const { REGRESSIONS } = require("../../lib/regressions");

const REPO = path.join(__dirname, "..", "..");
const FIXTURE = [
  "app/app/CloudScaleDashboard.tsx",
  "app/app/MaintenanceNotice.tsx",
  "app/app/CookieConsent.tsx",
  "app/app/page.tsx",
  "app/globals.css",
  "lib/cloudscale.ts",
  "driftor.config.json",
  "package.json",
  "tests/unit/cloudscale.test.tsx",
  ".claude/settings.json",
];
const DASH = "app/app/CloudScaleDashboard.tsx";

let dir;
const sh = (...args) => {
  const r = spawnSync("git", ["-c", "user.email=guard@test", "-c", "user.name=guard", ...args], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const edit = (rel, from, to) => {
  const text = read(rel);
  assert.ok(text.includes(from), `${rel} should contain ${from}`);
  write(rel, text.replace(from, to));
};
const config = () => JSON.parse(read("driftor.config.json"));
const check = (opts = {}) => guard.runGuard({ root: dir, config: config(), ...opts });
const rules = (r) => r.violations.map((v) => v.rule).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-guard-"));
  for (const rel of FIXTURE) write(rel, fs.readFileSync(path.join(REPO, rel), "utf8"));
  sh("init", "-q");
  sh("add", "-A");
  sh("commit", "-qm", "start");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("guard: protected files", () => {
  it("blocks editing a test file", () => {
    edit("tests/unit/cloudscale.test.tsx", "expect(", "expect.soft(");
    const r = check();
    assert.equal(r.verdict, "block");
    assert.deepEqual(r.violations.map((v) => [v.rule, v.file, v.change]), [["protected", "tests/unit/cloudscale.test.tsx", "modified"]]);
  });

  it("blocks deleting a test file, allows adding a new one", () => {
    fs.rmSync(path.join(dir, "tests/unit/cloudscale.test.tsx"));
    write("tests/unit/revoke.test.tsx", "it('revokes', () => {});\n");
    const r = check();
    assert.deepEqual(r.violations.map((v) => [v.file, v.change]), [["tests/unit/cloudscale.test.tsx", "deleted"]]);
    assert.ok(r.notes.some((n) => n.includes("tests/unit/revoke.test.tsx")));
  });

  it("blocks editing the objectives", () => {
    edit("driftor.config.json", "Click the button \\\"Generate Production API Key\\\" with a mouse click", "Click the button \\\"Generate Production API Key\\\" with the keyboard");
    const r = check();
    assert.equal(r.verdict, "block");
    assert.deepEqual(rules(r), ["protected"]);
    assert.equal(r.violations[0].file, "driftor.config.json");
  });

  it("package.json: blocks a test script change, allows a dependency bump", () => {
    const pkg = JSON.parse(read("package.json"));
    pkg.dependencies["lucide-react"] = "^9.9.9";
    pkg.scripts.dev = "next dev -p 3005";
    write("package.json", JSON.stringify(pkg, null, 2));
    assert.equal(check().verdict, "allow");
    pkg.scripts["test:unit"] = "vitest run --passWithNoTests || true";
    write("package.json", JSON.stringify(pkg, null, 2));
    const r = check();
    assert.equal(r.verdict, "block");
    assert.match(r.violations[0].detail, /"test:unit"/);
  });

  it(".claude/settings.json: blocks removing the Stop hook, allows unrelated settings", () => {
    const s = JSON.parse(read(".claude/settings.json"));
    write(".claude/settings.json", JSON.stringify({ ...s, permissions: { allow: ["Bash(ls)"] } }, null, 2));
    assert.equal(check().verdict, "allow");
    write(".claude/settings.json", JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }, null, 2));
    assert.equal(check().verdict, "block");
  });

  it("excuses files Driftor wrote itself while they are unchanged", () => {
    write("kane-traces/desktop-occlusion-gate.ndjson", '{"type":"run_end","status":"passed"}\n');
    const own = guard.dirtyHashes(dir);
    assert.equal(check({ own }).verdict, "allow");
    write("kane-traces/desktop-occlusion-gate.ndjson", '{"type":"run_end","status":"passed","note":"edited by the agent"}\n');
    assert.equal(check({ own }).verdict, "block");
  });
});

describe("guard: removing or hiding what the checks use", () => {
  const BUTTON = /\s*<button\s+onClick=\{handleGenerateKey\}[\s\S]*?<\/button>/;

  it("blocks deleting the Generate Production API Key button (even if a comment still names it)", () => {
    const text = read(DASH);
    assert.match(text, BUTTON);
    write(DASH, text.replace(BUTTON, ""));
    assert.ok(read(DASH).includes('"Generate Production API Key"'), "the header comment still has the label");
    const r = check();
    assert.equal(r.verdict, "block");
    assert.deepEqual(rules(r), ["removed-label"]);
    assert.equal(r.violations[0].label, "Generate Production API Key");
  });

  it("blocks adding `hidden` to that button", () => {
    edit(DASH, 'className="shrink-0 rounded-md bg-cs-brand', 'className="hidden shrink-0 rounded-md bg-cs-brand');
    const r = check();
    assert.equal(r.verdict, "block");
    assert.deepEqual(rules(r), ["hidden-label"]);
    assert.equal(r.violations[0].file, DASH);
    assert.equal(r.violations[0].label, "Generate Production API Key");
    assert.deepEqual(r.violations[0].tokens, ["class:hidden"]);
    assert.ok(r.violations[0].line > 290 && r.violations[0].line < 320);
  });

  it("blocks aria-hidden, a forced disabled and a style that hides it", () => {
    edit(DASH, 'data-testid="deploy-key-btn"', 'data-testid="deploy-key-btn" aria-hidden="true" style={{ opacity: 0 }}');
    edit(DASH, "disabled={!state || busy}\n                  data-testid=\"deploy-key-btn\"", "disabled\n                  data-testid=\"deploy-key-btn\"");
    const r = check();
    assert.deepEqual(r.violations[0].tokens.sort(), ["attr:aria-hidden", "attr:disabled=true", "style:opacity:0"]);
  });

  it("allows changing the button's disabled condition", () => {
    edit(DASH, "disabled={!state || busy}\n                  data-testid=\"deploy-key-btn\"", "disabled={!state || busy || !online}\n                  data-testid=\"deploy-key-btn\"");
    assert.equal(check().verdict, "allow");
  });

  it("blocks a CSS rule hiding it by its testid", () => {
    write("app/globals.css", `${read("app/globals.css")}\n[data-testid="deploy-key-btn"] {\n  display: none !important;\n}\n`);
    const r = check();
    assert.deepEqual(rules(r), ["hidden-label"]);
    assert.equal(r.violations[0].file, "app/globals.css");
  });

  it("blocks hiding the top-up link below lg (the breakpoint bug, done by the agent)", () => {
    edit(DASH, REGRESSIONS.breakpoint.healthy, REGRESSIONS.breakpoint.regressed);
    const r = check();
    assert.deepEqual(r.violations.map((v) => [v.rule, v.label, v.tokens.join(" ")]), [["hidden-label", "+ Top Up Quota ($250)", "class:hidden"]]);
  });

  it("allows `invisible opacity-0` on an unrelated element", () => {
    edit(DASH, '<h2 className="font-medium">Production API keys</h2>', '<h2 className="font-medium">Production API keys</h2>\n                  <div className="invisible opacity-0 hidden" aria-hidden="true">tooltip</div>');
    edit(DASH, 'className="rounded-md border border-cs-line px-2.5 py-1 text-xs"', 'className="rounded-md border border-cs-line px-2.5 py-1 text-xs invisible opacity-0"');
    const r = check();
    assert.equal(r.verdict, "allow", guard.printable(r));
  });

  it("allows a normal feature edit (a Revoke button, new copy, a new API route)", () => {
    edit(DASH, "Keys route requests across US and EU edge clusters.", "Keys route requests across US, EU and APAC edge clusters.");
    edit(DASH, "                  Generate Production API Key\n                </button>", '                  Generate Production API Key\n                </button>\n                <button data-testid="revoke-btn" disabled={busy} className="rounded-md border px-3 py-2 disabled:opacity-50 hidden sm:inline-flex">Revoke</button>');
    write("app/api/cloudscale/keys/[id]/route.ts", "export async function DELETE() { return Response.json({ ok: true }); }\n");
    const r = check();
    assert.equal(r.verdict, "allow", guard.printable(r));
    assert.ok(r.labels.includes("Generate Production API Key"));
  });

  it("allows moving the button into another file", () => {
    const text = read(DASH);
    const button = text.match(BUTTON)[0];
    write(DASH, text.replace(BUTTON, "\n                <GenerateButton />"));
    write("app/app/GenerateButton.tsx", `export function GenerateButton() {\n  return (${button}\n  );\n}\n`);
    assert.equal(check().verdict, "allow", guard.printable(check()));
  });
});

describe("guard: the bug zoo's fixes are never flagged", () => {
  for (const [name, r] of Object.entries(REGRESSIONS)) {
    it(`reverting the committed "${name}" bug passes`, () => {
      edit(r.file, r.healthy, r.regressed);
      sh("commit", "-qam", `inject ${name}`);
      edit(r.file, r.regressed, r.healthy);
      const v = check();
      assert.equal(v.verdict, "allow", guard.printable(v));
      assert.deepEqual(v.inspected, [r.file]);
    });

    it(`an uncommitted "${name}" injection from before the session isn't blamed on the agent`, () => {
      edit(r.file, r.healthy, r.regressed);
      // With the SessionStart baseline: untouched → nothing to inspect; reverted → allowed.
      const baseline = guard.recordBaseline(dir);
      assert.equal(check({ baseline }).inspected.length, 0);
      // Without a baseline (git HEAD), the zoo swap counts as the starting point.
      const injections = Object.values(REGRESSIONS);
      assert.equal(check({ injections }).verdict, "allow");
      edit(r.file, r.regressed, r.healthy);
      assert.equal(check({ baseline }).verdict, "allow");
      assert.equal(check({ injections }).verdict, "allow");
    });
  }
});

describe("guard: starting point and reporting", () => {
  it("a protected file the human had already edited before the session is excused until the agent touches it", () => {
    edit("driftor.config.json", '"maxHealAttempts": 3', '"maxHealAttempts": 2');
    const baseline = guard.recordBaseline(dir);
    assert.equal(check().verdict, "block"); // vs HEAD it looks like an edit
    assert.equal(check({ baseline }).verdict, "allow");
    edit("driftor.config.json", '"maxHealAttempts": 2', '"maxHealAttempts": 9');
    assert.equal(check({ baseline }).verdict, "block");
  });

  it("uses quoted labels from Kane-designed tests, but not ones the test expects to be gone", () => {
    edit(DASH, "Production API keys</h2>", 'Production API keys</h2>\n                  <p className="text-xs">Rotate keys every 90 days</p>');
    sh("commit", "-qam", "copy");
    const acceptanceTests = [{ name: "a_test.md", text: '# A\n\n## Step 1\n\nClick "Rotate keys every 90 days". Assert "Production API keys" is no longer shown.\n' }];
    const labels = guard.checkedLabels(config(), { acceptanceTests }).map((l) => l.label);
    assert.ok(labels.includes("Rotate keys every 90 days"));
    assert.ok(!labels.includes("Production API keys"));
    edit(DASH, '<p className="text-xs">Rotate keys every 90 days</p>', '<p className="text-xs sr-only">Rotate keys every 90 days</p>');
    assert.equal(check({ acceptanceTests }).verdict, "block");
    assert.equal(check().verdict, "allow"); // without the designed test, that label isn't checked
  });

  it("says what to revert and archives the decision", () => {
    edit("tests/unit/cloudscale.test.tsx", "expect(", "expect.soft(");
    edit(DASH, 'className="shrink-0 rounded-md bg-cs-brand', 'className="invisible shrink-0 rounded-md bg-cs-brand');
    const r = check();
    const reason = guard.buildGuardPrompt(r, { attempt: 1, maxAttempts: 3 });
    assert.match(reason, /attempt 1 of 3/);
    assert.match(reason, /Revert your edits to tests\/unit\/cloudscale\.test\.tsx/);
    assert.match(reason, /CloudScaleDashboard\.tsx:\d+ — <button data-testid="deploy-key-btn"> carrying "Generate Production API Key" gained invisible/);
    const file = guard.archiveDecision(path.join(dir, "kane-traces"), r, { session: "s1", trigger: "test" });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.verdict, "block");
    assert.equal(saved.session, "s1");
    assert.match(fs.readFileSync(path.join(dir, "kane-traces", "guard.log"), "utf8"), /BLOCK/);
  });

  it("is off with guard.enabled false, and skips outside git", () => {
    edit("driftor.config.json", '"maxHealAttempts": 3', '"maxHealAttempts": 3,\n  "guard": { "enabled": false }');
    assert.equal(check().verdict, "off");
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-guard-nogit-"));
    try {
      assert.equal(guard.runGuard({ root: plain, config: {} }).verdict, "skipped");
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
