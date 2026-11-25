import React from "react";
import { interpolate } from "remotion";
import { C, mono, sans } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Words } from "../ui/Words";
import { Fill, Head, In, Kicker, useCue } from "./common";

/** Unit tests run in a pretend browser (JSDOM): no layout, no layers, no cache. */
export const Problem: React.FC = () => {
  const { f, rel } = useCue("problem");
  const items: [string, string, string][] = [["No", "layout.", "Nothing is measured, so nothing is ever off-screen."], ["No", "layers.", "Nothing can sit on top of a button."], ["No", "cache.", "Every request is mocked fresh."]];
  const starts = [rel("layout."), rel("layers."), rel("cache.")];
  const thru = interpolate(f, [rel("walk") - 10, rel("through.") + 20], [0, 1], { ...clamp, easing: expo });
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 140, top: 150 }}>
        <Kicker>the blind spot</Kicker>
        <Head size={96} style={{ marginTop: 24, width: 900 }}>
          <Words text="Unit tests run in a pretend browser." at={rel("Coding") + 4} every={4} accent={{ "pretend": C.signal }} />
        </Head>
        <In at={rel("pretend") + 6}><div style={{ marginTop: 26, fontFamily: mono, fontSize: 24, color: C.graphite }}>vitest · environment: jsdom</div></In>
      </div>
      <div style={{ position: "absolute", left: 1120, top: 170, width: 660 }}>
        {items.map(([a, b, sub], i) => {
          const p = interpolate(f, [starts[i] - 8, starts[i] + 10], [0, 1], { ...clamp, easing: expo });
          return (
            <div key={b} style={{ opacity: p, transform: `translateX(${(1 - p) * 40}px)`, borderTop: `2px solid ${C.ink}`, padding: "26px 0 30px" }}>
              <div style={{ fontFamily: sans, fontSize: 64, fontWeight: 500, letterSpacing: "-0.02em" }}>{a} <span style={{ color: C.signal }}>{b}</span></div>
              <div style={{ fontFamily: sans, fontSize: 24, color: C.graphite, marginTop: 6 }}>{sub}</div>
            </div>
          );
        })}
      </div>
      {/* bugs passing straight through the gate */}
      <div style={{ position: "absolute", left: 140, top: 700, width: 1640, height: 150 }}>
        <div style={{ position: "absolute", left: 640, top: 0, width: 8, height: 150, background: C.ink, opacity: thru > 0 ? 1 : 0 }} />
        <div style={{ position: "absolute", left: 600, top: 156, fontFamily: mono, fontSize: 18, color: C.graphite, opacity: thru > 0 ? 1 : 0 }}>unit tests ✓</div>
        {[0, 1, 2, 3, 4].map((i) => {
          const x = interpolate(thru, [0, 1], [-120 - i * 150, 1500 - i * 150]);
          return <div key={i} style={{ position: "absolute", left: x, top: 40 + (i % 2) * 40, width: 34, height: 34, background: C.signal, transform: "rotate(45deg)", opacity: thru > 0 && thru < 1 ? 1 : 0 }} />;
        })}
        <div style={{ position: "absolute", right: 0, top: 44, fontFamily: sans, fontSize: 30, fontWeight: 500, color: C.signal, opacity: interpolate(f, [rel("through.") - 4, rel("through.") + 8], [0, 1], clamp) }}>→ your users</div>
      </div>
    </Fill>
  );
};
