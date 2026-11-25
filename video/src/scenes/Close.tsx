import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, mono, sans } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Words } from "../ui/Words";
import { Click, Fill, In, Mark, useCue } from "./common";

/** The close: the wordmark, the line, and who it is built with. */
export const Close: React.FC = () => {
  const { f, rel } = useCue("close");
  const m = interpolate(f, [rel("Driftor.") - 8, rel("Driftor.") + 20], [0, 1], { ...clamp, easing: expo });
  return (
    <Fill bg={C.night} color="#F3F1EC" grid="rgba(243,241,236,0.05)">
      <div style={{ position: "absolute", left: 0, right: 0, top: 200, display: "flex", justifyContent: "center", alignItems: "center", gap: 40, opacity: m }}>
        <Mark size={140} p={m} color="#F3F1EC" fill={C.night} />
        <span style={{ fontFamily: mono, fontWeight: 500, fontSize: 150, letterSpacing: "-0.04em" }}>driftor</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 430, textAlign: "center", fontSize: 80, fontWeight: 500, letterSpacing: "-0.03em" }}>
        <Words text="Done is a claim. Prove it." at={rel("Done")} every={5} accent={{ "Prove": C.signal, "it.": C.signal }} serifScale={1.2} />
      </div>
      <Click x={1340} y={490} at={rel("it.") + 4} land size={1.1} />
      <In at={rel("Built") - 4} style={{ position: "absolute", left: 0, right: 0, top: 650, display: "flex", justifyContent: "center", alignItems: "center", gap: 70 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}><Img src={staticFile("brand/claude.svg")} style={{ height: 70 }} /><span style={{ fontFamily: sans, fontSize: 38, fontWeight: 500 }}>Claude Code</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}><Img src={staticFile("brand/kane-cli-mascot.png")} style={{ height: 76, borderRadius: 6, background: "#48704B" }} /><span style={{ fontFamily: mono, fontSize: 38, fontWeight: 600 }}>Kane CLI</span></div>
        <div style={{ background: C.sheet, padding: "14px 22px", borderRadius: 8 }}><Img src={staticFile("brand/testmu-logo.svg")} style={{ height: 40 }} /></div>
      </In>
      <In at={rel("hackathon.") - 6} style={{ position: "absolute", left: 0, right: 0, top: 830, textAlign: "center", fontFamily: mono, fontSize: 30, color: "rgba(243,241,236,0.75)" }}>
        #KaneCLIHackathon · kaneclihack.sh · November 2026
      </In>
    </Fill>
  );
};
