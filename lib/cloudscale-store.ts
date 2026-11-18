import fs from "fs";
import path from "path";
import { seedState, type CloudScaleState } from "./cloudscale";

/*
 * Persists CloudScale state to .data/cloudscale.json so it survives reloads
 * and server restarts. driftor_test.js calls POST /api/cloudscale/reset before
 * each Kane objective so every run starts from the same seed.
 */

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "cloudscale.json");

// Fallback for read-only filesystems (e.g. serverless deploys).
let memory: CloudScaleState | null = null;

export function load(): CloudScaleState {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as CloudScaleState;
  } catch {
    return memory ?? save(seedState());
  }
}

export function save(state: CloudScaleState): CloudScaleState {
  memory = state;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  } catch {
    /* read-only filesystem: keep in memory */
  }
  return state;
}
