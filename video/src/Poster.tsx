import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, mono, serif, serifItalic } from "./theme";
import { Grid, Wordmark } from "./scenes/common";

/** Thumbnail: the line, the real red->green result, the mark. */
export const Poster: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper, color: C.ink, overflow: "hidden" }}>
    <Grid />
    <div style={{ position: "absolute", left: 90, top: 70 }}><Wordmark size={64} /></div>
    <div style={{ position: "absolute", left: 90, top: 230, fontFamily: serif, fontSize: 210, lineHeight: 0.92, letterSpacing: "-0.02em" }}>
      <div>“Done”</div>
      <div>is a claim.</div>
      <div style={{ fontFamily: serifItalic, fontStyle: "italic", color: C.signal }}>Prove it.</div>
    </div>
    <div style={{ position: "absolute", left: 1010, top: 300, width: 820, background: C.sheet, border: `4px solid ${C.ink}`, boxShadow: `16px 16px 0 ${C.ink}`, padding: "34px 38px", fontFamily: mono }}>
      <div style={{ fontSize: 30, color: C.graphite }}>Kane CLI · real Chrome</div>
      {["Revoke KEY-001", "Revoke KEY-002"].map((t) => (
        <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, fontSize: 36, whiteSpace: "nowrap" }}>
          <span>{t}</span>
          <span><span style={{ background: C.signal, color: "#fff", padding: "4px 12px" }}>FAIL</span> → <span style={{ background: C.pass, color: "#fff", padding: "4px 12px" }}>PASS</span></span>
        </div>
      ))}
    </div>
    <div style={{ position: "absolute", left: 1010, top: 760, display: "flex", alignItems: "center", gap: 30 }}>
      <Img src={staticFile("brand/claude.svg")} style={{ height: 80 }} />
      <Img src={staticFile("brand/kane-cli-mascot.png")} style={{ height: 90, borderRadius: 6, background: "#48704B" }} />
      <Img src={staticFile("brand/testmu-logo.svg")} style={{ height: 46 }} />
    </div>
  </AbsoluteFill>
);
