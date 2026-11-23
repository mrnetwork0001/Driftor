/**
 * The bug zoo: one-line UI regressions that a coding agent could plausibly ship.
 * Every one of them leaves the JSDOM unit suite green, because JSDOM has no
 * layout, no stacking, no hit-testing, no stylesheet and (with fetch mocked)
 * no HTTP cache. Only a real browser notices.
 *
 * Each entry is an exact, reversible string swap in the demo app's source.
 * driftor.js uses this to inject and reset; driftor_test.js uses it to record
 * which regression (if any) was live during a gate run.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DASHBOARD = "app/app/CloudScaleDashboard.tsx";

const REGRESSIONS = {
  overlay: {
    title: "Transparent full-screen wrapper takes the clicks",
    story: "The layer that positions the maintenance toast loses pointer-events-none.",
    file: "app/app/MaintenanceNotice.tsx",
    healthy: 'className="pointer-events-none fixed inset-0 z-50"',
    regressed: 'className="fixed inset-0 z-50"',
    expect: { "desktop-occlusion-gate": "failed", "narrow-viewport-gate": "failed" },
  },
  "pointer-events": {
    title: "Loading-state class left on the button",
    story: "pointer-events-none, meant for while a request is in flight, is left on the key button permanently.",
    file: DASHBOARD,
    healthy: 'className="shrink-0 rounded-md bg-cs-brand',
    regressed: 'className="pointer-events-none shrink-0 rounded-md bg-cs-brand',
    expect: { "desktop-occlusion-gate": "failed", "narrow-viewport-gate": "passed" },
  },
  opacity: {
    title: "Closed mobile menu faded out, not removed",
    story: "The mobile menu's closed state keeps opacity-0 but drops invisible, so the see-through panel still catches taps.",
    file: DASHBOARD,
    healthy: ': "invisible opacity-0"',
    regressed: ': "opacity-0"',
    expect: { "desktop-occlusion-gate": "passed", "narrow-viewport-gate": "failed" },
  },
  breakpoint: {
    title: "Top-up link hidden below the lg breakpoint",
    story:
      "Tidying the cramped two-up metric cards, the top-up link gets hidden lg:inline-block. Under 1024px wide there is no way left to top up; JSDOM loads no CSS, so the button is still there.",
    file: DASHBOARD,
    healthy: 'className="mt-1 text-xs font-medium text-cs-brand',
    regressed: 'className="mt-1 hidden lg:inline-block text-xs font-medium text-cs-brand',
    expect: { "desktop-occlusion-gate": "passed", "narrow-viewport-gate": "failed" },
  },
  "stale-cache": {
    title: "Workspace re-read served from the browser cache",
    story:
      "The API helper is “sped up” with cache: \"force-cache\". The write succeeds, but the re-read after it is answered from Chrome's HTTP cache, so the page keeps the old balance and key count. The unit suite mocks fetch, so there is no cache to hit.",
    file: DASHBOARD,
    healthy: 'cache: "no-store"',
    regressed: 'cache: "force-cache"',
    expect: { "desktop-occlusion-gate": "failed", "narrow-viewport-gate": "failed" },
  },
};

const read = (r) => fs.readFileSync(path.join(ROOT, r.file), "utf8");
const write = (r, text) => fs.writeFileSync(path.join(ROOT, r.file), text);

/** Names of the regressions currently present in the source. */
function active() {
  return Object.entries(REGRESSIONS)
    .filter(([, r]) => read(r).includes(r.regressed))
    .map(([name]) => name);
}

/** Returns "injected" | "already" | "missing" (healthy text not found). */
function inject(name) {
  const r = REGRESSIONS[name];
  const src = read(r);
  if (src.includes(r.regressed)) return "already";
  if (!src.includes(r.healthy)) return "missing";
  write(r, src.replace(r.healthy, r.regressed));
  return "injected";
}

/** Reverts every injected regression. Returns the names reverted. */
function resetAll() {
  const reverted = [];
  for (const [name, r] of Object.entries(REGRESSIONS)) {
    const src = read(r);
    if (src.includes(r.regressed)) {
      write(r, src.replace(r.regressed, r.healthy));
      reverted.push(name);
    }
  }
  return reverted;
}

module.exports = { REGRESSIONS, active, inject, resetAll };
