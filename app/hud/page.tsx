"use client";

import React, { useState } from "react";
import {
  Terminal,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  RefreshCw,
  Cpu,
  Layers,
  CheckCircle2,
  Smartphone,
  Monitor,
  Eye,
  Code2
} from "lucide-react";

interface NDJSONEvent {
  id: string;
  timestamp: string;
  viewport: "desktop" | "mobile";
  type: "stream_start" | "step" | "hit_test" | "healing" | "verdict";
  status: "pass" | "fail" | "running" | "info";
  message: string;
  details?: string;
}

export default function MissionControlHUD() {
  const [activeTab, setActiveTab] = useState<"stream" | "stacking" | "diff">("stream");
  const [activeViewport, setActiveViewport] = useState<"desktop" | "mobile">("desktop");
  const [gateStatus, setGateStatus] = useState<"VERIFIED" | "OCCLUDED" | "HEALING" | "RUNNING">("VERIFIED");

  const [events, setEvents] = useState<NDJSONEvent[]>([
    {
      id: "EVT-301",
      timestamp: "12:00:01",
      viewport: "desktop",
      type: "stream_start",
      status: "info",
      message: "Driftor Kane-CLI Gate initialized (Chrome 1920x1080, runtime: driftor-guardian)",
      details: "PRD spec linked: specs/PRD.md. Visual bounds computed for [data-testid='deploy-key-btn'].",
    },
    {
      id: "EVT-302",
      timestamp: "12:00:03",
      viewport: "desktop",
      type: "step",
      status: "pass",
      message: "Navigated to http://localhost:3000/app -> Target element verified in viewport",
      details: "Bounding box: { x: 840, y: 195, width: 242, height: 48 }. Hit test: unoccluded.",
    },
    {
      id: "EVT-303",
      timestamp: "12:00:05",
      viewport: "desktop",
      type: "hit_test",
      status: "pass",
      message: "Click dispatched to [data-testid='deploy-key-btn'] -> Successfully received by button",
      details: "DOM mutation: Key count incremented to 3. Status flipped to KEY_GENERATED_HEALTHY.",
    },
    {
      id: "EVT-304",
      timestamp: "12:00:07",
      viewport: "desktop",
      type: "verdict",
      status: "pass",
      message: "Kane CLI Execution Verdict: 100% GREEN (Sealed trace: kane-traces/desktop-gate.ndjson)",
      details: "All CTAs unobstructed across Desktop and Mobile viewports.",
    },
  ]);

  const simulateRun = (mode: "inject" | "verify" | "heal") => {
    const ts = new Date().toLocaleTimeString();

    if (mode === "inject") {
      setGateStatus("OCCLUDED");
      setEvents((prev) => [
        {
          id: `EVT-${Date.now().toString().slice(-4)}`,
          timestamp: ts,
          viewport: activeViewport,
          type: "healing",
          status: "info",
          message: "[FAULT INJECTED] driftor.js --inject modified lib/visual-drift.ts",
          details: "Set BANNER_OCCLUSION = true. Floating modal backdrop overlay now traps pointer-events over primary CTA.",
        },
        ...prev,
      ]);
    } else if (mode === "verify") {
      setGateStatus("RUNNING");
      setTimeout(() => {
        setEvents((prev) => [
          {
            id: `EVT-${Date.now().toString().slice(-4)}`,
            timestamp: new Date().toLocaleTimeString(),
            viewport: activeViewport,
            type: "hit_test",
            status: "fail",
            message: "FAIL: Click intercepted by [data-testid='occlusion-backdrop'] at coordinates (840, 195)",
            details: "ElementFromPoint returned DIV#occlusion-backdrop (z-index: 50). Primary CTA [deploy-key-btn] was occluded!",
          },
          ...prev,
        ]);
        setGateStatus("OCCLUDED");
      }, 700);
    } else if (mode === "heal") {
      setGateStatus("HEALING");
      setTimeout(() => {
        setEvents((prev) => [
          {
            id: `EVT-${Date.now().toString().slice(-4)}`,
            timestamp: new Date().toLocaleTimeString(),
            viewport: activeViewport,
            type: "healing",
            status: "pass",
            message: "[AUTONOMOUS HEALING] driftor --heal restored lib/visual-drift.ts",
            details: "Restored BANNER_OCCLUSION = false. Hot-reloaded Next.js dev server. Kane re-run passed 100% GREEN.",
          },
          ...prev,
        ]);
        setGateStatus("VERIFIED");
      }, 1200);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Driftor Mission Control HUD
            </h1>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Real-Time Kane NDJSON Telemetry Stream & Visual Stacking Gate Inspector.
          </p>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                gateStatus === "VERIFIED"
                  ? "bg-emerald-400"
                  : gateStatus === "OCCLUDED"
                  ? "bg-rose-400"
                  : "bg-amber-400"
              }`}
            />
            <span className="text-slate-400">Gate Status:</span>
            <span
              className={`font-bold ${
                gateStatus === "VERIFIED"
                  ? "text-emerald-400"
                  : gateStatus === "OCCLUDED"
                  ? "text-rose-400"
                  : "text-amber-400"
              }`}
            >
              {gateStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Control Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-mono">Assurance Engine</span>
            <div className="text-sm font-bold text-white mt-1">Kane CLI 0.10.x</div>
          </div>
          <Cpu className="w-5 h-5 text-fuchsia-400" />
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-mono">Tested Viewports</span>
            <div className="text-sm font-bold text-cyan-400 mt-1">Desktop & Mobile (375px)</div>
          </div>
          <Smartphone className="w-5 h-5 text-cyan-400" />
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-mono">Stacking Contexts</span>
            <div className="text-sm font-bold text-emerald-400 mt-1">Computed Hit-Testing</div>
          </div>
          <Layers className="w-5 h-5 text-emerald-400" />
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-mono">Sealed Evidence</span>
            <div className="text-sm font-bold text-purple-400 mt-1">kane-traces/*.ndjson</div>
          </div>
          <ShieldCheck className="w-5 h-5 text-purple-400" />
        </div>
      </div>

      {/* Simulator Actions */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-mono text-slate-300">Live Simulator (or execute CLI in terminal)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => simulateRun("inject")}
            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-mono border border-amber-500/30 transition-all flex items-center space-x-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Simulate Stacking Bug (--inject)</span>
          </button>

          <button
            onClick={() => simulateRun("verify")}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-mono border border-rose-500/30 transition-all flex items-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simulate Kane Catch (--verify)</span>
          </button>

          <button
            onClick={() => simulateRun("heal")}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-mono border border-emerald-500/30 transition-all flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Simulate Self-Heal (--heal)</span>
          </button>
        </div>
      </div>

      {/* Main Stream Inspector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setActiveTab("stream")}
              className={`text-xs font-mono pb-1 border-b-2 transition-all ${
                activeTab === "stream"
                  ? "border-fuchsia-500 text-white font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              NDJSON Event Stream ({events.length})
            </button>
            <button
              onClick={() => setActiveTab("stacking")}
              className={`text-xs font-mono pb-1 border-b-2 transition-all ${
                activeTab === "stacking"
                  ? "border-fuchsia-500 text-white font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Computed Stacking Context Hierarchy
            </button>
            <button
              onClick={() => setActiveTab("diff")}
              className={`text-xs font-mono pb-1 border-b-2 transition-all ${
                activeTab === "diff"
                  ? "border-fuchsia-500 text-white font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Self-Healing CSS Diff
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500">Live Kane Stream</span>
        </div>

        {activeTab === "stream" && (
          <div className="space-y-3 font-mono text-xs">
            {events.map((evt) => (
              <div
                key={evt.id}
                className={`p-3 rounded-xl border transition-all ${
                  evt.status === "pass"
                    ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
                    : evt.status === "fail"
                    ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                    : "bg-slate-950/60 border-slate-800 text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-500">{evt.timestamp}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-cyan-400">
                      {evt.viewport}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                        evt.status === "pass"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : evt.status === "fail"
                          ? "bg-rose-500/20 text-rose-400"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {evt.type}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">{evt.id}</span>
                </div>
                <div className="font-semibold text-slate-100">{evt.message}</div>
                {evt.details && (
                  <div className="text-[11px] text-slate-400 mt-1 pl-2 border-l border-slate-700">
                    {evt.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "stacking" && (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="text-slate-300 font-bold border-b border-slate-800 pb-2">
                CSS Computed Hit-Testing Hierarchy (Desktop 1920x1080)
              </h4>
              <div className="space-y-2">
                <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-center justify-between">
                  <span>Layer 1 (Top): div[data-testid=&apos;occlusion-backdrop&apos;]</span>
                  <span className="font-bold">z-index: 50 | pointer-events: auto</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-between ml-4">
                  <span>Layer 2 (Occluded): button[data-testid=&apos;deploy-key-btn&apos;]</span>
                  <span className="font-bold">z-index: 10 | coordinates: (840, 195)</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                JSDOM cannot see this hierarchy because it does not render layout boxes.
                Kane CLI drives real Chrome and detects that document.elementFromPoint(840, 195) returns Layer 1 instead of Layer 2!
              </p>
            </div>
          </div>
        )}

        {activeTab === "diff" && (
          <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs border border-slate-800 space-y-1">
            <div className="text-slate-500 pb-2 border-b border-slate-800 mb-2">
              diff --git a/lib/visual-drift.ts b/lib/visual-drift.ts
            </div>
            <div className="text-slate-400">@@ -22,4 +22,4 @@</div>
            <div className="text-rose-400 bg-rose-950/40 px-1 rounded">- export const BANNER_OCCLUSION = true;  // REGRESSION: Modal backdrop blocks clicks</div>
            <div className="text-emerald-400 bg-emerald-950/40 px-1 rounded">+ export const BANNER_OCCLUSION = false; // HEALED: Stacking context cleared</div>
            <div className="text-slate-400 mt-3 pt-3 border-t border-slate-800 text-[11px]">
              Kane Verified: All buttons reachable across Chrome Desktop & Mobile viewports.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
