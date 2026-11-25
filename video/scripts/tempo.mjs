// Plays narrator lines a little faster without re-voicing: re-renders each from its raw take
// with atempo and records the tempo in its word file (timing.mjs divides word times by it).
//   TEMPO=1.05 node scripts/tempo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderVo } from "./vofx.mjs";
const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const tempo = Number(process.env.TEMPO || 1.05);
const script = JSON.parse(readFileSync(join(ROOT, "script.json"), "utf8"));
for (const s of script.scenes) s.lines.forEach((l, i) => {
  if (l.voice !== "narrator") return;
  const id = `${s.id}_${i}`, f = join(ROOT, ".cache/words", `${id}.json`);
  const w = JSON.parse(readFileSync(f, "utf8"));
  renderVo(id, tempo);
  writeFileSync(f, JSON.stringify({ ...w, tempo }, null, 1));
  console.log(`${id}: x${tempo}`);
});
