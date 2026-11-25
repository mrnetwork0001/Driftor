import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, mono, sans, serif } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Fill, In, Kicker, Stamp, Term, useCue } from "./common";
import rg from "../../data/redgreen.json";

/**
 * The live session, 2026-11-24: the user's prompt, Driftor's UserPromptSubmit hook, Kane's two
 * designed tests failing, and Kane's own failure and screenshot (evidence run d17dd341).
 */
export const Red: React.FC = () => {
  const { f, rel, line } = useCue("red");
  const tv = line(1);
  const shot = interpolate(f, [tv - 14, tv + 10], [0, 1], { ...clamp, easing: expo });
  const rows = (rg as { rows: { id: string; title: string }[] }).rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  return (
    <Fill bg={C.night} color="#F3F1EC" grid="rgba(243,241,236,0.05)">
      <div style={{ position: "absolute", left: 110, top: 70 }}><Kicker color="rgba(243,241,236,0.6)">live claude code session · 2026-11-24 18:50 UTC</Kicker></div>
      <Term left={110} top={130} width={1000} title="claude · DRIFTOR_HOOK=1" enter={rel("live") - 10} size={21} cps={110}
        lines={[
          [rel("asked"), "> Add a Revoke button to each API key in the CloudScale dashboard.", "#F3F1EC"],
          [rel("asked") + 30, "  Clicking it removes that key, and Active keys goes down by one.", "#F3F1EC"],
          [rel("Before"), "UserPromptSubmit · Driftor: Kane designed 2 tests from the task", C.passLight],
          [rel("ran"), "and ran them on the current app: 2 failed (red, as expected).", C.signal],
        ]} />
      <div style={{ position: "absolute", left: 1170, top: 130, width: 640 }}>
        {rows.map((r, i) => {
          const at = rel("designed") + i * 10;
          const p = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: expo });
          return (
            <div key={r.id} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)`, background: C.nightRaised, border: "1.5px solid rgba(243,241,236,0.2)", padding: "20px 22px", marginBottom: 20, borderRadius: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 16, color: "rgba(243,241,236,0.5)" }}>{r.id} · designed by Kane from the request</div>
              <div style={{ fontFamily: sans, fontSize: 25, marginTop: 8, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ marginTop: 14 }}><Stamp at={rel("them.") + i * 6} text="✗ failed" color={C.signal} size={24} rot={-2} /></div>
            </div>
          );
        })}
      </div>
      {/* Kane's verdict, and the screenshot it took */}
      <div style={{ position: "absolute", left: 110, top: 520 - (1 - shot) * 40, width: 1700, opacity: shot, display: "flex", gap: 40, alignItems: "flex-start" }}>
        <div style={{ width: 860, height: 484, overflow: "hidden", borderRadius: 8, border: `3px solid ${C.signal}` }}>
          <Img src={staticFile("evidence/red-step7.jpg")} style={{ width: 860, height: 484, objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, paddingTop: 10 }}>
          <div style={{ fontFamily: mono, fontSize: 19, color: "rgba(243,241,236,0.5)" }}>kane-cli · step 7 · failure.yaml</div>
          <div style={{ fontFamily: mono, fontSize: 30, color: C.signal, marginTop: 14, lineHeight: 1.35 }}>Checkpoint assertion failed:</div>
          <div style={{ fontFamily: serif, fontSize: 64, marginTop: 6, lineHeight: 1.05 }}>“KEY-001 has a Revoke button”</div>
          <In at={rel("button.", 1) + 4}><div style={{ fontFamily: sans, fontSize: 22, color: "rgba(243,241,236,0.6)", marginTop: 20 }}>Kane’s triage: application_issue / functional_defect · severity major</div></In>
        </div>
      </div>
    </Fill>
  );
};
