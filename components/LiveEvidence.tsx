"use client";

import { useTraces } from "./useTraces";
import type { TraceEvent, TraceFile } from "@/app/api/traces/route";

/*
 * Landing-page panels fed by the real kane-traces/ (via /api/traces).
 * Nothing here is hand-written: if no failing Kane run exists yet, they say so.
 */

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : undefined;
}

function isFail(e: TraceEvent) {
  const s = str(e.status)?.toLowerCase();
  return s === "failed" || s === "fail" || s === "error" || e.type === "error";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-5 font-mono text-[13px] leading-6 text-graphite">{children}</div>;
}

function latestFailing(files: TraceFile[]) {
  return files.filter((f) => f.status === "failed").sort((a, b) => b.modified.localeCompare(a.modified))[0];
}

/** Right-hand side of “Two verdicts”: the most recent failing Kane run, step by step. */
export function ChromeVerdict() {
  const { data } = useTraces(5000);
  const file = data?.lastFailingRun ? latestFailing(data.lastFailingRun.files) : undefined;

  return (
    <div className="p-5 min-w-0">
      <div className="font-mono text-xs text-graphite mb-4 flex justify-between gap-4">
        <span>kane-cli run --agent · chrome</span>
        {file && <span>{file.name} · {ago(file.modified)}</span>}
      </div>
      {!data ? (
        <Empty>reading kane-traces/…</Empty>
      ) : !file ? (
        <Empty>
          No failing Kane run captured yet. Run <span className="text-ink">npm run driftor:inject</span> then{" "}
          <span className="text-ink">npm run driftor:test</span> and the real result appears here.
        </Empty>
      ) : (
        <pre className="font-mono text-[13px] leading-6 whitespace-pre-wrap break-words">
          {file.events
            .filter((e) => !e._raw && ((e.step != null && str(e.status) !== "running") || isFail(e) || e.type === "run_end"))
            .map((e, i) => {
              const fail = isFail(e);
              const label = e.step != null ? "" : `${str(e.type) ?? "event"} ${str(e.status) ?? ""}`.trim();
              const text = str(e.remark) ?? str(e.one_liner) ?? str(e.summary)?.split("\n")[0] ?? str(e.message) ?? "";
              return (
                <span key={i}>
                  <span className={fail ? "text-signal" : "text-pass"}>{fail ? "✗" : "✓"}</span> {label}
                  {text ? `${label ? " — " : ""}${text}` : ""}
                  {"\n"}
                </span>
              );
            })}
          {"\n"}
          <span className="text-signal">gate failed</span>
        </pre>
      )}
    </div>
  );
}

/** “The evidence”: the real failing event and the exact prompt the agent receives. */
export function EvidencePanels() {
  const { data } = useTraces(5000);
  const run = data?.lastFailingRun;
  const finding = run?.findings[0];

  let pretty = finding?.raw ?? "";
  try {
    if (finding && !finding.raw.endsWith("…")) pretty = JSON.stringify(JSON.parse(finding.raw), null, 2);
  } catch {
    /* keep raw */
  }

  return (
    <div className="mt-8 grid xl:grid-cols-2 border border-ink bg-sheet">
      <div className="xl:border-r border-b xl:border-b-0 border-ink min-w-0">
        <div className="px-5 py-3 border-b border-rule font-mono text-xs text-graphite flex justify-between gap-4">
          <span>{finding ? `kane-traces/${finding.trace}` : "kane-traces/"}</span>
          <span>failing event</span>
        </div>
        {finding ? (
          <pre className="p-5 font-mono text-[12.5px] leading-6 overflow-x-auto">{pretty}</pre>
        ) : (
          <Empty>{data ? "No failing event captured yet." : "reading kane-traces/…"}</Empty>
        )}
      </div>
      <div className="min-w-0">
        <div className="px-5 py-3 border-b border-rule font-mono text-xs text-graphite flex justify-between gap-4">
          <span>driftor.js → claude</span>
          <span>heal prompt</span>
        </div>
        {run?.healPrompt ? (
          <pre className="p-5 font-mono text-[12.5px] leading-6 whitespace-pre-wrap break-words">{run.healPrompt}</pre>
        ) : (
          <Empty>{data ? "Built from the failing event once one exists." : "reading kane-traces/…"}</Empty>
        )}
      </div>
    </div>
  );
}
