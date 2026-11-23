/**
 * Change-based selection (lib/select.js) must never skip an objective that a
 * change can break. The bug zoo is the ground truth: for every regression, the
 * objectives it is expected to fail must be selected when its file changes.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
// CommonJS modules shared with the Node runner.
import select from "../../lib/select.js";
import zoo from "../../lib/regressions.js";

const ROOT = path.resolve(__dirname, "../..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "driftor.config.json"), "utf8"));
const ALL: string[] = config.objectives.map((o: { id: string }) => o.id);
const { selectObjectives, globToRegExp, diffSnapshots } = select as typeof import("../../lib/select.js");

describe("bug zoo → selected objectives", () => {
  const regressions = Object.entries(zoo.REGRESSIONS as Record<string, { file: string; expect?: Record<string, string> }>);

  it("the zoo is not empty", () => {
    expect(regressions.length).toBeGreaterThan(0);
  });

  for (const [name, r] of regressions) {
    it(`${name} (${r.file}) selects every objective it is expected to fail`, () => {
      const { selected } = selectObjectives([r.file], config);
      const mustFail = Object.entries(r.expect ?? {})
        .filter(([, verdict]) => verdict !== "passed")
        .map(([id]) => id);
      // A bug with no expectations recorded must run everything.
      for (const id of mustFail.length ? mustFail : ALL) expect(selected).toContain(id);
    });
  }

  it("the overlay bug (a narrow-only stacking bug would look the same) lives in a shared file and runs everything", () => {
    const overlay = (zoo.REGRESSIONS as Record<string, { file: string }>).overlay;
    const res = selectObjectives([overlay.file], config);
    expect(res.selected).toEqual(ALL);
    expect(res.files[0].effect).toBe("shared");
  });
});

describe("selection rules", () => {
  it("a route only one objective calls runs only that objective", () => {
    const keys = selectObjectives(["app/api/cloudscale/keys/route.ts"], config);
    expect(keys.selected).toEqual(["desktop-occlusion-gate"]);
    expect(keys.skipped.map((s) => s.id)).toEqual(["narrow-viewport-gate"]);
    expect(keys.skipped[0].reason).toContain("app/api/cloudscale/keys/route.ts");

    expect(selectObjectives(["app/api/cloudscale/topup/route.ts"], config).selected).toEqual(["narrow-viewport-gate"]);
  });

  it("shared files run everything", () => {
    for (const file of [
      "app/layout.tsx",
      "app/globals.css",
      "app/app/MaintenanceNotice.tsx",
      "lib/cloudscale.ts",
      "lib/cloudscale-store.ts",
      "tailwind.config.ts",
      "package.json",
      "driftor.config.json",
    ]) {
      expect(selectObjectives([file], config).selected, file).toEqual(ALL);
    }
  });

  it("unknown files run everything (when in doubt, run it)", () => {
    for (const file of ["app/app/NewBanner.tsx", "lib/pricing.ts", "middleware.ts", "driftor_test.js", "some/other/file.ts"]) {
      const res = selectObjectives([file], config);
      expect(res.selected, file).toEqual(ALL);
    }
    expect(selectObjectives(["app/app/NewBanner.tsx"], config).files[0].effect).toBe("unknown");
  });

  it("files that can't change the guarded page run nothing, and say why", () => {
    const res = selectObjectives(["components/BugZoo.tsx", "app/(site)/page.tsx", "README.md", "lib/regressions.js"], config);
    expect(res.selected).toEqual([]);
    expect(res.skipped.map((s) => s.id)).toEqual(ALL);
    expect(res.skipped[0].reason).toContain("ignored");
  });

  it("an ignored file plus a covered file still runs the covered objective", () => {
    expect(selectObjectives(["README.md", "app/api/cloudscale/keys/route.ts"], config).selected).toEqual(["desktop-occlusion-gate"]);
  });

  it("unknown changed set (null) runs everything; empty set runs nothing", () => {
    expect(selectObjectives(null, config).selected).toEqual(ALL);
    const none = selectObjectives([], config);
    expect(none.selected).toEqual([]);
    expect(none.skipped[0].reason).toBe("no files changed");
  });

  it("an objective without `covers` runs on any app change but not on ignored files", () => {
    const cfg = { ...config, objectives: [...config.objectives, { id: "new-objective" }] };
    expect(selectObjectives(["app/api/cloudscale/keys/route.ts"], cfg).selected).toContain("new-objective");
    expect(selectObjectives(["README.md"], cfg).selected).toEqual([]);
  });

  it("shared wins over ignore", () => {
    const cfg = { ...config, select: { shared: ["docs/x.md"], ignore: ["**/*.md"] } };
    expect(selectObjectives(["docs/x.md"], cfg).selected).toEqual(ALL);
  });
});

describe("globs and snapshots", () => {
  it("matches ** across directories and * within one", () => {
    expect(globToRegExp("app/api/cloudscale/topup/**").test("app/api/cloudscale/topup/route.ts")).toBe(true);
    expect(globToRegExp("**/*.md").test("README.md")).toBe(true);
    expect(globToRegExp("**/*.md").test("tests/a_test.md")).toBe(true);
    expect(globToRegExp("lib/cloudscale*").test("lib/cloudscale-store.ts")).toBe(true);
    expect(globToRegExp("lib/*.ts").test("lib/sub/x.ts")).toBe(false);
    expect(globToRegExp("app/(site)/**").test("app/(site)/hud/page.tsx")).toBe(true);
  });

  it("diffs snapshots by added, removed and modified files", () => {
    expect(diffSnapshots({ a: "1", b: "2", c: "3" }, { a: "1", b: "x", d: "4" })).toEqual(["b", "c", "d"]);
    expect(diffSnapshots(undefined as never, { a: "1" })).toEqual(["a"]);
  });
});
