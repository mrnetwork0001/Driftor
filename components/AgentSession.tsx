"use client";

import { useState } from "react";
import { useTraces } from "./useTraces";
import type { SessionStep } from "@/app/api/traces/route";

/*
 * Replays a real Claude Code session that ran with the Driftor Stop hook armed,
 * parsed from its stream-json transcript in kane-traces/agent-sessions/.
 */

const ROLE: Record<SessionStep["kind"], { label: string; tone: string }> = {
  prompt: { label: "you", tone: "text-ink" },
  claude: { label: "claude", tone: "text-ink" },
  edit: { label: "edit", tone: "text-graphite" },
  "hook-block": { label: "driftor ✗", tone: "text-signal" },
  "hook-pass": { label: "driftor ✓", tone: "text-pass" },
  "hook-note": { label: "driftor", tone: "text-graphite" },
  result: { label: "end", tone: "text-graphite" },
};

function Step({ step }: { step: SessionStep }) {
  const role = ROLE[step.kind];
  const long = step.kind === "hook-block" || step.text.length > 420;
  const [open, setOpen] = useState(false);
  const shown = long && !open ? step.text.split("\n").slice(0, step.kind === "hook-block" ? 1 : 6).join("\n") : step.text;
  return (
    <li className={`grid grid-cols-[6.5rem_1fr] gap-4 px-5 py-3 border-b border-rule last:border-0 ${step.kind === "hook-block" ? "bg-[#FBEDEA]" : step.kind === "hook-pass" ? "bg-[#EAF2EC]" : ""}`}>
      <span className={`font-mono text-xs pt-0.5 ${role.tone}`}>{role.label}</span>
      <div className="min-w-0">
        <pre className={`whitespace-pre-wrap break-words font-mono text-[12.5px] leading-6 ${step.kind === "edit" ? "text-graphite" : ""}`}>
          {step.kind === "edit" ? `✎ ${step.text}` : shown}
        </pre>
        {long && (
          <button onClick={() => setOpen((o) => !o)} className="mt-1 font-mono text-xs text-graphite underline underline-offset-2 hover:text-ink">
            {open ? "collapse" : step.kind === "hook-block" ? "show the evidence Claude received" : "show all"}
          </button>
        )}
      </div>
    </li>
  );
}

export function AgentSession() {
  const { data } = useTraces(5000);
  const sessions = data?.sessions ?? [];
  const [pick, setPick] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === pick) ?? sessions.find((s) => s.steps.some((x) => x.kind === "hook-block")) ?? sessions[0];

  return (
    <div className="mt-8 border border-ink bg-sheet">
      <div className="px-5 py-3 border-b border-ink font-mono text-xs text-graphite flex flex-wrap items-center justify-between gap-3">
        <span>claude -p · DRIFTOR_HOOK=1 · kane-traces/agent-sessions/</span>
        {sessions.length > 1 && (
          <span className="flex gap-1">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setPick(s.id)}
                className={`px-2 py-0.5 border border-ink ${s.id === session?.id ? "bg-ink text-sheet" : "hover:bg-paper"}`}
              >
                {s.label}
              </button>
            ))}
          </span>
        )}
      </div>
      {!data ? (
        <p className="p-5 font-mono text-[13px] text-graphite">reading kane-traces/…</p>
      ) : !session ? (
        <p className="p-5 font-mono text-[13px] text-graphite">
          No hook-armed session recorded yet. Run <span className="text-ink">npm run agent</span> and ask for a change.
        </p>
      ) : (
        <>
          {session.injected && (
            <p className="px-5 py-2 border-b border-rule font-mono text-xs text-graphite">
              branch state when the session started: <span className="text-signal">{session.injected}</span> bug already
              merged. Claude wasn’t told.
            </p>
          )}
          <ol>
            {session.steps.map((s, i) => (
              <Step key={i} step={s} />
            ))}
          </ol>
          {session.diff && (
            <details className="border-t border-ink">
              <summary className="px-5 py-3 font-mono text-xs text-graphite cursor-pointer hover:text-ink">
                what Claude changed in the session (diff)
              </summary>
              <pre className="px-5 pb-5 font-mono text-[12px] leading-5 overflow-x-auto">
                {session.diff.split("\n").map((l, i) => (
                  <span key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "text-pass" : l.startsWith("-") && !l.startsWith("---") ? "text-signal" : "text-graphite"}>
                    {l}
                    {"\n"}
                  </span>
                ))}
              </pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
