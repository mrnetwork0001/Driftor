/**
 * "What the user saw" evidence cards.
 *
 * For every failing objective in an archived run folder, this finds the failing
 * step's screenshot in Kane CLI's sealed evidence pack, outlines the element
 * Kane acted on (the click point and element box Kane recorded), and renders a
 * compact PNG card next to the traces: <runDir>/card-<objective>.png.
 *
 *   node driftor.js --card <runDir> [--objective <id>]
 *
 * Where the evidence comes from (no network, no dependencies):
 * - The pack: <runDir>/evidence/<id>.evidence (copied by scripts/ci.js verdict),
 *   else the path in the trace's `coverage` event, else the session folder named
 *   by `recording_state.session_id` / `run_end.session_dir`
 *   (~/.testmuai/kaneai/sessions/<session>/evidence/*.evidence).
 * - A pack is a zip: tests/<test>/steps/<ordinal>-<id>/{step.json,screenshot.jpg}
 *   and tests/<test>/logs/0-actions.ndjson. step.json has the step's status,
 *   summary and, for element actions, `element_rect` (CSS px). The action log's
 *   `visual_data` has the click point, the element box and the viewport size.
 *   Screenshots are device pixels (3840x2160 for a 1920x1080 viewport on a
 *   2x screen), so boxes are scaled by screenshotWidth / viewportWidth.
 *   Kane's own steps/<x>/annotated.png is not used: in Kane 0.10.5 it draws the
 *   box at CSS-px coordinates on the device-px screenshot (half-way off on 2x).
 *
 * The card is rendered by headless Chrome from an HTML template (the same
 * Chrome the gate drives). Anything missing (no pack, no screenshot, no Chrome)
 * means no card, never an error for the gate.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { parseNdjson } = require("./heal");

/* ── zip (evidence packs) ─────────────────────────────────────────────────── */

/** Reads a zip into { names, read(name) → Buffer }. Store and deflate only; no zip64. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.subarray(start, start + e.size);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`unsupported zip method ${e.method} for ${name}`);
    },
  };
}

/* ── image size (JPEG / PNG headers) ──────────────────────────────────────── */

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: "jpeg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

/* ── finding the pack ─────────────────────────────────────────────────────── */

const sessionsDir = () => process.env.KANE_SESSIONS_DIR || path.join(os.homedir(), ".testmuai", "kaneai", "sessions");
const expandHome = (p) => (typeof p === "string" ? p.replace(/^~(?=$|\/)/, os.homedir()) : p);

/** The evidence pack for one objective's trace, or null. */
function findPack(runDir, id, events) {
  const candidates = [path.join(runDir, "evidence", `${id}.evidence`)];
  const coverage = events.find((e) => e.type === "coverage" && e.pack);
  if (coverage) candidates.push(expandHome(coverage.pack));
  const sessions = new Set();
  for (const e of events) {
    if (e.type === "recording_state" && e.session_id) sessions.add(path.join(sessionsDir(), e.session_id));
    if (e.type === "run_end" && e.session_dir) sessions.add(expandHome(e.session_dir));
  }
  for (const dir of sessions) {
    const ev = path.join(dir, "evidence");
    if (!fs.existsSync(ev)) continue;
    for (const f of fs.readdirSync(ev).sort()) if (f.endsWith(".evidence")) candidates.push(path.join(ev, f));
  }
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

/* ── reading the pack ─────────────────────────────────────────────────────── */

const json = (buf) => {
  try {
    return buf ? JSON.parse(buf.toString("utf8")) : null;
  } catch {
    return null;
  }
};

/**
 * Steps of the first test in a pack: [{ ordinal, id, status, kind, summary,
 * actionId, rect, screenshot }] in order, plus the action log's visual data by
 * action id.
 */
function readPack(file) {
  const zip = readZip(fs.readFileSync(file));
  const stepFiles = zip.names.filter((n) => /^tests\/[^/]+\/steps\/[^/]+\/step\.json$/.test(n));
  const test = stepFiles.length ? stepFiles[0].split("/")[1] : null;
  if (!test) return { zip, test: null, steps: [], visual: new Map() };
  const steps = [];
  for (const name of stepFiles.filter((n) => n.split("/")[1] === test)) {
    const dir = name.slice(0, -"step.json".length);
    const s = json(zip.read(name)) || {};
    const shot = ["screenshot.jpg", "screenshot.jpeg", "screenshot.png"].map((f) => dir + f).find((f) => zip.names.includes(f));
    steps.push({
      ordinal: Number(s.ordinal ?? dir.split("/")[3].split("-")[0]),
      id: s.id || null,
      status: String(s.status || "").toLowerCase(),
      kind: s.kind || "",
      summary: s.summary || "",
      actionId: s.action_id || null,
      rect: s.element_rect || null,
      url: s.url || null,
      screenshot: shot || null,
    });
  }
  steps.sort((a, b) => a.ordinal - b.ordinal);
  const visual = new Map();
  const actions = zip.read(`tests/${test}/logs/0-actions.ndjson`);
  if (actions) {
    for (const a of parseNdjson(actions.toString("utf8"))) {
      if (a.action_id && a.visual_data) visual.set(a.action_id, { ...a.visual_data, type: a.action_type, instruction: a.action_instruction });
    }
  }
  return { zip, test, steps, visual };
}

/* ── which step, which screenshot, which box (pure; tested) ───────────────── */

const BAD = new Set(["failed", "broken", "error", "fail", "failure"]);
const INTERACTIONS = new Set(["click", "type", "fill", "hover", "select", "check", "uncheck", "drag", "press"]);
const isBad = (status) => typeof status === "string" && BAD.has(status.toLowerCase());

/**
 * Picks what the card shows from a pack's steps (see readPack).
 *   failing:    the first failed/broken step, or the last step if none is marked
 *   screenshot: the step whose screenshot is shown: the failing step's, else the
 *               nearest earlier one, else the nearest later one
 *   target:     what Kane acted on, or null: { rect, point, viewport, kind, step, ndjsonStep }.
 *               The failing step's own box/click; else the interaction just before it
 *               (Kane usually fails the wait/assert after a click that did nothing).
 *               Kane logs a failing wait under the click's action id, so the box is
 *               credited to the click step that owns it.
 *   ndjsonStep: the failing step's number in the NDJSON trace (what the heal prompt says)
 */
function selectEvidence(steps, { visual = new Map(), events = [] } = {}) {
  if (!steps || !steps.length) return null;
  const firstBad = steps.findIndex((s) => isBad(s.status));
  const at = firstBad === -1 ? steps.length - 1 : firstBad;
  const failing = steps[at];

  let shot = failing.screenshot ? failing : null;
  for (let i = at - 1; !shot && i >= 0; i--) if (steps[i].screenshot) shot = steps[i];
  for (let i = at + 1; !shot && i < steps.length; i++) if (steps[i].screenshot) shot = steps[i];

  const boxOf = (i) => {
    const s = steps[i];
    const v = s.actionId ? visual.get(s.actionId) : null;
    const rect = (v && v.bbox) || s.rect || null;
    const point = v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
    if (!rect && !point) return null;
    // Credit the box to the step that did the action (the click), not a later step sharing its id.
    let owner = i;
    for (let j = i; j >= 0; j--) {
      if (steps[j].actionId === s.actionId && (steps[j].rect || INTERACTIONS.has(String(steps[j].kind).toLowerCase()))) {
        owner = j;
        break;
      }
    }
    const viewport = v && v.viewport_width ? { width: v.viewport_width, height: v.viewport_height } : null;
    const kind = String((v && v.type) || steps[owner].kind || "").toLowerCase();
    return { rect, point, viewport, kind, step: steps[owner], index: owner };
  };
  let target = boxOf(at);
  for (let i = at - 1; !target && i >= Math.max(0, at - 2); i--) {
    if (INTERACTIONS.has(String(steps[i].kind || (visual.get(steps[i].actionId) || {}).type || "").toLowerCase())) target = boxOf(i);
  }

  // NDJSON numbering: the failed event whose remark is this step's summary, else the first failed step.
  const failedEvents = events.filter((e) => e.step != null && isBad(e.status));
  const match = failedEvents.find((e) => e.remark && e.remark === failing.summary) || failedEvents[0];
  const ndjsonStep = match ? match.step : failing.ordinal;
  if (target) {
    target.ndjsonStep = ndjsonStep - (failing.ordinal - target.step.ordinal);
    delete target.index;
  }
  return { failing, screenshot: shot, target, ndjsonStep };
}

/* ── labels ───────────────────────────────────────────────────────────────── */

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Title, viewport and unit verdict for one objective (or derived acceptance check) of a run. */
function describeObjective(run, id) {
  const o = (run && run.objectives && run.objectives[id]) || null;
  const checks = (run && run.acceptance && run.acceptance.checks) || {};
  const check = checks[id.replace(/^task-/, "")] || null;
  const meta = o || check || {};
  return { title: meta.title || id, viewport: meta.viewport || null, derived: !o && !!check, unit: run ? run.unit || null : null };
}

/* ── layout + HTML ────────────────────────────────────────────────────────── */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PALETTE = { paper: "#F3F1EC", ink: "#17160F", red: "#D9412F", green: "#2E6B46", rule: "#D8D3C8", muted: "#6B675C" };
const CARD_W = 1200;
const PAD = 24;
const HEAD_H = 156; // kicker, title, meta, verdict pills, rule
const FOOT_H = 34;

/**
 * Where everything goes, in card px. Pure. Landscape screenshots sit full width
 * with the step and a zoom inset below; portrait ones sit left with both beside them.
 */
function layout({ imgW, imgH, target, viewport }) {
  const inner = CARD_W - PAD * 2;
  const portrait = imgW / imgH < 1.2;
  const shot = portrait
    ? { h: 700, w: Math.round((700 * imgW) / imgH) }
    : { w: inner, h: Math.round((inner * imgH) / imgW) };
  const s = shot.w / imgW; // card px per screenshot px
  const side = portrait ? { w: inner - shot.w - PAD, h: shot.h } : { w: inner, h: target ? 200 : 130 };
  const zoomBox = portrait ? { w: side.w, h: 300 } : { w: 560, h: side.h };

  let box = null;
  let dot = null;
  let zoom = null;
  if (target) {
    // CSS px → screenshot px: Kane's recorded viewport, else the objective's, else 1:1.
    const vp = target.viewport || viewport || { width: imgW, height: imgH };
    const k = imgW / vp.width;
    const r = target.rect && { x: target.rect.x * k, y: target.rect.y * k, w: target.rect.width * k, h: target.rect.height * k };
    const p = target.point && { x: target.point.x * k, y: target.point.y * k };
    if (r) box = { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s };
    if (p) dot = { x: p.x * s, y: p.y * s };
    // Zoom: the screenshot at 1:1 device px (2x CSS on a retina capture), shrunk if the element wouldn't fit.
    const c = p || (r && { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const z = Math.min(1, r ? (zoomBox.w * 0.5) / r.w : 1);
    const regionW = zoomBox.w / z;
    const regionH = zoomBox.h / z;
    const left = Math.max(0, Math.min(imgW - regionW, c.x - regionW / 2));
    const top = Math.max(0, Math.min(imgH - regionH, c.y - regionH / 2));
    zoom = {
      ...zoomBox,
      img: { w: imgW * z, h: imgH * z, x: -left * z, y: -top * z },
      box: r && { x: (r.x - left) * z, y: (r.y - top) * z, w: r.w * z, h: r.h * z },
      dot: p && { x: (p.x - left) * z, y: (p.y - top) * z },
    };
  }
  const body = portrait ? shot.h : shot.h + 16 + side.h;
  return { portrait, shot, side, box, dot, zoom, width: CARD_W, height: PAD + HEAD_H + body + FOOT_H + 12 };
}

const marks = (box, dot) =>
  (box ? `<div class="box" style="left:${box.x - 5}px;top:${box.y - 5}px;width:${box.w + 10}px;height:${box.h + 10}px"></div>` : "") +
  (dot ? `<div class="dot" style="left:${dot.x}px;top:${dot.y}px"></div>` : "");

function cardHtml(m) {
  const P = PALETTE;
  const L = m.lay;
  const unit = !m.unit
    ? { text: "unit tests: not recorded", color: P.muted }
    : m.unit.passed
      ? { text: `unit tests: passed${m.unit.summary ? ` · ${m.unit.summary.replace(/^Tests\s+/, "").replace(/\s*\(\d+\)$/, "")}` : ""}`, color: P.green }
      : { text: "unit tests: failed", color: P.red };
  const t = m.target;
  const note = t
    ? `Red box: the element Kane ${t.kind === "click" ? "clicked" : `acted on (${esc(t.kind || "action")})`} in step ${esc(t.ndjsonStep)}, “${esc(t.step.summary.replace(/^\w+:\s*/, ""))}”.` +
      (t.point ? ` Dot: ${t.kind === "click" ? "the click point" : "the point"}, (${Math.round(t.point.x)}, ${Math.round(t.point.y)}) CSS px.` : "")
    : "Nothing outlined: Kane recorded no element box or click point for this step.";
  const zoom = L.zoom
    ? `<div class="zoom" style="width:${L.zoom.w}px;height:${L.zoom.h}px"><img src="${m.dataUri}" style="width:${L.zoom.img.w}px;height:${L.zoom.img.h}px;left:${L.zoom.img.x}px;top:${L.zoom.img.y}px">${marks(L.zoom.box, L.zoom.dot)}<span class="tag">zoom</span></div>`
    : "";
  const step = `<div class="step">
      <div class="label">Step ${esc(m.step)} · failed in real Chrome</div>
      <div class="remark">${esc(m.remark)}</div>
      ${m.reason ? `<div class="reason">Kane: ${esc(m.reason)}</div>` : ""}
      <div class="note">${note}</div>
    </div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${P.paper}; color: ${P.ink}; width: ${L.width}px; height: ${L.height}px; overflow: hidden; }
  body { font-family: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; padding: ${PAD}px ${PAD}px 0; }
  .head { height: ${HEAD_H}px; }
  .kicker { font: 500 12px/14px "IBM Plex Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: ${P.muted}; display: flex; justify-content: space-between; }
  .kicker b { color: ${P.red}; font-weight: 500; }
  h1 { font: 400 36px/42px "Instrument Serif", Georgia, serif; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font: 400 13px/18px "IBM Plex Mono", Menlo, monospace; color: ${P.muted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pills { display: flex; gap: 10px; margin-top: 14px; }
  .pill { font: 500 13px/13px "IBM Plex Mono", Menlo, monospace; padding: 8px 10px; border: 1.5px solid currentColor; border-radius: 3px; white-space: nowrap; }
  .pill.fail { background: ${P.red}; border-color: ${P.red}; color: ${P.paper}; }
  .rule { border-top: 1px solid ${P.rule}; margin-top: 16px; }
  .body { display: flex; gap: ${L.portrait ? PAD : 16}px; flex-direction: ${L.portrait ? "row" : "column"}; }
  .shot { position: relative; flex: none; width: ${L.shot.w}px; height: ${L.shot.h}px; outline: 1px solid ${P.rule}; overflow: hidden; background: #fff; }
  .shot > img { width: 100%; height: 100%; display: block; }
  .box { position: absolute; border: 3px solid ${P.red}; border-radius: 3px; box-shadow: 0 0 0 2px rgba(255,255,255,.85); }
  .dot { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: ${P.red}; border: 2px solid #fff; box-shadow: 0 0 0 1px ${P.red}; }
  .side { flex: none; width: ${L.side.w}px; height: ${L.side.h}px; display: flex; gap: 20px; flex-direction: ${L.portrait ? "column" : "row"}; overflow: hidden; }
  .zoom { position: relative; flex: none; overflow: hidden; outline: 1px solid ${P.rule}; background: #fff; }
  .zoom img { position: absolute; max-width: none; }
  .tag { position: absolute; right: 0; bottom: 0; font: 500 10px/10px "IBM Plex Mono", Menlo, monospace; text-transform: uppercase; letter-spacing: .08em; background: ${P.ink}; color: ${P.paper}; padding: 4px 6px; }
  .step { flex: 1; min-width: 0; overflow: hidden; }
  .label { font: 500 12px/14px "IBM Plex Mono", Menlo, monospace; color: ${P.red}; letter-spacing: .06em; text-transform: uppercase; }
  .remark { font: 500 19px/26px "IBM Plex Sans", sans-serif; margin-top: 8px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .reason { font: 400 14px/20px "IBM Plex Sans", sans-serif; color: ${P.muted}; margin-top: 8px; display: -webkit-box; -webkit-line-clamp: ${L.portrait ? 6 : 3}; -webkit-box-orient: vertical; overflow: hidden; }
  .note { font: 400 12px/17px "IBM Plex Mono", Menlo, monospace; color: ${P.ink}; margin-top: 10px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .foot { height: ${FOOT_H}px; padding-top: 12px; border-top: 1px solid ${P.rule}; margin-top: 12px; font: 400 11px/14px "IBM Plex Mono", Menlo, monospace; color: ${P.muted}; display: flex; justify-content: space-between; }
</style></head>
<body>
  <div class="head">
    <div class="kicker"><span>Driftor · <b>what the user saw</b></span><span>${esc(m.viewport || "")}</span></div>
    <h1>${esc(m.title)}</h1>
    <div class="meta">${esc(m.id)}${m.derived ? " · designed by Kane from the task (unreviewed)" : ""}${m.url ? ` · ${esc(m.url)}` : ""}</div>
    <div class="pills"><span class="pill" style="color:${unit.color}">${esc(unit.text)}</span><span class="pill fail">Kane in real Chrome: failed</span></div>
    <div class="rule"></div>
  </div>
  <div class="body">
    <div class="shot"><img src="${m.dataUri}">${marks(L.box, L.dot)}</div>
    <div class="side">${zoom}${step}</div>
  </div>
  <div class="foot"><span>Screenshot: step ${esc(m.screenshotStep)}, from Kane CLI's evidence pack · ${m.imgW}×${m.imgH} px</span><span>run ${esc(m.run)}</span></div>
</body></html>`;
}

/* ── rendering ────────────────────────────────────────────────────────────── */

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.KANE_CLI_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** Renders HTML to a width x height PNG with headless Chrome. Throws on failure. */
function renderPng(html, out, { width, height }) {
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome not found (set CHROME_PATH)");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-card-"));
  try {
    const page = path.join(tmp, "card.html");
    const shot = path.join(tmp, "card.png");
    fs.writeFileSync(page, html);
    const res = spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-device-scale-factor=1",
        `--user-data-dir=${path.join(tmp, "profile")}`,
        `--window-size=${width},${height}`,
        // Waits for the web fonts (falls back to system fonts offline).
        "--virtual-time-budget=10000",
        ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
        `--screenshot=${shot}`,
        `file://${page}`,
      ],
      { encoding: "utf8", timeout: 90_000 }
    );
    if (!fs.existsSync(shot)) throw new Error(`Chrome made no screenshot (${(res.stderr || "").trim().split("\n").pop() || `exit ${res.status}`})`);
    fs.copyFileSync(shot, out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
}

/* ── one run folder ───────────────────────────────────────────────────────── */

const parseViewport = (v) => {
  const m = /^(\d+)x(\d+)$/.exec(String(v || ""));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
};

const cardPath = (runDir, id) => path.join(runDir, `card-${id}.png`);

/** Card for one objective's trace. Returns { id, card, step } or { id, skipped }. */
function makeCard(runDir, id, events, run) {
  const pack = findPack(runDir, id, events);
  if (!pack) return { id, skipped: "no Kane evidence pack found (run folder, coverage event or session folder)" };
  const { zip, steps, visual } = readPack(pack);
  const sel = selectEvidence(steps, { visual, events });
  if (!sel || !sel.screenshot) return { id, skipped: "the evidence pack has no step screenshot" };
  const img = zip.read(sel.screenshot.screenshot);
  const size = img && imageSize(img);
  if (!size) return { id, skipped: "unreadable screenshot" };

  const info = describeObjective(run, id);
  const end = events.find((e) => e.type === "run_end") || {};
  const failedEvent = events.find((e) => e.step === sel.ndjsonStep && isBad(e.status));
  const viewport = info.viewport || (sel.target && sel.target.viewport && `${sel.target.viewport.width}x${sel.target.viewport.height}`) || null;
  const lay = layout({ imgW: size.width, imgH: size.height, target: sel.target, viewport: parseViewport(viewport) });
  const html = cardHtml({
    lay,
    title: info.title,
    id,
    viewport,
    derived: info.derived,
    unit: info.unit,
    url: (steps.find((s) => s === sel.failing) || {}).url || null,
    step: sel.ndjsonStep,
    remark: (failedEvent && failedEvent.remark) || sel.failing.summary || "(no remark)",
    reason: end.reason || end.one_liner || "",
    target: sel.target,
    dataUri: `data:image/${size.type};base64,${img.toString("base64")}`,
    imgW: size.width,
    imgH: size.height,
    screenshotStep: sel.ndjsonStep - (sel.failing.ordinal - sel.screenshot.ordinal),
    run: path.basename(runDir),
  });
  const out = cardPath(runDir, id);
  renderPng(html, out, { width: lay.width, height: lay.height });
  return { id, card: out, step: sel.ndjsonStep };
}

/**
 * Makes card-<id>.png for each failing trace in runDir (or only `objective`,
 * failing or not). Returns [{ id, card, step } | { id, skipped }]; never throws
 * for one objective.
 */
function makeCards(runDir, { objective = null, skipExisting = false, log = () => {} } = {}) {
  runDir = path.resolve(runDir);
  const run = readJson(path.join(runDir, "run.json"));
  const files = fs.existsSync(runDir) ? fs.readdirSync(runDir).filter((f) => f.endsWith(".ndjson")).sort() : [];
  const results = [];
  for (const file of files) {
    const id = file.replace(/\.ndjson$/, "");
    if (objective && id !== objective) continue;
    if (skipExisting && fs.existsSync(cardPath(runDir, id))) continue;
    let result;
    try {
      const events = parseNdjson(fs.readFileSync(path.join(runDir, file), "utf8"));
      const end = events.find((e) => e.type === "run_end");
      const failed = end ? String(end.status).toLowerCase() !== "passed" : events.some((e) => e.step != null && isBad(e.status));
      if (!failed && !objective) continue;
      result = makeCard(runDir, id, events, run);
    } catch (err) {
      result = { id, skipped: err.message };
    }
    results.push(result);
    log(result.card ? ` ▣ ${id}: ${result.card}` : ` · no card for ${id}: ${result.skipped}`);
  }
  return results;
}

/** The card already made for an objective in a run folder, or null. */
function cardFor(runDir, id) {
  const p = cardPath(runDir, id);
  return fs.existsSync(p) ? p : null;
}

module.exports = { readZip, imageSize, findPack, readPack, selectEvidence, describeObjective, layout, cardHtml, makeCard, makeCards, cardFor, findChrome };
