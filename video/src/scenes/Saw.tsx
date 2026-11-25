import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, mono } from "../theme";
import { clamp, soft } from "../ui/motion";
import { Fill, In, Kicker, useCue } from "./common";

/** A real "what the user saw" card (lib/card.js) from run 2026-11-23 23:22 UTC, toured by camera. */
export const Saw: React.FC = () => {
  const { f, rel } = useCue("saw");
  // Card is 1200x1020; shown 760 wide. Camera: whole -> screenshot -> step + reason -> whole.
  const keys: [number, number, number, number][] = [[0, 1, 600, 510], [rel("What") - 6, 1.55, 600, 420], [rel("step,") - 6, 1.9, 520, 880], [rel("why.") + 30, 1, 600, 510]];
  let z = 1, cx = 600, cy = 510;
  for (let i = 1; i < keys.length; i++) {
    const [a, za, xa, ya] = keys[i - 1], [b, zb, xb, yb] = keys[i];
    if (f >= a) { const t = interpolate(f, [a, b], [0, 1], { ...clamp, easing: soft }); z = za + (zb - za) * t; cx = xa + (xb - xa) * t; cy = ya + (yb - ya) * t; }
  }
  const W = 860, k = W / 1200, H = 1020 * k;
  const p = interpolate(f, [rel("card.") - 10, rel("card.") + 10], [0, 1], { ...clamp, easing: soft });
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 120, top: 120, width: 700 }}>
        <Kicker>what the user saw · lib/card.js</Kicker>
        <div style={{ fontFamily: "inherit", fontSize: 76, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 24 }}>No logs.<br />One card.</div>
        {["The screenshot Kane took", "The step that failed", "Kane’s reason, in words"].map((t, i) => (
          <In key={t} at={[rel("What"), rel("step,"), rel("why.")][i] - 4}><div style={{ marginTop: i ? 16 : 50, fontFamily: mono, fontSize: 26, borderLeft: `5px solid ${C.signal}`, paddingLeft: 18 }}>{t}</div></In>
        ))}
        <In at={rel("why.") + 10}><div style={{ marginTop: 40, fontFamily: mono, fontSize: 18, color: C.graphite }}>made from Kane’s evidence pack, 0 extra credits</div></In>
      </div>
      <div style={{ position: "absolute", left: 930, top: 70 + (1 - p) * 60, width: W, height: H, overflow: "hidden", border: `2px solid ${C.ink}`, boxShadow: `12px 12px 0 ${C.ink}`, opacity: p, background: C.sheet }}>
        <Img src={staticFile("cards/overlay-desktop.png")} style={{ position: "absolute", width: 1200, left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${W / 2 - cx * k * z}px, ${H / 2 - cy * k * z}px) scale(${k * z})` }} />
      </div>
    </Fill>
  );
};
