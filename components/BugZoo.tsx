"use client";

import { useTraces } from "./useTraces";
import type { RunSummary } from "@/app/api/traces/route";

/*
 * Bug zoo + run log, both read from kane-traces/runs/*\/run.json via /api/traces.
 * A verdict cell is only filled from a real archived Kane run. A bug with no archived
 * run at all says "not run yet"; an objective missing from an existing run says "not run".
 */

const OBJECTIVES = [
  { id: "desktop-occlusion-gate", label: "desktop", vp: "1920×1080" },
  { id: "narrow-viewport-gate", label: "narrow", vp: "800×1000" },
];

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function NotRunYet() {
  return <span className="text-graphite">not run yet</span>;
}

function Verdict({ v }: { v?: string }) {
  if (!v) return <span className="text-graphite">not run</span>;
  if (v === "passed") return <span className="text-pass">✓ pass</span>;
  if (v === "failed") return <span className="text-signal">✗ fail</span>;
  return <span className="text-graphite">{v}</span>;
}

function Unit({ run }: { run?: RunSummary }) {
  if (!run?.unit) return <span className="text-graphite">not run</span>;
  return run.unit.passed ? (
    <span className="text-pass">✓ {run.unit.summary?.replace(/^Tests\s+/, "") ?? "pass"}</span>
  ) : (
    <span className="text-signal">✗ {run.unit.summary?.replace(/^Tests\s+/, "") ?? "fail"}</span>
  );
}

/**
 * Latest archived CLI run whose live regressions are exactly [name] (or none, for "healthy").
 * Agent-session runs are left out: the agent changed the app in them, so they aren't the zoo's baseline.
 */
function latestFor(runs: RunSummary[], name: string | null) {
  return runs.find(
    (r) =>
      r.trigger === "cli" &&
      r.regression &&
      Object.values(r.objectives).filter((o) => o.verdict === "passed" || o.verdict === "failed").length >= 2 && (name ? r.regression.length === 1 && r.regression[0] === name : r.regression.length === 0),
  );
}

export function BugZoo() {
  const { data } = useTraces(5000);
  const runs = data?.runs ?? [];
  const rows = [
    { name: null as string | null, title: "Healthy source", story: "Nothing injected. The baseline every bug is measured against.", diff: null as null | { file: string; healthy: string; regressed: string } },
    ...(data?.zoo ?? []).map((z) => ({ name: z.name, title: z.title, story: z.story, diff: { file: z.file, healthy: z.healthy, regressed: z.regressed } })),
  ];

  return (
    <div className="mt-8 border-t border-ink">
      <div className="hidden lg:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_9rem_6rem_6rem] gap-6 py-2 border-b border-ink font-mono text-xs text-graphite">
        <span>bug</span>
        <span>the one-line change</span>
        <span>unit tests · jsdom</span>
        <span>kane · desktop</span>
        <span>kane · narrow</span>
      </div>
      {!data && <p className="py-5 font-mono text-sm text-graphite">reading kane-traces/…</p>}
      {data &&
        rows.map((row) => {
          const run = latestFor(runs, row.name);
          return (
            <div
              key={row.name ?? "healthy"}
              className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_9rem_6rem_6rem] gap-x-6 gap-y-2 py-5 border-b border-rule text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <code className="font-mono text-xs text-graphite">{row.name ?? "—"}</code>
                  <span className="font-medium">{row.title}</span>
                </div>
                <p className="mt-1 text-graphite leading-relaxed">{row.story}</p>
                {!run && (
                  <p className="mt-1 font-mono text-xs text-graphite">No archived gate run with this bug injected yet.</p>
                )}
              </div>
              <div className="min-w-0 font-mono text-xs leading-6">
                {row.diff ? (
                  <>
                    <div className="text-graphite">{row.diff.file}</div>
                    <div className="break-all text-pass">- {row.diff.healthy}</div>
                    <div className="break-all text-signal">+ {row.diff.regressed}</div>
                  </>
                ) : (
                  <span className="text-graphite">no change</span>
                )}
              </div>
              <div className="font-mono text-xs">
                <span className="lg:hidden text-graphite">unit · </span>
                {run ? <Unit run={run} /> : <NotRunYet />}
              </div>
              {OBJECTIVES.map((o) => (
                <div key={o.id} className="font-mono text-xs">
                  <span className="lg:hidden text-graphite">{o.label} · </span>
                  {run ? <Verdict v={run.objectives[o.id]?.verdict} /> : <NotRunYet />}
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );
}

const TRIGGER: Record<string, string> = {
  "claude-stop-hook": "Claude Code stop hook",
  "heal-verify": "re-verify after heal",
  watch: "file watcher",
  cli: "driftor:gate",
  "accept-cli": "driftor:accept",
};

/** Every archived gate run, newest first. */
export function RunLog({ limit = 12 }: { limit?: number }) {
  const { data } = useTraces(5000);
  const runs = (data?.runs ?? []).slice(0, limit);
  return (
    <div className="mt-8 border border-ink bg-sheet overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left font-mono text-xs">
        <thead className="text-graphite">
          <tr className="border-b border-ink">
            <th className="px-4 py-2 font-normal">when</th>
            <th className="px-4 py-2 font-normal">triggered by</th>
            <th className="px-4 py-2 font-normal">injected</th>
            <th className="px-4 py-2 font-normal">unit</th>
            <th className="px-4 py-2 font-normal">desktop</th>
            <th className="px-4 py-2 font-normal">narrow</th>
            <th className="px-4 py-2 font-normal" title="tests Kane designed from the agent's task">from task</th>
            <th className="px-4 py-2 font-normal">gate</th>
          </tr>
        </thead>
        <tbody>
          {!data && (
            <tr>
              <td colSpan={8} className="px-4 py-4 text-graphite">
                reading kane-traces/…
              </td>
            </tr>
          )}
          {data && !runs.length && (
            <tr>
              <td colSpan={8} className="px-4 py-4 text-graphite">
                No gate runs archived yet.
              </td>
            </tr>
          )}
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-rule last:border-0">
              <td className="px-4 py-2.5 whitespace-nowrap" title={r.startedAt}>
                {ago(r.startedAt)}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">{TRIGGER[r.trigger] ?? r.trigger}</td>
              <td className="px-4 py-2.5">{r.regression == null ? "—" : r.regression.length ? r.regression.join(", ") : "none"}</td>
              <td className="px-4 py-2.5">
                <Unit run={r} />
              </td>
              {OBJECTIVES.map((o) => (
                <td key={o.id} className="px-4 py-2.5">
                  <Verdict v={r.objectives[o.id]?.verdict} />
                </td>
              ))}
              <td className="px-4 py-2.5 whitespace-nowrap">
                {r.acceptance ? (
                  <span className={r.acceptance.passed ? "text-pass" : "text-signal"}>
                    {r.acceptance.passed ? "✓" : "✗"} {r.acceptance.passedCount}/{r.acceptance.total}
                  </span>
                ) : (
                  <span className="text-graphite">—</span>
                )}
              </td>
              <td className={`px-4 py-2.5 ${r.overallPassed ? "text-pass" : "text-signal"}`}>{r.overallPassed ? "passed" : "failed"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
