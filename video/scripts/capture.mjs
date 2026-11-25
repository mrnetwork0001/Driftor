// Records the real Driftor site and the CloudScale demo app for the film.
//   ONLY=app,revoke,hero,zoo,loop,hud node scripts/capture.mjs
// Output: .cache/frames/<clip>/ (JPEG screencast + frames.json), .cache/marks.json (event times),
// .cache/meta.json (per clip: element rects in CSS px) and stills in public/stills/.
// scripts/encode.mjs turns the frames into public/footage/<clip>.mp4.
//
// The window is 1600x900 CSS px at device scale 2 (frames 3200x1800). Everything runs on this
// machine: the main repo's dev server on :3002 and the live-session worktree (with the Revoke
// button Claude built) on :3004. Writes are local demo state only: one generated key and one
// top-up on :3002, one revoked key on :3004; both workspaces are reset to their seed afterwards.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:3002";
const WT = process.env.WT || "http://localhost:3004";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FRAMES = join(ROOT, ".cache/frames");
const STILLS = join(ROOT, "public/stills");
const SCALE = 2;
const VIEW = { w: 1600, h: 900 };
const ONLY = (process.env.ONLY || "app,revoke,hero,zoo,loop,hud").split(",");
// The writes (one ride, one pick, one heist message, one question) are done; name the clips to record.
const want = (clip) => ONLY.includes(clip);
const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
const marks = readJson(join(ROOT, ".cache/marks.json"));
const meta = readJson(join(ROOT, ".cache/meta.json"));
const mark = (k) => { marks[k] = Date.now() / 1000; log("mark", k); };
const save = () => {
  writeFileSync(join(ROOT, ".cache/marks.json"), JSON.stringify(marks, null, 1));
  writeFileSync(join(ROOT, ".cache/meta.json"), JSON.stringify(meta, null, 1));
};

// A visible pointer (headless Chrome draws none), a click ring and an eased scroll helper.
const OVERLAY = `(() => {
  window.__ease = (el, prop, to, ms) => new Promise((done) => {
    const from = el[prop]; const start = performance.now();
    const f = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const p = Math.min(1, (now - start) / ms); el[prop] = from + (to - from) * f(p); if (p < 1) requestAnimationFrame(step); else done(el[prop]); };
    requestAnimationFrame(step);
  });
  if (document.getElementById('__cur')) return;
  const s = document.createElement('style');
  s.textContent = 'html{scroll-behavior:auto!important}#__cur{position:fixed;left:-40px;top:-40px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.96);box-shadow:0 0 0 2px rgba(23,22,15,.8),0 4px 16px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .3s ease,transform .12s ease-out,left .8s cubic-bezier(.22,1,.36,1),top .8s cubic-bezier(.22,1,.36,1)}#__cur.down{transform:scale(.7)}.__ring{position:fixed;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;border:2px solid rgba(217,65,47,.9);z-index:2147483646;pointer-events:none;animation:__r .6s ease-out forwards}@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';
  document.head.appendChild(s);
  const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
})()`;

let b;
const js = (e) => b.js(e);
async function overlay() { await js(OVERLAY); }
async function glide(x, y, settle = 900) {
  await js(`(() => { const k = document.getElementById('__cur'); if (k) { k.style.opacity = '1'; k.style.left = '${x}px'; k.style.top = '${y}px'; } })()`);
  await sleep(820);
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(Math.max(0, settle - 820));
}
async function cursorAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); if (!k) return; const t = k.style.transition; k.style.transition = 'opacity .3s ease'; k.style.left = '${x}px'; k.style.top = '${y}px'; k.offsetWidth; k.style.transition = t; k.style.opacity = '1'; })()`);
}
async function cursorHide() { await js(`(() => { const k = document.getElementById('__cur'); if (k) k.style.opacity = '0'; })()`); }
async function clickAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); k?.classList.add('down'); const r = document.createElement('div'); r.className = '__ring'; r.style.left = '${x}px'; r.style.top = '${y}px'; document.body.appendChild(r); setTimeout(() => { k?.classList.remove('down'); r.remove(); }, 650); })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await sleep(90);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
const centerOf = (finder) => js(`(() => { const e = ${finder}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const rectOf = async (finder) => { const r = await b.rectOf(finder); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
/** Absolute document y of an element's top. */
const docY = (finder) => js(`(() => { const e = ${finder}; return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; })()`);
const scrollTo = (y, ms) => js(`window.__ease(document.scrollingElement, 'scrollTop', ${y}, ${ms})`);
const parkMouse = () => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: VIEW.w - 4, y: VIEW.h - 4 });
/** Glide to an element and click it (real mouse events). */
async function press(finder, settle = 700) {
  const p = await centerOf(finder);
  if (!p) throw new Error("press: not found " + finder.slice(0, 90));
  await glide(p.x, p.y, 1000);
  await clickAt(p.x, p.y);
  await sleep(settle);
  return p;
}
/** Types text into the focused field, a key at a time, like a person. */
async function typeText(text, cps = 16) {
  for (const ch of text) {
    await b.send("Input.insertText", { text: ch });
    await sleep(1000 / cps + Math.random() * 30);
  }
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().replace(/\\s+/g, ' ').startsWith(${JSON.stringify(text)}))`;
const byAria = (sel, label) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)}))`;
const heading = (text) => byText("h1,h2,h3", text);
async function waitFor(cond, ms = 30000, what = cond) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(`!!(${cond})`).catch(() => false)) return true; await sleep(400); }
  throw new Error("timed out waiting for " + String(what).slice(0, 120));
}

let stopRec = null;
async function rec(name) {
  const dir = join(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  stopRec = await b.screencast(dir);
  if (meta[name]) meta[name].rects = {};
  mark(`${name}:start`);
}
async function endRec(name) {
  if (!stopRec) return;
  mark(`${name}:end`);
  const frames = await stopRec();
  stopRec = null;
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
  log(`${name}: ${frames.length} frames over ${span.toFixed(1)}s (${(frames.length / Math.max(span, 0.001)).toFixed(1)} fps)`);
}
function setMeta(clip, data) {
  const prev = meta[clip] || {};
  meta[clip] = { deviceScale: SCALE, viewport: VIEW, ...prev, ...data, rects: { ...(prev.rects || {}), ...(data.rects || {}) } };
}
async function still(name, finder) { await b.shot(join(STILLS, `${name}.png`), finder); log("still", name); }

async function open(url, { settle = 4500 } = {}) {
  await b.goto(url, settle);
  await overlay();
  await parkMouse();
  const errs = await js(`/Application error|Unhandled Runtime Error|This page could not be found/.test(document.title + ' ' + document.body.innerText.slice(0, 600))`);
  if (errs) log("WARN: page shows an error?", url);
}
const reset = (base) => js(`fetch(${JSON.stringify(base + "/api/cloudscale/reset")}, { method: "POST" }).then((r) => r.status)`);
const text = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.innerText`);

// ---------------------------------------------------------------- clips
const CLIPS = {};

/** CloudScale, the app Driftor guards: accept cookies, generate a key, top up the quota. */
CLIPS.app = async () => {
  await open(BASE + "/app");
  log("reset", await reset(BASE));
  await open(BASE + "/app");
  await waitFor(`document.querySelector('[data-testid=key-count]')?.innerText.includes('2')`);
  setMeta("app", { url: BASE.replace(/^https?:\/\//, "") + "/app", rects: {
    metrics: await rectOf(`document.querySelector('[data-testid=key-count]').closest('section') || document.querySelector('[data-testid=key-count]').parentElement.parentElement.parentElement`),
    keyBtn: await rectOf(`document.querySelector('[data-testid=deploy-key-btn]')`),
    status: await rectOf(`document.querySelector('[data-testid=key-status]')`),
    count: await rectOf(`document.querySelector('[data-testid=key-count]').parentElement`),
    quota: await rectOf(`document.querySelector('[data-testid=quota-balance]').parentElement`),
    table: await rectOf(`document.querySelector('table')`),
  } });
  await rec("app");
  await sleep(1400);
  const accept = byText("button", "Accept");
  if (await js(`!!(${accept})`)) { await press(accept, 900); mark("app.cookies"); }
  await sleep(500);
  mark("app.toKey");
  await press(`document.querySelector('[data-testid=deploy-key-btn]')`, 200);
  mark("app.key");
  await waitFor(`document.querySelector('[data-testid=key-count]')?.innerText.includes('3')`, 15000);
  await sleep(2200);
  mark("app.toTopup");
  await press(`document.querySelector('[data-testid=topup-btn]')`, 200);
  mark("app.topup");
  await waitFor(`document.querySelector('[data-testid=quota-balance]')?.innerText.includes('4,750')`, 15000);
  await sleep(2600);
  await cursorHide();
  await endRec("app");
  await still("app_after");
  log("app status:", await text('[data-testid=key-status]'), await text('[data-testid=key-count]'), await text('[data-testid=quota-balance]'));
  log("reset", await reset(BASE));
};

/** The Revoke button Claude built in the live session (worktree on :3004): revoke KEY-001. */
CLIPS.revoke = async () => {
  await open(WT + "/app");
  log("reset", await reset(WT));
  await open(WT + "/app");
  const btn = `[...document.querySelectorAll('button')].find((e) => (e.getAttribute('aria-label') || '') === 'Revoke KEY-001')`;
  await waitFor(btn);
  const accept = byText("button", "Accept");
  if (await js(`!!(${accept})`)) { await js(`(${accept}).click()`); await sleep(700); }
  setMeta("revoke", { url: "localhost:3004/app", rects: {
    table: await rectOf(`document.querySelector('table')`),
    count: await rectOf(`document.querySelector('[data-testid=key-count]').parentElement`),
    row: await rectOf(`(${btn}).closest('tr')`),
    btn: await rectOf(btn),
  } });
  await rec("revoke");
  await sleep(1600);
  mark("revoke.toBtn");
  await press(btn, 200);
  mark("revoke.click");
  await waitFor(`document.querySelector('[data-testid=key-count]')?.innerText.includes('1')`, 15000);
  await sleep(3000);
  await cursorHide();
  await endRec("revoke");
  await still("revoke_after");
  log("revoke count:", await text('[data-testid=key-count]'));
  log("reset", await reset(WT));
};

/** The landing: hero, then the stacking figure, toggled from regressed to healed. */
CLIPS.hero = async () => {
  await open(BASE + "/", { settle: 5000 });
  setMeta("hero", { url: BASE.replace(/^https?:\/\//, ""), rects: { h1: await rectOf(`document.querySelector('h1')`) } });
  await rec("hero");
  await sleep(2600);
  mark("hero.scroll");
  const y = await docY(`document.getElementById('problem')`);
  await scrollTo(y - 10, 2400);
  await sleep(900);
  setMeta("hero", { rects: { fig: await rectOf(`document.querySelector('#problem svg')?.closest('div[class*=border]') || document.querySelector('#problem svg')`) } });
  mark("hero.fig");
  await press(byText("button", "healed"), 1800);
  mark("hero.healed");
  await press(byText("button", "regressed"), 1800);
  await cursorHide();
  await sleep(600);
  await endRec("hero");
};

/** "Same commit. Two answers." and the bug zoo table, then one "what the user saw" card. */
CLIPS.zoo = async () => {
  await open(BASE + "/", { settle: 5000 });
  const yv = await docY(`document.getElementById('verdicts')`);
  await js(`document.scrollingElement.scrollTop = ${yv - 10}`);
  await sleep(800);
  setMeta("zoo", { url: BASE.replace(/^https?:\/\//, "") + "/#verdicts", rects: { verdicts: await rectOf(`document.getElementById('verdicts')`) } });
  await rec("zoo");
  await sleep(3200);
  mark("zoo.scroll");
  const yc = await docY(`document.getElementById('catalogue')`);
  await scrollTo(yc + 40, 2600);
  await sleep(800);
  setMeta("zoo", { rects: { table: await rectOf(`document.querySelector('#catalogue table') || document.getElementById('catalogue')`) } });
  mark("zoo.table");
  const link = `[...document.querySelectorAll('#catalogue a')].filter((a) => a.textContent.includes('what the user saw'))[0]`;
  const p = await centerOf(link);
  if (p) await glide(p.x, p.y, 1400);
  mark("zoo.hover");
  await sleep(700);
  const href = await js(`(${link})?.href`);
  log("card href", href);
  await endRec("zoo");
  if (href) {
    await open(href, { settle: 2500 });
    await rec("card");
    await sleep(4500);
    await endRec("card");
    setMeta("card", { url: href.replace(/^https?:\/\//, "") });
  }
};

/** The loop section: the real Claude Code session replay, toggled between its three sessions. */
CLIPS.loop = async () => {
  await open(BASE + "/", { settle: 5000 });
  const y = await docY(`document.getElementById('loop')`);
  await js(`document.scrollingElement.scrollTop = ${y - 10}`);
  await sleep(800);
  setMeta("loop", { url: BASE.replace(/^https?:\/\//, "") + "/#loop" });
  await rec("loop");
  await sleep(2400);
  mark("loop.scroll");
  const yt = await docY(byText("div", "a real session"));
  await scrollTo((yt ?? y + 700) - 40, 2600);
  await sleep(1200);
  setMeta("loop", { rects: { replay: await rectOf(`(${byText("div", "a real session")})?.nextElementSibling`) } });
  mark("loop.replay");
  await scrollTo((yt ?? y + 700) + 420, 4200);
  await sleep(1500);
  await cursorHide();
  await endRec("loop");
};

/** The traces page: the NDJSON Kane wrote on the last gate run. */
CLIPS.hud = async () => {
  await open(BASE + "/hud", { settle: 5000 });
  setMeta("hud", { url: BASE.replace(/^https?:\/\//, "") + "/hud" });
  await rec("hud");
  await sleep(2400);
  await scrollTo(520, 3200);
  await sleep(2200);
  await endRec("hud");
};

// ---------------------------------------------------------------- run
const order = Object.keys(CLIPS).filter(want);
b = await launch({ width: VIEW.w, height: VIEW.h, extraArgs: [`--force-device-scale-factor=${SCALE}`] });
await b.send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: SCALE, mobile: false });
const hardStop = setTimeout(() => { log("HARD TIMEOUT"); b.close(); process.exit(2); }, 900_000);
try {
  for (const name of order) {
    log("clip", name);
    try { await CLIPS[name](); } catch (e) { log(`CLIP ${name} FAILED`, e.message); if (stopRec) await endRec(name); }
    save();
  }
} finally {
  save();
  if (b.consoleLines.length) log("console:", b.consoleLines.slice(0, 12).join("\n"));
  clearTimeout(hardStop);
  b.close();
}
