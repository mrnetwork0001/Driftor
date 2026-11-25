import React from "react";
import { interpolate } from "remotion";
import { C, mono, sans } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Fill, Head, Kicker, Stamp, useCue } from "./common";
import d1 from "../../data/delete-the-button.json";
import d2 from "../../data/hide-the-button.json";
import d3 from "../../data/edit-the-test.json";
import d4 from "../../data/edit-the-objective.json";
import fix from "../../data/real-fix.json";

type G = { title: string; verdict: string; violations: { file?: string; rule?: string }[] };
/** The guard replay (kane-traces/guard/demo/): four real cheats blocked, the real fix allowed. */
export const Guard: React.FC = () => {
  const { f, rel } = useCue("guard");
  const cheats = [d1, d2, d3, d4] as unknown as G[];
  const tB = rel("blocked");
  return (
    <Fill bg={C.night} color="#F3F1EC" grid="rgba(243,241,236,0.05)">
      <div style={{ position: "absolute", left: 120, top: 80 }}>
        <Kicker color="rgba(243,241,236,0.6)">the guard · lib/guard.js · replayed in kane-traces/guard/demo</Kicker>
        <Head size={84} style={{ marginTop: 18, opacity: interpolate(f, [rel("guard") - 6, rel("guard") + 10], [0, 1], clamp) }}>Fix the app, not the test.</Head>
      </div>
      <div style={{ position: "absolute", left: 120, top: 300, width: 1680, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {cheats.map((c, i) => {
          const at = rel("cheat,") + i * 10;
          const p = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: expo });
          const v = c.violations[0] || {};
          return (
            <div key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)`, background: C.nightRaised, border: "1.5px solid rgba(243,241,236,0.2)", padding: "22px 26px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
              <div>
                <div style={{ fontFamily: sans, fontSize: 27, lineHeight: 1.25 }}>{c.title.replace(/^Cheat: /, "")}</div>
                <div style={{ fontFamily: mono, fontSize: 17, color: "rgba(243,241,236,0.5)", marginTop: 8 }}>{v.rule} · {v.file}</div>
              </div>
              <Stamp at={tB + i * 7} text="blocked" color={C.signal} size={26} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 120, top: 700, width: 1680, opacity: interpolate(f, [rel("real") - 6, rel("real") + 10], [0, 1], { ...clamp, easing: expo }), background: "rgba(127,209,156,0.08)", border: `2px solid ${C.passLight}`, padding: "24px 28px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: sans, fontSize: 30 }}>{(fix as unknown as G).title}</div>
        <Stamp at={rel("through.")} text="allowed" color={C.passLight} size={30} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 860, fontFamily: mono, fontSize: 20, color: "rgba(243,241,236,0.5)", opacity: interpolate(f, [rel("protected") - 4, rel("protected") + 8], [0, 1], clamp) }}>
        protected: tests/** · *.test.* · driftor.config.json · .claude/settings*.json · Driftor itself
      </div>
    </Fill>
  );
};
