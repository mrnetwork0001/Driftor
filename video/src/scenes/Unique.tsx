import React from "react";
import { interpolate } from "remotion";
import { C, mono } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Words } from "../ui/Words";
import { Fill, useCue } from "./common";

/** Full-bleed red: a transcript records; Driftor decides. Four claims, each a feature shown above. */
export const Unique: React.FC = () => {
  const { f, rel } = useCue("unique");
  const items: [string, string][] = [["Tests from the task", "Tests"], ["Red before green", "Red"], ["A guard on the tests", "guard"], ["Real Chrome as the judge", "Chrome"]];
  return (
    <Fill bg={C.signal} color={C.sheet} grid="rgba(250,249,246,0.1)">
      <div style={{ position: "absolute", left: 140, top: 130, width: 1640 }}>
        <div style={{ fontSize: 58, fontWeight: 400, letterSpacing: "-0.02em", color: "rgba(250,249,246,0.75)" }}><Words text="A transcript tells you what an agent did." at={rel("A")} every={3} /></div>
        <div style={{ fontSize: 96, fontWeight: 500, letterSpacing: "-0.035em", marginTop: 16 }}><Words text="Driftor decides whether it gets to stop." at={rel("Driftor")} every={4} accent={{ "stop.": C.ink }} serifScale={1.15} /></div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 560, width: 1640, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        {items.map(([t, w], i) => {
          const at = rel(w) - 4;
          const p = interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: expo });
          return (
            <div key={t} style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)`, display: "flex", alignItems: "center", gap: 22, background: "rgba(250,249,246,0.1)", border: "2px solid rgba(250,249,246,0.5)", padding: "22px 26px" }}>
              <span style={{ width: 46, height: 46, background: C.sheet, color: C.pass, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 700 }}>✓</span>
              <span style={{ fontFamily: mono, fontSize: 34, fontWeight: 500 }}>{t}</span>
            </div>
          );
        })}
      </div>
    </Fill>
  );
};
