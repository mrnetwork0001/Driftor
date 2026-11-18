import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseNdjson, extractFindings, buildHealPrompt, isFailure } from "@/lib/heal";
import { REGRESSIONS } from "@/lib/regressions";

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

export interface RunSummary {
  id: string;
  startedAt: string;
  passed: boolean;
  trigger: string;
  /** Bug-zoo regressions live during the run (empty = healthy source). */
  regression: string[] | null;
  unit: { command: string; passed: boolean; summary: string | null } | null;
  objectives: Record<string, { verdict: string; viewport?: string; title?: string }>;
}

export interface SessionStep {
  kind: "prompt" | "claude" | "edit" | "hook-block" | "hook-pass" | "hook-note" | "result";
  text: string;
}

export interface AgentSession {
  id: string;
  label: string;
  startedAt: string;
  /** Bug-zoo regression already on the branch when the session started, if any. */
  injected: string | null;
  steps: SessionStep[];
  diff: string;
}

export interface ZooEntry {
  name: string;
  title: string;
  story: string;
  file: string;
  healthy: string;
  regressed: string;
  expect: Record<string, string>;
}

export interface TracesResponse {
  files: TraceFile[];
  findings: Finding[];
  /** Exactly what `driftor:heal` would send to the agent right now, or null if nothing failed. */
  healPrompt: string | null;
  /** The most recent archived gate run that failed (kane-traces/runs/), for the landing page. */
  lastFailingRun: FailingRun | null;
  /** Every archived gate run, newest first. */
  runs: RunSummary[];
  /** The bug-zoo regressions driftor.js can inject. */
  zoo: ZooEntry[];
  /** Real Claude Code sessions run with the Driftor Stop hook armed, newest first. */
  sessions: AgentSession[];
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

function listRuns(): RunSummary[] {
  const runsDir = path.join(TRACE_DIR, "runs");
  if (!fs.existsSync(runsDir)) return [];
  const out: RunSummary[] = [];
  for (const id of fs.readdirSync(runsDir).sort().reverse()) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(runsDir, id, "run.json"), "utf8"));
      out.push({
        id,
        startedAt: m.startedAt,
        passed: !!m.passed,
        trigger: m.trigger ?? "cli",
        regression: Array.isArray(m.regression) ? m.regression : null,
        unit: m.unit ?? null,
        objectives: m.objectives ?? {},
      });
    } catch {
      /* incomplete run */
    }
  }
  return out;
}

/** Turns a `claude -p --output-format stream-json` transcript into a readable timeline. */
function listSessions(): AgentSession[] {
  const dir = path.join(TRACE_DIR, "agent-sessions");
  if (!fs.existsSync(dir)) return [];
  const out: AgentSession[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().reverse()) {
    const id = file.replace(/\.jsonl$/, "");
    const metaPath = path.join(dir, `${id}.meta.json`);
    if (!fs.existsSync(metaPath)) continue; // still running
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const steps: SessionStep[] = [{ kind: "prompt", text: meta.prompt }];
    for (const raw of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      let e: any;
      try {
        e = JSON.parse(raw);
      } catch {
        continue;
      }
      if (e.type === "assistant") {
        for (const c of e.message?.content ?? []) {
          if (c.type === "text" && c.text.trim()) steps.push({ kind: "claude", text: c.text.trim() });
          if (c.type === "tool_use" && (c.name === "Edit" || c.name === "Write"))
            steps.push({ kind: "edit", text: String(c.input?.file_path ?? "").replace(process.cwd() + "/", "") });
        }
      } else if (e.type === "user") {
        const content = Array.isArray(e.message?.content) ? e.message.content : [{ type: "text", text: e.message?.content }];
        for (const c of content) {
          if (c.type === "text" && typeof c.text === "string" && c.text.startsWith("Stop hook feedback:"))
            steps.push({ kind: "hook-block", text: c.text.replace(/^Stop hook feedback:\s*/, "") });
        }
      } else if (e.type === "system" && e.subtype === "informational" && typeof e.content === "string") {
        steps.push({ kind: /verified/.test(e.content) ? "hook-pass" : "hook-note", text: e.content.replace(/^Stop says:\s*/, "") });
      } else if (e.type === "result") {
        steps.push({ kind: "result", text: `${e.subtype} · ${e.num_turns} turns · ${Math.round((e.duration_ms ?? 0) / 1000)}s` });
      }
    }
    const diffPath = path.join(dir, `${id}.diff`);
    out.push({
      id,
      label: meta.label,
      startedAt: meta.startedAt,
      injected: meta.injected && meta.injected !== "none" ? meta.injected : null,
      steps,
      diff: fs.existsSync(diffPath) ? fs.readFileSync(diffPath, "utf8").replace(/^(---|\+\+\+) .*\/(app|components|lib)\//gm, "$1 $2/") : "",
    });
  }
  return out;
}

export async function GET() {
  const { files, findings } = readDir(TRACE_DIR);
  const body: TracesResponse = {
    files,
    findings,
    healPrompt: findings.length ? buildHealPrompt(findings) : null,
    lastFailingRun: lastFailingRun(),
    runs: listRuns(),
    sessions: listSessions(),
    zoo: Object.entries(REGRESSIONS as Record<string, Omit<ZooEntry, "name">>).map(([name, r]) => ({ name, ...r })),
  };
  return NextResponse.json(body);
}
