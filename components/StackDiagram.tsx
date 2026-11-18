"use client";

import { useState } from "react";

/*
 * Exploded isometric view of the page's stacking order.
 * A click ray falls from the cursor toward the CTA. With the regression,
 * it lands on the invisible z-50 wrapper; once healed, it reaches the button.
 */

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const OX = 190;
const OY = 225;

const W = 320; // plane width (x)
const D = 200; // plane depth (y)

function iso(x: number, y: number, z: number): [number, number] {
  return [OX + (x - y) * COS, OY + (x + y) * SIN - z];
}

function quad(x0: number, y0: number, x1: number, y1: number, z: number) {
  return [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)]
    .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
    .join(" ");
}

const Z_PAGE = 0;
const Z_WRAP = 110;
const Z_TOAST = 170;
const Z_CURSOR = 300;

// The CTA sits on the page plane.
const BTN = { x0: 190, y0: 120, x1: 290, y1: 150 };
const BX = (BTN.x0 + BTN.x1) / 2;
const BY = (BTN.y0 + BTN.y1) / 2;

export default function StackDiagram() {
  const [healed, setHealed] = useState(false);

  const [cx, cyTop] = iso(BX, BY, Z_CURSOR);
  const [, cyWrap] = iso(BX, BY, Z_WRAP);
  const [, cyBtn] = iso(BX, BY, Z_PAGE);

  const labelX = 560;
  const leader = (from: [number, number], y: number) =>
    `${from[0].toFixed(1)},${from[1].toFixed(1)} ${labelX - 12},${y}`;

  return (
    <figure className="border border-ink bg-sheet">
      <div className="flex items-center justify-between gap-3 border-b border-ink px-4 py-2 text-xs font-mono">
        <span className="text-graphite">
          fig. 1<span className="hidden sm:inline"> — /app, stacking order at the click point</span>
        </span>
        <div className="flex border border-ink" role="group" aria-label="Diagram state">
          <button
            onClick={() => setHealed(false)}
            className={`px-2.5 py-0.5 ${!healed ? "bg-ink text-sheet" : "text-graphite hover:text-ink"}`}
          >
            regressed
          </button>
          <button
            onClick={() => setHealed(true)}
            className={`px-2.5 py-0.5 border-l border-ink ${healed ? "bg-ink text-sheet" : "text-graphite hover:text-ink"}`}
          >
            healed
          </button>
        </div>
      </div>

      <svg viewBox="0 0 760 500" className="w-full h-auto block" role="img" aria-label={healed ? "The click passes through to the button" : "The click is caught by an invisible full-screen wrapper"}>
        {/* page plane */}
        <polygon points={quad(0, 0, W, D, Z_PAGE)} fill="#FAF9F6" stroke="#17160F" strokeWidth="1.25" />
        {/* faux page content */}
        {[40, 62, 84].map((y) => (
          <polygon key={y} points={quad(24, y, y === 40 ? 150 : 120, y + 10, Z_PAGE)} fill="#D8D3C8" />
        ))}
        <polygon points={quad(24, 170, 296, 184, Z_PAGE)} fill="#E7E3DA" />
        {/* the CTA */}
        <polygon
          points={quad(BTN.x0, BTN.y0, BTN.x1, BTN.y1, Z_PAGE)}
          fill={healed ? "#2E6B46" : "#17160F"}
          stroke="#17160F"
          strokeWidth="1"
        />

        {/* invisible full-screen wrapper */}
        <polygon
          points={quad(0, 0, W, D, Z_WRAP)}
          fill={healed ? "none" : "rgba(217,65,47,0.06)"}
          stroke={healed ? "#9A958A" : "#D9412F"}
          strokeWidth="1.25"
          strokeDasharray="5 4"
        />

        {/* maintenance toast */}
        <polygon points={quad(200, 10, 300, 56, Z_TOAST)} fill="#FAF9F6" stroke="#17160F" strokeWidth="1.25" />
        <polygon points={quad(210, 22, 280, 28, Z_TOAST)} fill="#17160F" />
        <polygon points={quad(210, 36, 290, 40, Z_TOAST)} fill="#D8D3C8" />

        {/* click ray */}
        {healed ? (
          <>
            <line x1={cx} y1={cyTop + 14} x2={cx} y2={cyBtn} stroke="#2E6B46" strokeWidth="1.5" className="ray" />
            <circle cx={cx} cy={cyBtn} r="5" fill="none" stroke="#2E6B46" strokeWidth="1.5" className="impact" />
          </>
        ) : (
          <>
            <line x1={cx} y1={cyTop + 14} x2={cx} y2={cyWrap} stroke="#D9412F" strokeWidth="1.5" className="ray" />
            <line x1={cx} y1={cyWrap + 6} x2={cx} y2={cyBtn} stroke="#9A958A" strokeWidth="1" strokeDasharray="2 4" />
            <circle cx={cx} cy={cyWrap} r="5" fill="none" stroke="#D9412F" strokeWidth="1.5" className="impact" />
            <path
              d={`M${cx - 5},${cyWrap - 5} L${cx + 5},${cyWrap + 5} M${cx + 5},${cyWrap - 5} L${cx - 5},${cyWrap + 5}`}
              stroke="#D9412F"
              strokeWidth="1.75"
            />
          </>
        )}

        {/* cursor */}
        <path
          d={`M${cx},${cyTop - 6} l0,18 l4.5,-4.5 l3,7 l2.6,-1.1 l-3,-6.8 l6.3,0 z`}
          fill="#FAF9F6"
          stroke="#17160F"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />

        {/* leaders + labels */}
        <g fontFamily="var(--font-mono)" fontSize="12" fill="#17160F">
          <polyline points={leader(iso(300, 10, Z_TOAST), 70)} fill="none" stroke="#9A958A" strokeWidth="1" />
          <text x={labelX} y={66}>div.toast</text>
          <text x={labelX} y={82} fill="#5F5B52">z-50 · visible</text>

          <polyline points={leader(iso(W, 0, Z_WRAP), 170)} fill="none" stroke={healed ? "#9A958A" : "#D9412F"} strokeWidth="1" />
          <text x={labelX} y={166} fill={healed ? "#17160F" : "#D9412F"}>div.fixed.inset-0</text>
          <text x={labelX} y={182} fill="#5F5B52">
            {healed ? "pointer-events: none" : "z-50 · transparent"}
          </text>
          {!healed && (
            <text x={labelX} y={198} fill="#D9412F">
              ← receives the click
            </text>
          )}

          <polyline points={leader(iso(BTN.x1, BTN.y0, Z_PAGE), 300)} fill="none" stroke="#9A958A" strokeWidth="1" />
          <text x={labelX} y={296}>button#deploy-key-btn</text>
          <text x={labelX} y={312} fill={healed ? "#2E6B46" : "#5F5B52"}>
            {healed ? "← receives the click" : "never sees the event"}
          </text>

          <text x={labelX} y={440} fill="#5F5B52">JSDOM: no layout,</text>
          <text x={labelX} y={456} fill="#5F5B52">no hit-testing —</text>
          <text x={labelX} y={472} fill="#5F5B52">both states pass.</text>
        </g>
      </svg>
    </figure>
  );
}
