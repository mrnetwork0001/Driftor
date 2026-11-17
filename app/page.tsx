import React from "react";
import { Eye, ShieldAlert, Cpu, RefreshCw, Terminal, Layers, CheckCircle2, ArrowRight, Smartphone, Monitor, AlertOctagon } from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-between overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-fuchsia-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center flex flex-col items-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 text-xs font-semibold mb-6">
          <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
          <span>Built for TestMu AI — Kane CLI Online Hackathon 2026</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.15] max-w-4xl">
          Catching What JSDOM Cannot See:
          <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent block mt-2">
            Autonomous Visual Stacking & Viewport Gate
          </span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl leading-relaxed">
          AI coding agents write code that compiles and passes 100% of unit tests. But in real browsers,
          <strong className="text-white font-semibold"> invisible CSS z-index overlays occlude primary buttons</strong> and
          <strong className="text-white font-semibold"> mobile viewports collapse</strong>.
          <br className="hidden sm:inline" />
          <strong> Driftor</strong> closes this loop with Kane CLI 0.10.x: driving real Chrome across Desktop and Mobile viewports to verify clickability, catch visual drift, and autonomously heal regressions.
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/app"
            className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-fuchsia-500/25 transition-all flex items-center space-x-2"
          >
            <span>Inspect Target App (CloudScale)</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="/hud"
            className="px-6 py-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-700/80 transition-all flex items-center space-x-2"
          >
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Mission Control HUD</span>
          </a>
        </div>

        {/* Fast Judge Reproduction Box */}
        <div className="mt-12 w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-left shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
              <span className="text-xs font-mono text-slate-400 ml-2">Judge 30s Reproduction Terminal</span>
            </div>
            <span className="text-[11px] font-mono text-fuchsia-400 bg-fuchsia-500/10 px-2 py-0.5 rounded border border-fuchsia-500/20">Zero-Config Closed Loop</span>
          </div>
          <pre className="text-xs font-mono text-slate-300 overflow-x-auto space-y-1">
            <span className="text-slate-500"># 1. Start application</span><br />
            <span className="text-cyan-400">npm run dev</span> <span className="text-slate-500"># Running on http://localhost:3000</span><br /><br />
            <span className="text-slate-500"># 2. Inject authentic visual stacking bug (JSDOM tests pass; Chrome click blocked)</span><br />
            <span className="text-cyan-400">npm run driftor:inject</span> <span className="text-slate-500"># Injects floating modal backdrop overlay</span><br /><br />
            <span className="text-slate-500"># 3. Kane CLI drives real Chrome, attempts click, catches OCCLUSION_INTERCEPTED</span><br />
            <span className="text-cyan-400">npm run driftor:test</span> <span className="text-slate-500"># Live Chrome catches intercepted click</span><br /><br />
            <span className="text-slate-500"># 4. Driftor autonomous guardian auto-patches CSS stacking context</span><br />
            <span className="text-cyan-400">npm run driftor:heal</span> <span className="text-slate-500"># Repaired & Kane re-verifies 100% GREEN</span>
          </pre>
        </div>
      </section>

      {/* The 4 Deadly Sins Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            The JSDOM Blind Spot: Why Unit Tests Lie
          </h2>
          <p className="text-slate-400 text-sm mt-2 max-w-2xl mx-auto">
            Traditional test runners execute in synthetic node environments without layout engines.
            Here is what only Kane CLI running in real Chrome can see:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-fuchsia-500/40 transition-all">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 flex items-center justify-center mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">1. CSS Stacking Context Occlusion</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              An AI agent adds a floating banner or cookie toast. Its transparent container has <code className="text-fuchsia-300">z-index: 50</code>, intercepting clicks meant for the primary CTA underneath. JSDOM fires the click; real users hit a wall.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/40 transition-all">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">2. Mobile Viewport Collapse</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              A UI designed for 1920px desktops collapses on a 375px mobile viewport. Fixed elements overlap inputs or trigger <code className="text-cyan-300">overflow: hidden</code>, rendering key checkout paths unreachable.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/40 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">3. Autonomous Self-Healing</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Driftor translates Kane&apos;s NDJSON bounding-box failure into AST source modifications, fixing stacking contexts and pointer-event traps before re-testing green.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 py-6 mt-12 bg-slate-950/60">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 space-y-2 sm:space-y-0">
          <div>Driftor © 2026. Built by mrnetwork for the Kane CLI Online Hackathon.</div>
          <div className="flex items-center space-x-4">
            <a href="https://kaneclihack.sh" target="_blank" rel="noreferrer" className="hover:text-slate-300">kaneclihack.sh</a>
            <a href="https://luma.com/kanecli-online-hackathon" target="_blank" rel="noreferrer" className="hover:text-slate-300">Luma Event</a>
            <a href="https://testmuai.com" target="_blank" rel="noreferrer" className="hover:text-slate-300">TestMu AI</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
