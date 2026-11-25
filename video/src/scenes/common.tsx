import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, mono, sans, serif, serifItalic } from "../theme";
import { clamp, expo, pop } from "../ui/motion";

/** Scene-local frame and word cues: rel("word", n) is when the nth "word" is spoken, scene-local. */
export function useCue(id: string) {
  const s = scene(id);
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt(id, w, n) - s.from;
  const line = (i: number) => s.lines[i].startFrame - s.from;
  return { s, f, rel, line, dur: s.durationInFrames };
}

/** The drafting grid the site sits on, faint. */
export const Grid: React.FC<{ color?: string; size?: number; opacity?: number }> = ({ color = C.rule, size = 48, opacity = 0.7 }) => (
  <AbsoluteFill style={{ opacity, backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`, backgroundSize: `${size}px ${size}px`, backgroundPosition: "-1px -1px" }} />
);

export const Fill: React.FC<{ bg: string; children: React.ReactNode; color?: string; grid?: string | false }> = ({ bg, children, color = C.ink, grid }) => (
  <AbsoluteFill style={{ background: bg, fontFamily: sans, color, overflow: "hidden" }}>
    {grid !== false ? <Grid color={grid ?? C.rule} opacity={grid ? 0.5 : 0.7} /> : null}
    {children}
  </AbsoluteFill>
);

/** Small mono kicker with a square bullet. */
export const Kicker: React.FC<{ children: React.ReactNode; color?: string; dot?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = C.graphite, dot = C.signal, size = 17, style }) => (
  <div style={{ fontFamily: mono, fontSize: size, letterSpacing: "0.14em", textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 12, ...style }}>
    <span style={{ width: 9, height: 9, background: dot }} />{children}
  </div>
);

/** Fade, rise and un-blur for any block. */
export const In: React.FC<{ at: number; dur?: number; y?: number; x?: number; children: React.ReactNode; style?: React.CSSProperties; out?: number }> = ({ at, dur = 16, y = 26, x = 0, children, style, out }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: expo });
  const o = out != null ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1;
  return <div style={{ opacity: p * o, transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px)`, filter: p < 1 ? `blur(${(1 - p) * 7}px)` : undefined, ...style }}>{children}</div>;
};

/** A drafting-sheet card with a hard offset shadow that pops in at `at`. */
export const Card: React.FC<{ at: number; left: number; top: number; width: number; dark?: boolean; accent?: string; children: React.ReactNode; style?: React.CSSProperties; out?: number; shadow?: boolean }> = ({ at, left, top, width, dark, accent, children, style, out, shadow = true }) => {
  const f = useCurrentFrame();
  const p = pop(f, at);
  const o = interpolate(f, [at, at + 8], [0, 1], clamp) * (out != null ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1);
  const ink = dark ? "#F3F1EC" : C.ink;
  return (
    <div style={{
      position: "absolute", left, top, width, opacity: o, transform: `translateY(${(1 - p) * 30}px) scale(${0.94 + 0.06 * p})`, transformOrigin: "50% 100%",
      background: dark ? C.nightRaised : C.sheet, color: ink, padding: "24px 28px", borderRadius: 12,
      border: `2px solid ${dark ? "rgba(243,241,236,0.22)" : C.ink}`, boxShadow: shadow ? `${dark ? "10px 10px 0 rgba(0,0,0,0.6)" : `10px 10px 0 ${C.ink}`}` : undefined,
      borderTop: accent ? `6px solid ${accent}` : undefined, fontFamily: sans, ...style,
    }}>{children}</div>
  );
};

/** Big serif headline, Driftor's own voice. */
export const Head: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 110, style }) => (
  <div style={{ fontFamily: serif, fontWeight: 400, fontSize: size, letterSpacing: "-0.015em", lineHeight: 0.98, ...style }}>{children}</div>
);
export const Em: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.signal }) => (
  <span style={{ fontFamily: serifItalic, fontStyle: "italic", color }}>{children}</span>
);

/** The Driftor mark: two offset sheets, the dashed red one on top. `p` slides it into place. */
export const Mark: React.FC<{ size: number; p?: number; color?: string; fill?: string }> = ({ size, p = 1, color = C.ink, fill = C.sheet }) => {
  const off = (1 - p) * 9;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ overflow: "visible" }}>
      <rect x={1.5} y={6.5} width={13} height={13} fill={fill} stroke={color} strokeWidth={1.5} />
      <rect x={7.5 + off} y={1.5 - off} width={13} height={13} fill="none" stroke={C.signal} strokeWidth={1.5} strokeDasharray="3 2" opacity={Math.min(1, p * 2)} />
    </svg>
  );
};
export const Wordmark: React.FC<{ size: number; p?: number; color?: string; fill?: string }> = ({ size, p = 1, color = C.ink, fill }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
    <Mark size={size} p={p} color={color} fill={fill} />
    <span style={{ fontFamily: mono, fontWeight: 500, fontSize: size * 0.78, letterSpacing: "-0.02em", color }}>driftor</span>
  </div>
);

/**
 * The film's motif: a click point. `land` decides how it ends: a green ring that lands, or a
 * red cross where a layer on top stole it.
 */
export const Click: React.FC<{ x: number; y: number; at: number; land: boolean; size?: number }> = ({ x, y, at, land, size = 1 }) => {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < -14) return null;
  const drop = interpolate(t, [-14, 0], [0, 1], { ...clamp, easing: expo });
  const ring = interpolate(t, [0, 22], [0, 1], clamp);
  const mark = interpolate(t, [2, 12], [0, 1], { ...clamp, easing: expo });
  const col = land ? C.pass : C.signal;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
      <svg width={300 * size} height={300 * size} viewBox="-150 -150 300 300" style={{ position: "absolute", left: -150 * size, top: -150 * size, overflow: "visible" }}>
        <line x1={0} y1={-140 + 130 * drop} x2={0} y2={-150} stroke={col} strokeWidth={2} strokeDasharray="5 4" opacity={1 - ring} />
        <circle r={10 + 70 * ring} fill="none" stroke={col} strokeWidth={3} opacity={(1 - ring) * (t >= 0 ? 1 : 0)} />
        <circle r={9} fill={col} opacity={t >= 0 ? 1 : drop} />
        {land ? (
          <path d="M -16 2 L -5 13 L 18 -12" fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" transform={`translate(30 -28) scale(${mark})`} />
        ) : (
          <g transform={`translate(30 -28) scale(${mark})`} stroke={col} strokeWidth={6} strokeLinecap="round"><line x1={-13} y1={-13} x2={13} y2={13} /><line x1={13} y1={-13} x2={-13} y2={13} /></g>
        )}
      </svg>
    </div>
  );
};

/** A dashed red sheet, the "layer on top" that steals clicks; slides in by `p`. */
export const Sheet: React.FC<{ left: number; top: number; w: number; h: number; p: number; label?: string }> = ({ left, top, w, h, p, label }) => (
  <div style={{ position: "absolute", left: left + (1 - p) * 60, top: top - (1 - p) * 60, width: w, height: h, opacity: p, border: `3px dashed ${C.signal}`, background: "rgba(217,65,47,0.07)", borderRadius: 6 }}>
    {label ? <div style={{ position: "absolute", right: 14, top: 10, fontFamily: mono, fontSize: 18, color: C.signal, letterSpacing: "0.04em" }}>{label}</div> : null}
  </div>
);

/** A rubber-stamp verdict that slams in at `at`. */
export const Stamp: React.FC<{ at: number; text: string; color: string; rot?: number; size?: number; style?: React.CSSProperties }> = ({ at, text, color, rot = -4, size = 40, style }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [at, at + 8], [2.4, 1], { ...clamp, easing: expo });
  const o = interpolate(f, [at, at + 4], [0, 1], clamp);
  return (
    <div style={{ display: "inline-block", opacity: o, transform: `scale(${s}) rotate(${rot}deg)`, border: `${Math.max(3, size * 0.09)}px solid ${color}`, color, fontFamily: mono, fontWeight: 600, fontSize: size, letterSpacing: "0.08em", padding: `${size * 0.18}px ${size * 0.42}px`, textTransform: "uppercase", ...style }}>{text}</div>
  );
};

/** A terminal window that types real lines out: [frame, text, colour?]. */
export const Term: React.FC<{ left: number; top: number; width: number; height?: number; title: string; lines: [number, string, string?][]; size?: number; enter?: number; cps?: number }> = ({ left, top, width, height, title, lines, size = 22, enter = 0, cps = 90 }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [enter, enter + 16], [0, 1], { ...clamp, easing: expo });
  return (
    <div style={{ position: "absolute", left, top, width, height, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, background: "#0E0D09", borderRadius: 12, border: "1.5px solid rgba(243,241,236,0.16)", boxShadow: "0 40px 90px rgba(0,0,0,0.55)", overflow: "hidden" }}>
      <div style={{ height: 40, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", background: "#1A1912", borderBottom: "1px solid rgba(243,241,236,0.08)" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 6, background: "rgba(243,241,236,0.18)" }} />)}
        <span style={{ marginLeft: 12, fontFamily: mono, fontSize: 15, color: "rgba(243,241,236,0.55)" }}>{title}</span>
      </div>
      <div style={{ padding: "18px 22px", fontFamily: mono, fontSize: size, lineHeight: 1.5, color: "#E8E5DC", whiteSpace: "pre-wrap" }}>
        {lines.map(([at, t, col], i) => {
          if (f < at) return null;
          const n = Math.floor(((f - at) / 30) * cps);
          return <div key={i} style={{ color: col ?? "#E8E5DC" }}>{t.slice(0, n)}{n < t.length ? <span style={{ background: "#E8E5DC" }}>&nbsp;</span> : null}</div>;
        })}
      </div>
    </div>
  );
};

export const Logo: React.FC<{ src: string; height: number; style?: React.CSSProperties }> = ({ src, height, style }) => (
  <Img src={staticFile(src)} style={{ height, ...style }} />
);
