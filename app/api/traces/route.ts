import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseNdjson, extractFindings, buildHealPrompt, isFailure } from "@/lib/heal";

export const dynamic = "force-dynamic";

const TRACE_DIR = path.join(process.cwd(), "kane-traces");

export type TraceEvent = Record<string, unknown> & { _raw?: string };

export interface Finding {
  trace: string;
  step: number | string | null;
  summary?: string;
  rootCause?: string;
  suggestion?: string;
  code?: string;
  raw: string;
}

export interface TraceFile {
  name: string;
  modified: string;
  status: "passed" | "failed" | "unknown";
  events: TraceEvent[];
}

export interface FailingRun {
  startedAt: string;
  files: TraceFile[];
  findings: Finding[];
  healPrompt: string;
}

export interface TracesResponse {
  files: TraceFile[];
  findings: Finding[];
  /** Exactly what `driftor:heal` would send to the agent right now, or null if nothing failed. */
  healPrompt: string | null;
  /** The most recent archived gate run that failed (kane-traces/runs/), for the landing page. */
  lastFailingRun: FailingRun | null;
}

function parseForDisplay(text: string): TraceEvent[] {
  const out: TraceEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      out.push(v && typeof v === "object" ? v : { _raw: line });
    } catch {
      out.push({ _raw: line });
    }
  }
  return out;
}

function readDir(dir: string) {
  const files: TraceFile[] = [];
  const findings: Finding[] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      // latest.ndjson aggregates the per-objective files; skip it.
      if (!name.endsWith(".ndjson") || name === "latest.ndjson") continue;
      const full = path.join(dir, name);
      const text = fs.readFileSync(full, "utf8");
      const events = parseNdjson(text);
      const failed = events.some(isFailure);
      const ended = events.some((e: Record<string, unknown>) => e.type === "run_end");
      files.push({
        name,
        modified: fs.statSync(full).mtime.toISOString(),
        status: failed ? "failed" : ended ? "passed" : "unknown",
        events: parseForDisplay(text),
      });
      findings.push(...extractFindings(name, events));
    }
  }

  return { files, findings };
}

function lastFailingRun(): FailingRun | null {
  const runsDir = path.join(TRACE_DIR, "runs");
  if (!fs.existsSync(runsDir)) return null;
  for (const id of fs.readdirSync(runsDir).sort().reverse()) {
    const metaPath = path.join(runsDir, id, "run.json");
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (meta.passed) continue;
    const { files, findings } = readDir(path.join(runsDir, id));
    if (!findings.length) continue;
    return { startedAt: meta.startedAt, files, findings, healPrompt: buildHealPrompt(findings) };
  }
  return null;
}

export async function GET() {
  const { files, findings } = readDir(TRACE_DIR);
  const body: TracesResponse = {
    files,
    findings,
    healPrompt: findings.length ? buildHealPrompt(findings) : null,
    lastFailingRun: lastFailingRun(),
  };
  return NextResponse.json(body);
}
