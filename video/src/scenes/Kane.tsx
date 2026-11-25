import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, mono, sans, serif } from "../theme";
import { clamp, expo, pop } from "../ui/motion";
import { Count } from "../ui/Count";
import { Fill, In, Kicker, useCue } from "./common";

/**
 * Why Kane CLI, why TestMu AI. Logos are TestMu AI's own files (assets.testmuai.com), shown on a
 * sheet as published; the figures are from testmu.ai, read 2026-11-25.
 */
export const Kane: React.FC = () => {
  const { f, rel } = useCue("kane");
  const steps: [string, string, number][] = [["plain English", "“Click Generate Production API Key. Verify Active keys reads 3 Keys.”", rel("reads")], ["real Chrome", "1920×1080 and 800×1000, a real mouse, real layers", rel("drives")], ["evidence pack", "a screenshot, the DOM and the verdict for every step", rel("seals")]];
  const logo = pop(f, rel("TestMu") - 6);
  const mascot = pop(f, rel("Kane") - 8);
  return (
    <Fill bg={C.night} color="#F3F1EC" grid="rgba(243,241,236,0.05)">
      <div style={{ position: "absolute", left: 120, top: 110 }}><Kicker color="rgba(243,241,236,0.6)">the engine · why kane cli</Kicker></div>
      {/* Kane CLI mascot + name */}
      <div style={{ position: "absolute", left: 120, top: 190, display: "flex", alignItems: "center", gap: 36, opacity: Math.min(1, mascot * 1.4), transform: `scale(${0.85 + 0.15 * mascot})`, transformOrigin: "0 50%" }}>
        <Img src={staticFile("brand/kane-cli-mascot.png")} style={{ height: 230, borderRadius: 10, background: "#48704B" }} />
        <div>
          <div style={{ fontFamily: mono, fontSize: 96, fontWeight: 600, letterSpacing: "-0.03em" }}>Kane CLI</div>
          <div style={{ fontFamily: sans, fontSize: 28, color: "rgba(243,241,236,0.65)", marginTop: 6 }}>End-to-end tests from your terminal</div>
        </div>
      </div>
      {/* TestMu AI logo card */}
      <div style={{ position: "absolute", left: 1150, top: 200, width: 650, padding: "38px 44px", background: C.sheet, borderRadius: 12, opacity: Math.min(1, logo * 1.4), transform: `translateY(${(1 - logo) * 30}px)` }}>
        <Img src={staticFile("brand/testmu-logo-lambdatest.svg")} style={{ width: 560 }} />
      </div>
      {/* plain English -> real Chrome -> evidence pack */}
      <div style={{ position: "absolute", left: 120, top: 520, width: 1680, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>
        {steps.map(([k, sub, at], i) => {
          const p = interpolate(f, [at - 6, at + 12], [0, 1], { ...clamp, easing: expo });
          return (
            <div key={k} style={{ opacity: p, transform: `translateY(${(1 - p) * 26}px)`, border: "1.5px solid rgba(243,241,236,0.22)", borderTop: `5px solid ${i === 2 ? C.passLight : C.signal}`, padding: "24px 26px", borderRadius: 8, background: C.nightRaised }}>
              <div style={{ fontFamily: mono, fontSize: 17, color: "rgba(243,241,236,0.5)" }}>0{i + 1}</div>
              <div style={{ fontFamily: serif, fontSize: 56, marginTop: 4 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 22, color: "rgba(243,241,236,0.65)", marginTop: 8, lineHeight: 1.35 }}>{sub}</div>
            </div>
          );
        })}
      </div>
      {/* the platform behind it */}
      <div style={{ position: "absolute", left: 120, top: 830, display: "flex", gap: 90, alignItems: "baseline" }}>
        <In at={rel("Behind") - 4}><span style={{ fontFamily: mono, fontSize: 22, color: "rgba(243,241,236,0.55)" }}>TestMu AI platform</span></In>
        <In at={rel("three") - 4}><span style={{ fontFamily: serif, fontSize: 110, color: "#F3F1EC" }}><Count to={3} at={rel("three") - 4} dur={20} suffix="M+" /></span> <span style={{ fontFamily: mono, fontSize: 24 }}>users</span></In>
        <In at={rel("fifty") - 4}><span style={{ fontFamily: serif, fontSize: 110, color: C.passLight }}><Count to={50000} at={rel("fifty") - 4} dur={28} suffix="+" /></span> <span style={{ fontFamily: mono, fontSize: 24 }}>real devices</span></In>
      </div>
      <In at={rel("devices.")} style={{ position: "absolute", right: 120, bottom: 40, fontFamily: mono, fontSize: 16, color: "rgba(243,241,236,0.4)" }}>source: testmu.ai, read 2026-11-25</In>
    </Fill>
  );
};
