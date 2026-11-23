import fs from "fs";
import path from "path";
import { seedState, type CloudScaleState } from "./cloudscale";

/*
 * Persists CloudScale state to .data/cloudscale.json so it survives reloads
 * and server restarts. driftor_test.js calls POST /api/cloudscale/reset before
 * each Kane objective so every run starts from the same seed.
 *
 * A run id (`?run=<id>` on the page and the API) gives a run its own state in
 * .data/cloudscale-runs/<id>.json, so objectives running in parallel can't
 * see each other's clicks. Without one, everything uses the shared state.
 */

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "cloudscale.json");
const RUN_DIR = path.join(DIR, "cloudscale-runs");

/** Run ids become file names, so keep them to a safe alphabet. */
export const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `null` = the shared state. */
export type RunId = string | null;

/**
 * Reads `?run=` from a request. Absent or empty → shared state (null).
 * Returns an error string for an id outside RUN_ID.
 */
export function runIdFrom(request: Request): { run: RunId } | { error: string } {
  const raw = new URL(request.url).searchParams.get("run");
  if (raw == null || raw === "") return { run: null };
  if (!RUN_ID.test(raw)) return { error: "run must match [A-Za-z0-9_-]{1,64}" };
  return { run: raw };
}

const fileFor = (run: RunId) => (run ? path.join(RUN_DIR, `${run}.json`) : FILE);

// Fallback for read-only filesystems (e.g. serverless deploys).
const memory = new Map<string, CloudScaleState>();

export function load(run: RunId = null): CloudScaleState {
  try {
    return JSON.parse(fs.readFileSync(fileFor(run), "utf8")) as CloudScaleState;
  } catch {
    return memory.get(run ?? "") ?? save(seedState(), run);
  }
}

export function save(state: CloudScaleState, run: RunId = null): CloudScaleState {
  memory.set(run ?? "", state);
  try {
    const file = fileFor(run);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    /* read-only filesystem: keep in memory */
  }
  return state;
}
