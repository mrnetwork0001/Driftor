import React from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { T, scene, wordAt, lineStart } from "./timing";
import { C } from "./theme";
import { Captions } from "./ui/Captions";
import { Grain } from "./ui/Grain";
import { clamp } from "./ui/motion";
import { Open } from "./scenes/Open";
import { Problem } from "./scenes/Problem";
import { Zoo } from "./scenes/Zoo";
import { Turn } from "./scenes/Turn";
import { Kane } from "./scenes/Kane";
import { Hooks } from "./scenes/Hooks";
import { Red } from "./scenes/Red";
import { Green } from "./scenes/Green";
import { Guard } from "./scenes/Guard";
import { Saw } from "./scenes/Saw";
import { Tour } from "./scenes/Tour";
import { Unique } from "./scenes/Unique";
import { Close } from "./scenes/Close";

const SCENES: Record<string, React.FC> = {
  open: Open, problem: Problem, zoo: Zoo, turn: Turn, kane: Kane, hooks: Hooks, red: Red,
  green: Green, guard: Guard, saw: Saw, tour: Tour, unique: Unique, close: Close,
};
const OVERLAP = 12;

const SceneIn: React.FC<{ S: React.FC; first: boolean }> = ({ S, first }) => {
  const f = useCurrentFrame();
  if (first) return <S />;
  const p = interpolate(f, [0, OVERLAP], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const body = f < OVERLAP ? <Freeze frame={0}><S /></Freeze> : <Sequence from={OVERLAP} layout="none"><S /></Sequence>;
  return <AbsoluteFill style={{ opacity: p, transform: `scale(${1.04 - 0.04 * p})`, filter: p < 1 ? `blur(${(1 - p) * 12}px)` : undefined }}>{body}</AbsoluteFill>;
};

const LINES = T.scenes.flatMap((s) => s.lines.map((l) => [l.startFrame, l.words[l.words.length - 1].end] as const));
const DUCK: number[] = (() => {
  const v = new Array<number>(T.totalFrames + 1).fill(0);
  for (let f = 0; f <= T.totalFrames; f++) {
    let d = 0;
    for (const [a, b] of LINES) d = Math.max(d, interpolate(f, [a - 10, a, b, b + 14], [0, 1, 1, 0], clamp));
    v[f] = d;
  }
  return v;
})();
const musicVolume = (f: number) => {
  const end = T.totalFrames;
  const fadeIn = interpolate(f, [0, 20], [0, 1], clamp);
  const fadeOut = interpolate(f, [end - 50, end], [1, 0], clamp);
  return (0.55 - 0.4 * DUCK[Math.min(end, Math.max(0, f))]) * fadeIn * fadeOut;
};

interface Fx { file: string; at: number; vol: number; dur?: number }
function effects(): Fx[] {
  const sc = (id: string) => scene(id).from;
  const w = (id: string, word: string, n = 0) => wordAt(id, word, n);
  const fx: Fx[] = [
    { file: "tick", at: 4, vol: 0.3 }, { file: "tick", at: 34, vol: 0.3 },
    { file: "pass", at: w("open", "passed.") - 2, vol: 0.35 },
    { file: "whoosh", at: w("open", "But") - 6, vol: 0.3 },
    { file: "glitch", at: w("open", "main") - 2, vol: 0.35 },
    { file: "dead_click", at: w("open", "clicked."), vol: 0.6 },
    { file: "fail", at: w("open", "clicked.") + 4, vol: 0.4 },
    { file: "whoosh", at: sc("problem") - 8, vol: 0.3 },
    ...["layout.", "layers.", "cache."].map((x) => ({ file: "pop", at: w("problem", x) - 6, vol: 0.35 })),
    { file: "swoosh_up", at: w("problem", "walk") - 8, vol: 0.3 },
    { file: "whoosh", at: sc("zoo") - 8, vol: 0.3 },
    ...[0, 8, 16, 24, 32].map((d) => ({ file: "tick", at: w("zoo", "Five") + d, vol: 0.25 })),
    { file: "fail", at: w("zoo", "zero") - 2, vol: 0.3 },
    { file: "stamp", at: w("zoo", "five.", 1) + 4, vol: 0.55 },
    { file: "riser", at: sc("turn") - 80, vol: 0.4 },
    { file: "impact", at: w("turn", "Driftor.") - 4, vol: 0.55 },
    { file: "click", at: w("turn", "it.") + 2, vol: 0.45 },
    { file: "chime", at: w("turn", "it.") + 6, vol: 0.3 },
    { file: "whoosh", at: sc("kane") - 8, vol: 0.3 },
    { file: "pop", at: w("kane", "Kane") - 8, vol: 0.4 },
    { file: "pop", at: w("kane", "TestMu") - 6, vol: 0.4 },
    ...["reads", "drives", "seals"].map((x) => ({ file: "tick", at: w("kane", x) - 4, vol: 0.4 })),
    { file: "whoosh", at: sc("hooks") - 8, vol: 0.3 },
    { file: "lock", at: w("hooks", "hooks.") - 2, vol: 0.4 },
    { file: "click", at: w("hooks", "Kane") + 25, vol: 0.45 },
    { file: "fail", at: w("hooks", "breaks,") - 2, vol: 0.3 },
    { file: "whoosh", at: sc("red") - 8, vol: 0.3 },
    { file: "typing", at: w("red", "asked") - 2, vol: 0.25, dur: 70 },
    ...[0, 6].map((d) => ({ file: "stamp", at: w("red", "them.") + d, vol: 0.45 })),
    { file: "glitch", at: lineStart("red", 1) - 10, vol: 0.4 },
    { file: "fail", at: lineStart("red", 1) - 4, vol: 0.45 },
    { file: "swoosh_up", at: sc("green") - 8, vol: 0.35 },
    { file: "click", at: w("green", "ran") - 4, vol: 0.4 },
    ...[0, 8].map((d) => ({ file: "pass", at: w("green", "passed.") + d, vol: 0.45 })),
    { file: "stamp", at: w("green", "prove"), vol: 0.55 },
    { file: "whoosh", at: sc("guard") - 8, vol: 0.3 },
    ...[0, 7, 14, 21].map((d) => ({ file: "lock", at: w("guard", "blocked") + d, vol: 0.4 })),
    { file: "chime", at: w("guard", "through."), vol: 0.35 },
    { file: "whoosh", at: sc("saw") - 8, vol: 0.3 },
    { file: "shutter", at: w("saw", "card.") - 8, vol: 0.45 },
    { file: "whoosh", at: sc("tour") - 8, vol: 0.3 },
    { file: "typing", at: w("tour", "one") - 2, vol: 0.25, dur: 50 },
    { file: "swoosh_up", at: sc("unique") - 8, vol: 0.35 },
    ...["Tests", "Red", "guard", "Chrome"].map((x) => ({ file: "pop", at: w("unique", x) - 4, vol: 0.4 })),
    { file: "whoosh", at: sc("close") - 8, vol: 0.3 },
    { file: "impact", at: w("close", "Driftor.") - 4, vol: 0.35 },
    { file: "click", at: w("close", "it.") + 4, vol: 0.4 },
    { file: "chime", at: w("close", "it.") + 8, vol: 0.35 },
  ];
  return fx.filter((x) => x.at >= 0 && x.at < T.totalFrames);
}

const CAPTIONS = new Set(["problem", "hooks", "red", "saw", "tour"]);

export const Film: React.FC = () => {
  const hideCaptions = (f: number) => {
    const s = T.scenes.find((x) => f >= x.from && f < x.from + x.durationInFrames);
    return !s || !CAPTIONS.has(s.id);
  };
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {T.scenes.map((s, i) => {
        const S = SCENES[s.id];
        const from = i === 0 ? s.from : s.from - OVERLAP;
        const dur = s.durationInFrames + (i === 0 ? 0 : OVERLAP);
        return S ? (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.id}>
            <SceneIn S={S} first={i === 0} />
          </Sequence>
        ) : null;
      })}
      <Grain opacity={0.05} />
      <Captions hidden={hideCaptions} bottom={28} />
      <Audio src={staticFile("audio/music.mp3")} volume={musicVolume} />
      {T.scenes.flatMap((s) => s.lines).map((l, i) => (
        <Sequence key={`vo${i}`} from={l.startFrame} durationInFrames={l.durationFrames} name={`vo ${l.text.slice(0, 18)}`}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
      {effects().map((x, i) => (
        <Sequence key={`fx${i}`} from={x.at} durationInFrames={x.dur ?? 150} name={`fx ${x.file}`}>
          <Audio src={staticFile(`audio/sfx/${x.file}.mp3`)} volume={(f) => x.vol * (x.dur ? interpolate(f, [0, 8, x.dur - 20, x.dur], [0, 1, 1, 0], clamp) : 1)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
