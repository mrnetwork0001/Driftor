/**
 * Tests for Driftor's own tooling (the CI comment renderer and `driftor init`),
 * kept out of the demo app's Vitest suite so the gate's "unit suite" verdict
 * stays the app's tests only.
 *
 *   npm run test:tooling     # node --test tests/tooling/*.test.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, it } = require("node:test");
const { renderComment, MARKER } = require("../../scripts/ci");
const { main: init, mergeHook } = require("../../scripts/init");

const FAILING_RUN = path.join(__dirname, "..", "..", "kane-traces", "runs", "2026-11-18T08-00-54-950Z");

const silently = (fn) => {
  const { log, error } = console;
  console.log = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, { log, error });
  }
};

describe("CI PR comment", () => {
  it("renders the failing steps of an archived failing run", () => {
    const md = renderComment(FAILING_RUN, { artifactUrl: "https://example.test/run/1" });
    assert.ok(md.startsWith(MARKER));
    assert.match(md, /Driftor gate: ❌ failed/);
    assert.match(md, /\| \*\*desktop-occlusion-gate\*\*/);
    assert.ok(md.includes('Step 5: wait: Waiting do not click the covered "Generate Production API Key" button'));
    assert.match(md, /Step 6:/);
    assert.match(md, /is green\. It runs in JSDOM/);
    assert.match(md, /injected regression: overlay/);
    assert.ok(md.includes("(https://example.test/run/1)"));
  });
});

describe("driftor init", () => {
  let dir;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const setup = (pkg, files = {}) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-init-"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
  };
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));

  it("sets up a Vite repo and merges the Stop hook into existing settings", () => {
    setup(
      { name: "demo", type: "module", scripts: { dev: "vite --port 3008" }, devDependencies: { vite: "5" } },
      {
        "vite.config.js": 'export default { base: "https://example.github.io/demo/" }',
        "src/main.js": "",
        ".claude/settings.json": JSON.stringify({
          permissions: { allow: ["Bash(ls)"] },
          hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
        }),
      }
    );
    assert.equal(silently(() => init(["--dir", dir])), 0);

    const config = read("driftor.config.json");
    assert.deepEqual(config.discover.ports, [3008, 3008]);
    assert.equal(config.reset, null);
    assert.deepEqual(config.watch, ["src"]);
    assert.ok(config.objectives.every((o) => o.placeholder && o.objective.includes("{{url}}/demo/")));

    const settings = read(".claude/settings.json");
    assert.deepEqual(settings.permissions.allow, ["Bash(ls)"]);
    assert.equal(settings.hooks.Stop.length, 2);
    assert.equal(settings.hooks.Stop[1].hooks[0].command, 'node "$CLAUDE_PROJECT_DIR/.driftor/driftor.js" --hook');

    assert.equal(read("package.json").scripts["driftor:check"], "node .driftor/driftor.js gate --dry-run");
    assert.equal(read(".driftor/package.json").type, "commonjs");
    for (const f of ["driftor.js", "driftor_test.js", "lib/heal.js", "lib/select.js", "lib/acceptance.js"]) assert.ok(fs.existsSync(path.join(dir, ".driftor", f)));

    // The copied runtime must load on its own: every module it requires was copied too.
    for (const args of [["--list"], ["--hook"], ["gate", "--dry-run"]]) {
      const r = spawnSync(process.execPath, [path.join(dir, ".driftor", "driftor.js"), ...args], {
        cwd: dir,
        input: "{}",
        encoding: "utf8",
        env: { ...process.env, DRIFTOR_HOOK: "", DRIFTOR_ROOT: "" },
      });
      assert.doesNotMatch(`${r.stdout}${r.stderr}`, /Cannot find module|MODULE_NOT_FOUND/, `driftor.js ${args.join(" ")}`);
    }

    // Running it again adds nothing twice.
    assert.equal(silently(() => init(["--dir", dir])), 0);
    assert.equal(read(".claude/settings.json").hooks.Stop.length, 2);
    assert.equal(mergeHook(path.join(dir, ".claude", "settings.json")), "already there");
  });

  it("detects a Next.js repo's default port and basePath", () => {
    setup({ name: "site", dependencies: { next: "14" } }, { "next.config.js": "module.exports = { basePath: '/docs' }", "app/page.tsx": "" });
    assert.equal(silently(() => init(["--dir", dir])), 0);
    const config = read("driftor.config.json");
    assert.deepEqual(config.discover.ports, [3000, 3000]);
    assert.ok(config.objectives[0].objective.includes("{{url}}/docs/"));
  });

  it("refuses a repo that is neither Next.js nor Vite", () => {
    setup({ name: "plain" });
    assert.equal(silently(() => init(["--dir", dir])), 1);
  });
});

describe("acceptance: designed tests with empty variables", () => {
  const { emptyVariables } = require("../../lib/acceptance");
  let dir;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("names the variables a test uses that have no value, and nothing else", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-accept-"));
    fs.mkdirSync(path.join(dir, ".testmuai", "tests"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".testmuai", "variables"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".testmuai", "variables", "assurance.json"),
      JSON.stringify({ key_to_revoke: { value: "" }, app_url: { value: "http://localhost:3002" } })
    );
    fs.writeFileSync(
      path.join(dir, ".testmuai", "tests", "a_test.md"),
      "---\nassurance:\n  id: t-1\n---\n# A\n\n## Step 1\n\nAt {{app_url}}, store the first key name as 'first_key'. Revoke {{key_to_revoke}}, then assert {{first_key}} is listed and {{smart.random_string_8}} and {{global.thing}} are ignored.\n"
    );
    fs.writeFileSync(path.join(dir, ".testmuai", "tests", "b_test.md"), "# B\n\nOpen http://localhost:3002/app and verify the heading.\n");
    assert.deepEqual(emptyVariables(dir, ".testmuai/tests/a_test.md"), ["key_to_revoke"]);
    assert.deepEqual(emptyVariables(dir, ".testmuai/tests/b_test.md"), []);
  });
});
