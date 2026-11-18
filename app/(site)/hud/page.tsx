"use client";

import { useState } from "react";
import { useTraces } from "@/components/useTraces";
import type { TraceEvent, TraceFile } from "@/app/api/traces/route";

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
}

function EventRow({ e, i }: { e: TraceEvent; i: number }) {
  if (e._raw) {
    return (
      <tr className="border-b border-rule align-top">
        <td className="py-2 pr-4 text-graphite">{i + 1}</td>
        <td className="py-2 pr-4 text-graphite">raw</td>
        <td className="py-2 break-all text-graphite">{e._raw}</td>
      </tr>
    );
  }

  const status = str(e.status);
  const ok = status === "passed" || status === "done";
  const failed = status === "failed" || e.type === "error";
  const label = str(e.step) ? `step ${e.step}` : str(e.type) ?? "event";
  const text = str(e.remark) ?? str(e.one_liner) ?? str(e.summary) ?? str(e.message) ?? str(e.reason);
  const verdict = (e.verdict ?? null) as Record<string, unknown> | null;

  return (
    <tr className={`border-b border-rule align-top ${failed ? "bg-[#FBEDEA]" : ""}`}>
      <td className="py-2 pr-4 text-graphite">{i + 1}</td>
      <td className={`py-2 pr-4 whitespace-nowrap ${failed ? "text-signal" : ok ? "text-pass" : "text-graphite"}`}>
        {failed ? "✗" : ok ? "✓" : "·"} {label}
      </td>
      <td className="py-2 min-w-[14rem]">
        {text && <div className={`break-words ${failed ? "text-ink" : ""}`}>{text}</div>}
        {!text && !verdict && <div className="text-graphite break-all">{JSON.stringify(e)}</div>}
        {verdict && (
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-graphite">
            {Object.entries(verdict)
              .filter(([, v]) => typeof v !== "object")
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k.replace(/_/g, " ")}</dt>
                  <dd className="text-ink">{String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
        {str(e.reason_code) && <div className="mt-1 text-signal">{str(e.reason_code)}</div>}
      </td>
    </tr>
  );
}

function TraceCard({ f }: { f: TraceFile }) {
  const [raw, setRaw] = useState(false);
  const tone = f.status === "failed" ? "text-signal" : f.status === "passed" ? "text-pass" : "text-graphite";

  return (
    <article className="border border-ink bg-sheet">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 border-b border-ink font-mono text-xs">
        <span className="text-sm text-ink">{f.name}</span>
        <span className={`uppercase tracking-wider ${tone}`}>{f.status}</span>
        <span className="text-graphite">{ago(f.modified)}</span>
        <button onClick={() => setRaw(!raw)} className="ml-auto text-graphite hover:text-ink underline underline-offset-2">
          {raw ? "table" : "raw ndjson"}
        </button>
      </header>
      {raw ? (
        <pre className="p-5 font-mono text-xs leading-5 overflow-x-auto">
          {f.events.map((e) => (e._raw ? e._raw : JSON.stringify(e))).join("\n")}
        </pre>
      ) : (
        <div className="px-5 py-2 overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <tbody>
              {f.events.map((e, i) => (
                <EventRow key={i} e={e} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function Traces() {
  const { data, error } = useTraces(2000);
  const failed = data?.files.filter((f) => f.status === "failed").length ?? 0;
  const latest = data?.files.map((f) => f.modified).sort().at(-1);

  return (
    <div>
      <div className="border-b border-ink">
        <div className="px-5 sm:px-8 lg:px-12 pt-12 lg:pt-16 pb-10">
          <p className="font-mono text-xs text-graphite">kane-traces/ · refreshes every 2s</p>
          <h1 className="mt-3 font-serif text-5xl sm:text-6xl leading-none">Traces.</h1>
          <p className="mt-5 max-w-xl text-graphite leading-relaxed">
            The NDJSON that Kane CLI wrote on the last <code className="font-mono text-sm text-ink">driftor:test</code>{" "}
            run, one file per objective. This is the same evidence <code className="font-mono text-sm text-ink">driftor:heal</code>{" "}
            sends to the agent.
          </p>
        </div>
        <dl className="grid sm:grid-cols-3 border-t border-ink bg-sheet font-mono text-xs">
          <div className="px-5 sm:px-8 lg:px-12 py-4 border-b sm:border-b-0 sm:border-r border-rule">
            <dt className="text-graphite">objectives</dt>
            <dd className="mt-1">{data ? `${data.files.length} traced` : "…"}</dd>
          </div>
          <div className="px-5 sm:px-6 py-4 border-b sm:border-b-0 sm:border-r border-rule">
            <dt className="text-graphite">gate</dt>
            <dd className={`mt-1 ${failed ? "text-signal" : data?.files.length ? "text-pass" : ""}`}>
              {!data ? "…" : !data.files.length ? "no runs yet" : failed ? `failing · ${failed} objective${failed === 1 ? "" : "s"}` : "passing"}
            </dd>
          </div>
          <div className="px-5 sm:px-6 py-4">
            <dt className="text-graphite">last run</dt>
            <dd className="mt-1">{latest ? ago(latest) : "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="px-5 sm:px-8 lg:px-12 py-10 space-y-6">
        {error && <p className="font-mono text-sm text-signal">Couldn’t reach /api/traces.</p>}


        {data && data.files.length === 0 && (
          <div className="border border-dashed border-ink p-8 text-graphite">
            No traces yet. Start the app, then run <code className="font-mono text-ink">npm run driftor:test</code>.
          </div>
        )}

        {data?.files.map((f) => <TraceCard key={f.name} f={f} />)}

        {data?.healPrompt && (
          <article className="border border-signal bg-sheet">
            <header className="flex flex-wrap items-baseline gap-x-4 px-5 py-3 border-b border-signal font-mono text-xs">
              <span className="text-sm text-ink">heal prompt</span>
              <span className="text-graphite">what <code>npm run driftor:heal</code> sends to the agent, built from the failures above</span>
            </header>
            <pre className="p-5 font-mono text-xs leading-5 whitespace-pre-wrap break-words">{data.healPrompt}</pre>
          </article>
        )}
      </div>
    </div>
  );
}
