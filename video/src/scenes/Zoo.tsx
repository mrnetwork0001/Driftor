import React from "react";
import { interpolate } from "remotion";
import { C, mono, sans, serif } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Fill, Head, In, Kicker, Stamp, useCue } from "./common";

/** The bug zoo (lib/regressions.js) and its archived runs of 2026-11-23: unit 0 of 5, Kane 5 of 5. */
const BUGS = [
  ["overlay", "Transparent full-screen wrapper takes the clicks", "23:22"],
  ["pointer-events", "Loading-state class left on the button", "23:24"],
  ["opacity", "Closed mobile menu faded out, not removed", "23:27"],
  ["breakpoint", "Top-up link hidden below the lg breakpoint", "23:10"],
  ["stale-cache", "Workspace re-read served from the browser cache", "23:13"],
];
export const Zoo: React.FC = () => {
  const { f, rel } = useCue("zoo");
  const tUnit = rel("Unit");
  const tKane = rel("Kane");
  const hl: Record<number, number> = { 0: rel("layer"), 3: rel("link"), 4: rel("stale") };
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 120, top: 80 }}>
        <Kicker>bug zoo · lib/regressions.js</Kicker>
        <Head size={78} style={{ marginTop: 18 }}>Five one-line bugs. <span style={{ color: C.graphite }}>One commit each.</span></Head>
      </div>
      <div style={{ position: "absolute", left: 120, top: 290, width: 1680, fontFamily: sans }}>
        <div style={{ display: "grid", gridTemplateColumns: "250px 1fr 260px 260px", fontFamily: mono, fontSize: 18, letterSpacing: "0.08em", color: C.graphite, textTransform: "uppercase", padding: "0 0 12px", borderBottom: `2px solid ${C.ink}` }}>
          <span>bug</span><span>the one-line change</span><span>unit tests · jsdom</span><span>kane · real chrome</span>
        </div>
        {BUGS.map(([id, title, at], i) => {
          const p = interpolate(f, [rel("Five") + i * 8, rel("Five") + i * 8 + 16], [0, 1], { ...clamp, easing: expo });
          const h = hl[i] != null ? interpolate(f, [hl[i] - 6, hl[i] + 4, hl[i] + 60, hl[i] + 70], [0, 1, 1, 0], clamp) : 0;
          const u = interpolate(f, [tUnit + i * 5, tUnit + i * 5 + 8], [0, 1], clamp);
          return (
            <div key={id} style={{ display: "grid", gridTemplateColumns: "250px 1fr 260px 260px", alignItems: "center", padding: "20px 0", borderBottom: `1px solid ${C.rule}`, opacity: p, transform: `translateY(${(1 - p) * 20}px)`, background: `rgba(217,65,47,${0.08 * h})` }}>
              <span style={{ fontFamily: mono, fontSize: 22, color: C.signal }}>{id}</span>
              <span style={{ fontSize: 28, fontWeight: 500 }}>{title}</span>
              <span style={{ fontFamily: mono, fontSize: 22, color: C.pass, opacity: u }}>✓ 27 passed</span>
              <span style={{ opacity: interpolate(f, [tKane + i * 5, tKane + i * 5 + 8], [0, 1], clamp) }}>
                <span style={{ fontFamily: mono, fontSize: 22, color: "#fff", background: C.signal, padding: "4px 12px" }}>✗ caught</span>
                <span style={{ fontFamily: mono, fontSize: 15, color: C.graphite, marginLeft: 10 }}>{at} UTC</span>
              </span>
            </div>
          );
        })}
      </div>
      <In at={rel("zero") - 4} style={{ position: "absolute", left: 120, top: 860 }}>
        <span style={{ fontFamily: serif, fontSize: 130, color: C.signal, lineHeight: 1 }}>0/5</span>
        <span style={{ fontFamily: mono, fontSize: 26, marginLeft: 18 }}>caught by unit tests</span>
      </In>
      <In at={rel("all") - 4} style={{ position: "absolute", left: 900, top: 860 }}>
        <span style={{ fontFamily: serif, fontSize: 130, color: C.pass, lineHeight: 1 }}>5/5</span>
        <span style={{ fontFamily: mono, fontSize: 26, marginLeft: 18 }}>caught by Kane CLI</span>
      </In>
      <div style={{ position: "absolute", right: 120, top: 880 }}><Stamp at={rel("five.", 1) + 4} text="real chrome wins" color={C.pass} size={34} /></div>
    </Fill>
  );
};
