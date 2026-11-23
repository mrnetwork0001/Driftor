// @vitest-environment node
/**
 * Per-run state isolation: `?run=<id>` gives a Kane objective its own
 * CloudScale workspace, so two objectives running at once can't see each
 * other's clicks. Without a run id the shared state is used, as before.
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { GET } from "@/app/api/cloudscale/route";
import { POST as generate } from "@/app/api/cloudscale/keys/route";
import { POST as reset } from "@/app/api/cloudscale/reset/route";
import { POST as topup } from "@/app/api/cloudscale/topup/route";
import type { CloudScaleState } from "@/lib/cloudscale";

const stamp = `vitest-${process.pid}-${Date.now()}`;
const A = `${stamp}-a`;
const B = `${stamp}-b`;
const req = (route: string, run?: string) =>
  new Request(`http://localhost/api/cloudscale${route}${run !== undefined ? `?run=${encodeURIComponent(run)}` : ""}`, {
    method: route ? "POST" : "GET",
  });
const json = async (res: Response) => (await res.json()) as CloudScaleState & { state?: CloudScaleState };

afterAll(() => {
  for (const id of [A, B]) fs.rmSync(path.join(process.cwd(), ".data", "cloudscale-runs", `${id}.json`), { force: true });
});

describe("run-scoped CloudScale state", () => {
  it("two runs don't see each other's actions", async () => {
    await reset(req("/reset", A));
    await reset(req("/reset", B));

    const keyed = await json(await generate(req("/keys", A)));
    expect(keyed.state?.status).toBe("KEY_GENERATED_HEALTHY");
    expect(keyed.state?.keys).toHaveLength(3);

    const topped = await json(await topup(req("/topup", B)));
    expect(topped.status).toBe("QUOTA_TOPUP_SUCCESS");
    expect(topped.keys).toHaveLength(2);
    expect(topped.quotaCents).toBe(475_000);

    const a = await json(await GET(req("", A)));
    expect(a.status).toBe("KEY_GENERATED_HEALTHY");
    expect(a.quotaCents).toBe(450_000);
    const b = await json(await GET(req("", B)));
    expect(b.status).toBe("QUOTA_TOPUP_SUCCESS");
    expect(b.keys).toHaveLength(2);
  });

  it("reset with a run id resets only that run", async () => {
    await generate(req("/keys", A));
    await reset(req("/reset", B));
    expect((await json(await GET(req("", A)))).keys.length).toBeGreaterThan(2);
    expect((await json(await GET(req("", B)))).status).toBe("SYSTEM_READY");
  });

  it("an empty run id means the shared state", async () => {
    const shared = await json(await GET(req("")));
    const empty = await json(await GET(req("", "")));
    expect(empty).toEqual(shared);
  });

  it("rejects run ids that aren't safe file names", async () => {
    for (const bad of ["../etc", "a/b", "x".repeat(65), "a b"]) {
      expect((await GET(req("", bad))).status, bad).toBe(400);
      expect((await reset(req("/reset", bad))).status, bad).toBe(400);
    }
  });
});
