import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

/** Driftor's own families (app/layout.tsx): IBM Plex Sans and Mono, Instrument Serif. */
export const sans = loadSans("normal", { weights: ["300", "400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const serif = loadSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const serifItalic = loadSerif("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const display = serif;

/** Driftor's drafting-table palette (tailwind.config.ts). */
export const C = {
  paper: "#F3F1EC",
  sheet: "#FAF9F6",
  ink: "#17160F",
  graphite: "#5F5B52",
  rule: "#D8D3C8",
  signal: "#D9412F",
  pass: "#2E6B46",
  passLight: "#7FD19C",
  night: "#12110C",
  nightRaised: "#1D1C15",
  bg: "#12110C",
  teal: "#7FD19C",
};

export type Tone = "dark" | "light" | "brand";
export const TONE: Record<Tone, { bg: string; ink: string; muted: string; line: string; pill: string }> = {
  dark: { bg: C.night, ink: "#F3F1EC", muted: "rgba(243,241,236,0.55)", line: "rgba(243,241,236,0.14)", pill: "rgba(18,17,12,0.7)" },
  light: { bg: C.paper, ink: C.ink, muted: "rgba(23,22,15,0.55)", line: "rgba(23,22,15,0.14)", pill: "rgba(250,249,246,0.86)" },
  brand: { bg: C.signal, ink: "#FAF9F6", muted: "rgba(250,249,246,0.75)", line: "rgba(250,249,246,0.25)", pill: "rgba(120,25,15,0.45)" },
};

export const SCENE_TONE: Record<string, Tone> = {
  open: "dark", problem: "light", zoo: "light", turn: "brand", kane: "dark", hooks: "light",
  red: "dark", green: "light", guard: "dark", saw: "light", tour: "light", unique: "brand", close: "dark",
};
