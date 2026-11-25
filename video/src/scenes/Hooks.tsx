import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, mono, sans } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { Fill, In, Kicker, Mark, useCue } from "./common";

/** The loop: Claude Code's Stop hook -> Kane in real Chrome on the flows the change touches -> back to fix. */
export const Hooks: React.FC = () => {
  const { f, rel } = useCue("hooks");
  const node = (at: number) => interpolate(f, [at - 6, at + 12], [0, 1], { ...clamp, easing: expo });
  const back = interpolate(f, [rel("If") - 4, rel("back") + 10], [0, 1], { ...clamp, easing: expo });
  const N: [string, string, number, React.ReactNode][] = [
    ["Claude Code", "the agent says “done”", rel("Claude"), <Img key="c" src={staticFile("brand/claude.svg")} style={{ width: 54 }} />],
    ["Stop hook", "Driftor picks the flows the diff can touch", rel("When"), <Mark key="m" size={50} />],
    ["Kane CLI", "clicks them in real Chrome", rel("Kane"), <span key="k" style={{ fontFamily: mono, fontSize: 30, fontWeight: 600 }}>{">_"}</span>],
  ];
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 120, top: 90 }}><Kicker>the loop · .claude/settings.json</Kicker></div>
      <div style={{ position: "absolute", left: 120, top: 160, width: 600 }}>
        {N.map(([t, sub, at, icon], i) => {
          const p = node(at);
          return (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 34, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
              <div style={{ width: 86, height: 86, border: `2px solid ${C.ink}`, background: C.sheet, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `6px 6px 0 ${C.ink}` }}>{icon}</div>
              <div>
                <div style={{ fontFamily: sans, fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>{t}</div>
                <div style={{ fontFamily: sans, fontSize: 23, color: C.graphite }}>{sub}</div>
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 14, marginTop: 10, opacity: node(rel("wide")) }}>
          {["1920×1080 · wide", "800×1000 · narrow"].map((v, i) => <span key={v} style={{ fontFamily: mono, fontSize: 21, padding: "8px 14px", border: `2px solid ${C.ink}`, background: i ? C.sheet : C.ink, color: i ? C.ink : C.sheet, opacity: interpolate(f, [rel(i ? "narrow" : "wide") - 4, rel(i ? "narrow" : "wide") + 6], [0, 1], clamp) }}>{v}</span>)}
        </div>
        <div style={{ marginTop: 40, opacity: back, transform: `translateY(${(1 - back) * 20}px)`, border: `2px solid ${C.signal}`, padding: "18px 22px", background: "rgba(217,65,47,0.06)" }}>
          <div style={{ fontFamily: mono, fontSize: 20, color: C.signal }}>{"{ \"decision\": \"block\" }"}</div>
          <div style={{ fontFamily: sans, fontSize: 25, marginTop: 6 }}>A failed flow sends the agent back, with what Kane saw.</div>
        </div>
      </div>
      <Browser name="app" url="trydriftor.vercel.app/app · CloudScale, the app under test" width={1060} left={760} top={170} enter={rel("Kane") - 30} startFrom={95} hold={rel("Kane") - 30}
        cams={[{ f: rel("Kane") - 10, z: 1 }, { f: rel("Kane") + 15, rect: "keyBtn", z: 1.6 }, { f: rel("Kane") + 85, rect: "keyBtn", z: 1.6 }, { f: rel("Kane") + 120, rect: "quota", z: 1.6 }, { f: rel("If") + 40, z: 1 }]} light />
      <In at={rel("Kane") + 10} style={{ position: "absolute", left: 760, top: 830, fontFamily: mono, fontSize: 18, color: C.graphite }}>The two flows Driftor guards: generate a key · top up the quota</In>
    </Fill>
  );
};
