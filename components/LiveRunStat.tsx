"use client";

import { useTraces } from "./useTraces";

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Stat cell fed by the latest traces: objectives passing in the last run. */
export default function LiveRunStat() {
  const { data } = useTraces(5000);
  const files = data?.files ?? [];
  const passing = files.filter((f) => f.status === "passed").length;
  const failing = files.some((f) => f.status === "failed");
  const latest = files.map((f) => f.modified).sort().at(-1);

  return (
    <>
      <div className={`font-serif text-6xl sm:text-7xl leading-none tabular-nums ${failing ? "text-signal" : ""}`}>
        {data ? (files.length ? `${passing}/${files.length}` : "—") : "…"}
      </div>
      <div className="mt-3 text-sm">objectives passing in the last run</div>
      <div className="mt-1 font-mono text-xs text-graphite">
        {!data
          ? "reading kane-traces/"
          : files.length === 0
            ? "no runs yet"
            : `${latest ? ago(latest) : ""} · kane-cli`}
      </div>
    </>
  );
}
