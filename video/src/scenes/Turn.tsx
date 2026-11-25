import React from "react";
import { interpolate } from "remotion";
import { C, mono } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Words } from "../ui/Words";
import { Click, Fill, Mark, useCue } from "./common";

/** Full-bleed signal red: the mark's dashed sheet slides into place, the wordmark, the line. */
export const Turn: React.FC = () => {
  const { f, rel } = useCue("turn");
  const t = rel("Driftor.");
  const m = interpolate(f, [t - 10, t + 20], [0, 1], { ...clamp, easing: expo });
  const w = interpolate(f, [t, t + 20], [0, 1], { ...clamp, easing: expo });
  return (
    <Fill bg={C.signal} color={C.sheet} grid="rgba(250,249,246,0.12)">
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center", alignItems: "center", gap: 50 }}>
        <div style={{ transform: `scale(${0.6 + 0.4 * m})`, opacity: Math.min(1, m * 2) }}><Mark size={200} p={m} color={C.sheet} fill={C.signal} /></div>
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 210, letterSpacing: "-0.04em", clipPath: `inset(0 ${(1 - w) * 100}% 0 0)` }}>driftor</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 600, textAlign: "center", fontFamily: "inherit" }}>
        <div style={{ fontSize: 86, fontWeight: 500, letterSpacing: "-0.03em" }}><Words text="Done is a claim." at={rel("Done")} every={4} /></div>
        <div style={{ fontSize: 86, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 8 }}><Words text="Make the agent prove it." at={rel("makes") - 2} every={4} accent={{ "prove": C.ink }} serifScale={1.2} /></div>
      </div>
      <Click x={1460} y={738} at={rel("it.") + 2} land={true} size={1.2} />
    </Fill>
  );
};
