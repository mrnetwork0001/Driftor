import React from "react";
import { interpolate } from "remotion";
import { C, mono, sans, serif } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { Fill, In, Kicker, Stamp, useCue } from "./common";
import rg from "../../data/redgreen.json";

/** Claude's Revoke button, recorded on the live-session build, and the red->green receipt. */
export const Green: React.FC = () => {
  const { f, rel } = useCue("green");
  const R = rg as { rows: { id: string; title: string; before: string; after: string }[]; summary: { verdict: string; proven: number; tests: number }; beforeAt: string; afterAt: string };
  const rows = R.rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  const flip = (i: number) => interpolate(f, [rel("passed.") + i * 8, rel("passed.") + i * 8 + 10], [0, 1], clamp);
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 110, top: 70 }}><Kicker dot={C.pass}>what claude built · recorded on the live-session build</Kicker></div>
      <Browser name="revoke" url="localhost:3004/app · after the change" width={1000} left={110} top={130} enter={0} hold={rel("built") - 10}
        cams={[{ f: 0, z: 1 }, { f: rel("built") + 20, rect: "table", z: 1.45 }, { f: rel("ran"), rect: "table", z: 1.45 }, { f: rel("Both"), z: 1.05 }]} light />
      <div style={{ position: "absolute", left: 1170, top: 130, width: 640 }}>
        {rows.map((r, i) => (
          <div key={r.id} style={{ background: C.sheet, border: `2px solid ${C.ink}`, padding: "18px 22px", marginBottom: 18, boxShadow: `6px 6px 0 ${C.ink}` }}>
            <div style={{ fontFamily: sans, fontSize: 23, lineHeight: 1.3 }}>{r.title}</div>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, fontFamily: mono, fontSize: 22 }}>
              <span style={{ color: "#fff", background: C.signal, padding: "4px 12px" }}>✗ {r.before}</span>
              <span style={{ opacity: flip(i) }}>→</span>
              <span style={{ color: "#fff", background: C.pass, padding: "4px 12px", opacity: flip(i), transform: `scale(${0.8 + 0.2 * flip(i)})` }}>✓ {r.after}</span>
            </div>
          </div>
        ))}
        <In at={rel("receipt") - 6}>
          <div style={{ marginTop: 10, background: C.ink, color: C.sheet, padding: "20px 24px", fontFamily: mono, fontSize: 19, lineHeight: 1.6, borderRadius: 6 }}>
            <div style={{ color: "rgba(250,249,246,0.5)" }}>redgreen.json · driftor-redgreen-receipt</div>
            <div>before {R.beforeAt.slice(11, 19)} UTC · after {R.afterAt.slice(11, 19)} UTC</div>
            <div style={{ color: C.passLight }}>verdict: {R.summary.verdict} · {R.summary.proven} of {R.summary.tests}</div>
          </div>
        </In>
      </div>
      <div style={{ position: "absolute", left: 110, top: 830, display: "flex", alignItems: "center", gap: 24 }}>
        <span style={{ fontFamily: serif, fontSize: 96, color: C.signal }}>Red</span>
        <span style={{ fontFamily: serif, fontSize: 96, opacity: interpolate(f, [rel("to") - 4, rel("to") + 6], [0, 1], clamp) }}>→</span>
        <span style={{ fontFamily: serif, fontSize: 96, color: C.pass, opacity: interpolate(f, [rel("green,") - 4, rel("green,") + 8], [0, 1], { ...clamp, easing: expo }) }}>green</span>
      </div>
      <div style={{ position: "absolute", left: 760, top: 860 }}><Stamp at={rel("prove") } text="proven" color={C.pass} size={44} /></div>
    </Fill>
  );
};
