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

export interface TracesResponse {
  files: TraceFile[];
  findings: Finding[];
  /** Exactly what `driftor:heal` would send to the agent right now, or null if nothing failed. */
  healPrompt: string | null;
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

export async function GET() {
  const { files, findings } = readDir(TRACE_DIR);
  const body: TracesResponse = {
    files,
    findings,
    healPrompt: findings.length ? buildHealPrompt(findings) : null,
  };
  return NextResponse.json(body);
}
