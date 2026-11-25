import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, mono, sans, serif } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Count } from "../ui/Count";
import { Click, Fill, In, Sheet, useCue } from "./common";

/**
 * Cold open on a real failure: run 2026-11-23 23:22 UTC (the overlay bug). 27 unit tests passed;
 * Kane CLI's own step-5 screenshot shows the page, and the main button could not be clicked.
 */
export const Open: React.FC = () => {
  const { f, rel } = useCue("open");
  const tBut = rel("But");
  const tClick = rel("clicked.");
  const shot = interpolate(f, [tBut - 6, tBut + 18], [0, 1], { ...clamp, easing: expo });
  const top = interpolate(shot, [0, 1], [0, -250]);
  // The card's screenshot region (card px 24..1176 x 180..828 of 1200x1020), shown at 1.38x.
  const k = 1.38;
  return (
    <Fill bg={C.night} color="#F3F1EC" grid="rgba(243,241,236,0.06)">
      <div style={{ position: "absolute", left: 0, right: 0, top: 300 + top, textAlign: "center", opacity: 1 - shot * 0.85 }}>
        <div style={{ fontFamily: serif, fontSize: 330, lineHeight: 0.9, color: C.passLight, letterSpacing: "-0.02em" }}>
          <Count to={27} at={rel("Twenty-seven") - 4} dur={30} />
        </div>
        <In at={rel("unit")} y={14}><div style={{ fontFamily: mono, fontSize: 40, letterSpacing: "0.06em", color: "#F3F1EC" }}>unit tests passed <span style={{ color: C.passLight }}>✓</span></div></In>
        <In at={rel("said")} y={14}><div style={{ marginTop: 28, fontFamily: mono, fontSize: 30, color: "rgba(243,241,236,0.6)" }}>agent: <span style={{ color: "#F3F1EC" }}>“Done.”</span></div></In>
      </div>
      <div style={{ position: "absolute", left: (1920 - 1152 * k) / 2 + 0, top: 1080 - shot * 930, width: 1152 * k, height: 648 * k, overflow: "hidden", borderRadius: 10, border: "2px solid rgba(243,241,236,0.25)", boxShadow: "0 50px 120px rgba(0,0,0,0.6)", opacity: shot }}>
        <Img src={staticFile("cards/overlay-desktop.png")} style={{ position: "absolute", width: 1200 * k, left: -24 * k, top: -180 * k }} />
        <Sheet left={0} top={0} w={1152 * k} h={648 * k} p={interpolate(f, [rel("main") - 6, rel("main") + 14], [0, 1], { ...clamp, easing: expo })} label="div.fixed.inset-0 · z-50 · transparent" />
        <Click x={(765 - 24) * k} y={(369 - 180) * k} at={tClick} land={false} size={1.2} />
      </div>
      <In at={tBut + 10} y={10} style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center" }}>
        <span style={{ fontFamily: mono, fontSize: 21, letterSpacing: "0.1em", color: C.signal }}>KANE CLI IN REAL CHROME · STEP 5 · FAILED</span>
      </In>
      <In at={tClick + 6} y={10} style={{ position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", fontFamily: sans, fontSize: 19, color: "rgba(243,241,236,0.55)" }}>
        Kane CLI’s own screenshot · Driftor run 2026-11-23 23:22 UTC · injected bug: overlay
      </In>
    </Fill>
  );
};
