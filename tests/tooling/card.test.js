/**
 * "What the user saw" cards (lib/card.js): which step, which screenshot and
 * which element box a card shows, read from a Kane evidence pack, and where
 * the card shows up (heal prompt, PR comment). Rendering needs Chrome and is
 * not tested here.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { afterEach, describe, it } = require("node:test");
const { readZip, imageSize, findPack, readPack, selectEvidence, layout, describeObjective } = require("../../lib/card");
const { buildHealPrompt } = require("../../lib/heal");
const { renderComment } = require("../../scripts/ci");

const FAILING_RUN = path.join(__dirname, "..", "..", "kane-traces", "runs", "2026-11-18T08-00-54-950Z");

/** A minimal zip (deflate) writer, enough to build an evidence pack. */
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const packed = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

/** PNG header bytes for a w x h image (enough for imageSize). */
function pngHeader(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

const CLICK = "e5de41d3";
const step = (ordinal, status, kind, summary, extra = {}) => ({ ordinal, id: `0-${ordinal}`, status, kind, summary, actionId: null, rect: null, screenshot: `s${ordinal}.jpg`, ...extra });

// The pointer-events failure as Kane 0.10.5 records it: the click passes, the wait after it fails.
const POINTER_EVENTS = [
  step(1, "passed", "navigate", "navigate: Navigate to http://localhost:3002/app"),
  step(2, "passed", "assert", 'assert: Active keys reads "2 Keys"'),
  step(3, "passed", "click", "click: Clicking Generate Production API Key button", { actionId: CLICK, rect: { x: 1142, y: 305, width: 186, height: 20 } }),
  step(4, "failed", "", "wait: Waiting stop after the required button click did not reach its target", { actionId: CLICK }),
];
const VISUAL = new Map([[CLICK, { x: 1235, y: 315, bbox: { x: 1142, y: 305, width: 186, height: 20 }, viewport_width: 1920, viewport_height: 1080, type: "click" }]]);
const EVENTS = [
  { step: 2, status: "done", remark: "navigate: Navigate to http://localhost:3002/app" },
  { step: 5, status: "failed", remark: "wait: Waiting stop after the required button click did not reach its target" },
];

describe("card: choosing the step, screenshot and element", () => {
  it("shows the failing step's screenshot and outlines the click before it", () => {
    const sel = selectEvidence(POINTER_EVENTS, { visual: VISUAL, events: EVENTS });
    assert.equal(sel.failing.ordinal, 4);
    assert.equal(sel.screenshot.ordinal, 4);
    assert.equal(sel.ndjsonStep, 5, "numbered as in the NDJSON trace / heal prompt");
    assert.equal(sel.target.kind, "click");
    assert.equal(sel.target.step.ordinal, 3, "credited to the click, not the wait that shares its action id");
    assert.equal(sel.target.ndjsonStep, 4);
    assert.deepEqual(sel.target.point, { x: 1235, y: 315 });
    assert.deepEqual(sel.target.rect, { x: 1142, y: 305, width: 186, height: 20 });
    assert.deepEqual(sel.target.viewport, { width: 1920, height: 1080 });
  });

  it("finds the click just before a failing step that has no action of its own", () => {
    const steps = POINTER_EVENTS.map((s) => (s.ordinal === 4 ? { ...s, actionId: "other" } : s));
    const sel = selectEvidence(steps, { visual: VISUAL, events: EVENTS });
    assert.equal(sel.target.step.ordinal, 3);
    // Without the action log, the step's own element_rect still gives the box (no click point).
    const bare = selectEvidence(steps, { events: EVENTS });
    assert.deepEqual(bare.target.rect, { x: 1142, y: 305, width: 186, height: 20 });
    assert.equal(bare.target.point, null);
  });

  it("outlines nothing when Kane never acted (it judged the button covered)", () => {
    const overlay = [POINTER_EVENTS[0], POINTER_EVENTS[1], step(3, "failed", "", "wait: Waiting do not click the covered button")];
    const sel = selectEvidence(overlay, { visual: VISUAL, events: [] });
    assert.equal(sel.failing.ordinal, 3);
    assert.equal(sel.target, null);
    assert.equal(sel.ndjsonStep, 3, "falls back to the pack ordinal without NDJSON step events");
  });

  it("uses the nearest earlier screenshot when the failing step has none", () => {
    const steps = [step(1, "passed", "navigate", "a"), step(2, "passed", "assert", "b", { screenshot: null }), step(3, "broken", "assert", "c", { screenshot: null })];
    const sel = selectEvidence(steps);
    assert.equal(sel.failing.ordinal, 3, "broken counts as failing");
    assert.equal(sel.screenshot.ordinal, 1);
  });

  it("falls back to the last step when no step is marked failed, and to null for no steps", () => {
    const steps = [step(1, "passed", "navigate", "a"), step(2, "passed", "assert", "b")];
    assert.equal(selectEvidence(steps).failing.ordinal, 2);
    assert.equal(selectEvidence([]), null);
  });

  it("does not reach further back than two steps for the element", () => {
    const steps = [POINTER_EVENTS[2], step(4, "passed", "assert", "x"), step(5, "passed", "assert", "y"), step(6, "failed", "assert", "z")];
    assert.equal(selectEvidence(steps, { visual: VISUAL }).target, null);
  });
});

describe("card: layout", () => {
  it("maps CSS px to a 2x screenshot and into the card", () => {
    const sel = selectEvidence(POINTER_EVENTS, { visual: VISUAL, events: EVENTS });
    const lay = layout({ imgW: 3840, imgH: 2160, target: sel.target, viewport: { width: 1920, height: 1080 } });
    assert.equal(lay.portrait, false);
    assert.equal(lay.shot.w, 1152);
    const s = 1152 / 3840;
    assert.ok(Math.abs(lay.box.x - 1142 * 2 * s) < 0.01);
    assert.ok(Math.abs(lay.dot.y - 315 * 2 * s) < 0.01);
    // The zoom keeps the click point inside the inset.
    assert.ok(lay.zoom.dot.x > 0 && lay.zoom.dot.x < lay.zoom.w && lay.zoom.dot.y > 0 && lay.zoom.dot.y < lay.zoom.h);
  });

  it("puts a narrow screenshot beside the text", () => {
    const lay = layout({ imgW: 1600, imgH: 2000, target: null, viewport: { width: 800, height: 1000 } });
    assert.equal(lay.portrait, true);
    assert.equal(lay.zoom, null);
    assert.ok(lay.shot.w + lay.side.w < 1200);
  });
});

describe("card: reading an evidence pack", () => {
  let dir;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reads steps, screenshots and the action log from the pack in the run folder", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-card-"));
    const t = "tests/open-app-87789754";
    const pack = zip({
      "run.yaml": "evidence: '0.1'\n",
      [`${t}/steps/1-0-1/step.json`]: JSON.stringify({ kind: "navigate", status: "passed", summary: "navigate: Navigate", ordinal: 1, id: "0-1", url: "http://localhost:3002/app" }),
      [`${t}/steps/1-0-1/screenshot.jpg`]: pngHeader(3840, 2160),
      [`${t}/steps/2-0-2/step.json`]: JSON.stringify({ kind: "click", status: "passed", summary: "click: Clicking Generate", action_id: CLICK, element_rect: { x: 1142, y: 305, width: 186, height: 20 }, ordinal: 2, id: "0-2" }),
      [`${t}/steps/2-0-2/screenshot.jpg`]: pngHeader(3840, 2160),
      [`${t}/steps/3-0-3/step.json`]: JSON.stringify({ kind: "", status: "failed", summary: "wait: Waiting stop", action_id: CLICK, ordinal: 3, id: "0-3" }),
      [`${t}/steps/3-0-3/screenshot.jpg`]: pngHeader(3840, 2160),
      [`${t}/logs/0-actions.ndjson`]: `${JSON.stringify({ action_id: CLICK, action_type: "click", visual_data: { x: 1235, y: 315, bbox: { x: 1142, y: 305, width: 186, height: 20 }, viewport_width: 1920, viewport_height: 1080 } })}\n`,
    });
    fs.mkdirSync(path.join(dir, "evidence"));
    fs.writeFileSync(path.join(dir, "evidence", "desktop.evidence"), pack);

    const file = findPack(dir, "desktop", [{ type: "recording_state", session_id: "not-on-this-machine" }]);
    assert.equal(file, path.join(dir, "evidence", "desktop.evidence"));
    const { zip: z, steps, visual } = readPack(file);
    assert.deepEqual(steps.map((s) => [s.ordinal, s.status, s.kind]), [[1, "passed", "navigate"], [2, "passed", "click"], [3, "failed", ""]]);
    assert.equal(visual.get(CLICK).x, 1235);
    const sel = selectEvidence(steps, { visual, events: [{ step: 4, status: "failed", remark: "wait: Waiting stop" }] });
    assert.equal(sel.screenshot.screenshot, `${t}/steps/3-0-3/screenshot.jpg`);
    assert.deepEqual(imageSize(z.read(sel.screenshot.screenshot)), { width: 3840, height: 2160, type: "png" });
    assert.equal(sel.target.step.ordinal, 2);
    assert.equal(sel.ndjsonStep, 4);
  });

  it("finds no pack when nothing points to one", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftor-card-"));
    process.env.KANE_SESSIONS_DIR = dir;
    try {
      assert.equal(findPack(dir, "x", [{ type: "recording_state", session_id: "missing" }]), null);
    } finally {
      delete process.env.KANE_SESSIONS_DIR;
    }
  });

  it("rejects a file that isn't a zip", () => {
    assert.throws(() => readZip(Buffer.from("not a zip at all, just text that is long enough")), /not a zip/);
  });

  it("labels gate objectives and derived acceptance checks", () => {
    const run = { unit: { passed: true }, objectives: { desk: { title: "Desktop", viewport: "1920x1080" } }, acceptance: { checks: { "t-1": { title: "Revoke", viewport: "1920x1080" } } } };
    assert.deepEqual(describeObjective(run, "desk"), { title: "Desktop", viewport: "1920x1080", derived: false, unit: { passed: true } });
    assert.equal(describeObjective(run, "task-t-1").derived, true);
    assert.equal(describeObjective(null, "x").title, "x");
  });
});

describe("card: where it shows up", () => {
  const findings = [
    { trace: "desktop.ndjson", step: 5, summary: "wait: covered", raw: "{}" },
    { trace: "desktop.ndjson", step: null, summary: "analysis", raw: "{}" },
    { trace: "narrow.ndjson", step: 6, summary: "wait: missed", raw: "{}" },
  ];

  it("points Claude at the card once per trace in the heal prompt", () => {
    const prompt = buildHealPrompt(findings, { cards: { "desktop.ndjson": "/abs/run/card-desktop.png" } });
    const line = "    Screenshot of what the user saw: /abs/run/card-desktop.png. Read it.";
    assert.equal(prompt.split("\n").filter((l) => l === line).length, 1);
    // After the trace's last finding, before the next trace.
    const lines = prompt.split("\n");
    assert.ok(lines.indexOf(line) < lines.findIndex((l) => l.startsWith("- [narrow.ndjson]")));
    assert.ok(lines.indexOf(line) > lines.lastIndexOf("- [desktop.ndjson]"));
    assert.match(prompt, /A red box\nmarks the element Kane clicked/);
  });

  it("leaves the heal prompt unchanged without cards", () => {
    assert.equal(buildHealPrompt(findings), buildHealPrompt(findings, { cards: {} }));
    assert.doesNotMatch(buildHealPrompt(findings), /Screenshot of what the user saw/);
  });

  it("embeds a committed card in the PR comment, or links the artifact", () => {
    assert.ok(fs.existsSync(path.join(FAILING_RUN, "card-desktop-occlusion-gate.png")), "the archived failing run has its card");
    const embedded = renderComment(FAILING_RUN, { artifactUrl: "https://example.test/run/1", cardUrl: (f) => `https://raw.example.test/${path.basename(f)}` });
    assert.ok(embedded.includes("![What the user saw: desktop-occlusion-gate](https://raw.example.test/card-desktop-occlusion-gate.png)"));
    assert.ok(embedded.includes("![What the user saw: narrow-viewport-gate](https://raw.example.test/card-narrow-viewport-gate.png)"));

    const linked = renderComment(FAILING_RUN, { artifactUrl: "https://example.test/run/1" });
    assert.doesNotMatch(linked, /!\[What the user saw/);
    assert.ok(linked.includes("What the user saw: `card-desktop-occlusion-gate.png` in the [run artifact](https://example.test/run/1)"));
  });
});
