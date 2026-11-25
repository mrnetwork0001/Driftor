import React from "react";
import { Sequence, interpolate } from "remotion";
import { C } from "../theme";
import { clamp } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { Fill, Kicker, Term, useCue } from "./common";

/** The site, recorded live: the landing, two verdicts, the bug zoo table, the session replay. */
export const Tour: React.FC = () => {
  const { f, rel } = useCue("tour");
  const a = rel("The") - 4, b = rel("every", 1) - 30;
  const term = rel("one") - 6;
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 120, top: 60 }}><Kicker>the site · every run archived in kane-traces/</Kicker></div>
      <Sequence from={0} durationInFrames={a + 12} layout="none">
        <Browser name="hero" url="trydriftor.vercel.app" width={1460} left={230} top={120} enter={-20} exit={a} startFrom={0} light />
      </Sequence>
      <Sequence from={a} durationInFrames={b - a + 14} layout="none">
        <Browser name="zoo" url="trydriftor.vercel.app/#catalogue · the bug zoo" width={1460} left={230} top={120} enter={0} exit={b - a} startFrom={70} light
          cams={[{ f: 0, z: 1 }, { f: 120, rect: "table", z: 1.25 }]} />
      </Sequence>
      <Sequence from={b} layout="none">
        <Browser name="loop" url="trydriftor.vercel.app/#loop · a real session, replayed" width={1460} left={230} top={120} enter={0} startFrom={150} light />
      </Sequence>
      <div style={{ opacity: interpolate(f, [term, term + 10], [0, 1], clamp) }}>
        <Term left={560} top={700} width={800} title="zsh" enter={term} size={26} cps={60}
          lines={[[term + 4, "$ npx -y github:mrnetwork0001/Driftor demo", "#F3F1EC"], [rel("account") , "no Kane account needed · replays real runs", C.passLight]]} />
      </div>
    </Fill>
  );
};
