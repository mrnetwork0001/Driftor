import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
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

/*
 * On Vercel (VERCEL=1) each request can reach a different serverless instance, and none of
 * them can write .data/, so memory alone loses changes between requests: a key generated on
 * one instance was gone after a top-up served by another. There, each visitor's workspace
 * lives in an httpOnly cookie instead, so every instance sees the same state and visitors
 * don't share one. Local dev, tests and Kane runs keep the file store above.
 */
const COOKIE_MODE = process.env.VERCEL === "1";
const COOKIE_MAX = 3800; // bytes, under the 4 KB per-cookie limit
const cookieName = (run: RunId) => (run ? `cs_run_${run}` : "cs_state");

function fromCookie(run: RunId): CloudScaleState | null {
  try {
    const v = cookies().get(cookieName(run))?.value;
    return v ? (JSON.parse(Buffer.from(v, "base64url").toString("utf8")) as CloudScaleState) : null;
  } catch {
    return null;
  }
}

function toCookie(state: CloudScaleState, run: RunId) {
  // Keep the newest entries that fit: the audit log first gives way, then the oldest keys.
  let s: CloudScaleState = { ...state, activity: (state.activity ?? []).slice(0, 8) };
  const enc = (x: CloudScaleState) => Buffer.from(JSON.stringify(x), "utf8").toString("base64url");
  let v = enc(s);
  while (v.length > COOKIE_MAX && s.activity.length > 1) v = enc((s = { ...s, activity: s.activity.slice(0, -1) }));
  while (v.length > COOKIE_MAX && s.keys.length > 1) v = enc((s = { ...s, keys: s.keys.slice(0, -1) }));
  cookies().set(cookieName(run), v, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 7 });
}

export function load(run: RunId = null): CloudScaleState {
  if (COOKIE_MODE) return fromCookie(run) ?? seedState();
  try {
    return JSON.parse(fs.readFileSync(fileFor(run), "utf8")) as CloudScaleState;
  } catch {
    return memory.get(run ?? "") ?? save(seedState(), run);
  }
}

export function save(state: CloudScaleState, run: RunId = null): CloudScaleState {
  if (COOKIE_MODE) {
    toCookie(state, run);
    return state;
  }
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
