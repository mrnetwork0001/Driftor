import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * "What the user saw" cards (lib/card.js), committed next to their traces in
 * kane-traces/runs/<stamp>/card-<objective>.png.
 *
 *   GET /api/cards                                   → { cards: CardInfo[] }, newest run first
 *   GET /api/cards?run=<stamp>&objective=<id>        → the PNG
 */
export const dynamic = "force-dynamic";

const RUNS_DIR = path.join(process.cwd(), "kane-traces", "runs");
const SAFE = /^[A-Za-z0-9._-]+$/;

export interface CardInfo {
  run: string;
  objective: string;
  /** Path of the PNG on this site. */
  src: string;
  title: string;
  viewport: string | null;
  /** Bug-zoo regression live during the run, if any. */
  regression: string[];
  unit: { passed: boolean; summary: string | null } | null;
  bytes: number;
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listCards(): CardInfo[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const cards: CardInfo[] = [];
  for (const run of fs.readdirSync(RUNS_DIR).sort().reverse()) {
    const dir = path.join(RUNS_DIR, run);
    if (!fs.statSync(dir).isDirectory()) continue;
    const record = readJson(path.join(dir, "run.json")) || {};
    for (const file of fs.readdirSync(dir).sort()) {
      const m = /^card-(.+)\.png$/.exec(file);
      if (!m) continue;
      const objective = m[1];
      const meta = record.objectives?.[objective] || record.acceptance?.checks?.[objective.replace(/^task-/, "")] || {};
      cards.push({
        run,
        objective,
        src: `/api/cards?run=${encodeURIComponent(run)}&objective=${encodeURIComponent(objective)}`,
        title: meta.title || objective,
        viewport: meta.viewport || null,
        regression: Array.isArray(record.regression) ? record.regression : [],
        unit: record.unit ? { passed: !!record.unit.passed, summary: record.unit.summary ?? null } : null,
        bytes: fs.statSync(path.join(dir, file)).size,
      });
    }
  }
  return cards;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const run = url.searchParams.get("run");
  const objective = url.searchParams.get("objective");
  if (!run && !objective) return NextResponse.json({ cards: listCards() });
  if (!run || !objective || !SAFE.test(run) || !SAFE.test(objective) || run.startsWith(".") || objective.startsWith(".")) {
    return NextResponse.json({ error: "run and objective are required" }, { status: 400 });
  }
  const file = path.join(RUNS_DIR, run, `card-${objective}.png`);
  if (!fs.existsSync(file)) return NextResponse.json({ error: "no such card" }, { status: 404 });
  return new NextResponse(fs.readFileSync(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
