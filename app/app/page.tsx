"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import { BANNER_OCCLUSION } from "@/lib/visual-drift";
import {
  Key,
  ShieldCheck,
  AlertTriangle,
  Server,
  Zap,
  Plus,
  RefreshCw,
  Cpu,
  Layers,
  CheckCircle2,
  Lock,
  ExternalLink,
  Smartphone,
  Monitor
} from "lucide-react";

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  created: string;
  rateLimit: string;
  status: "active" | "revoked";
}

export default function CloudScaleApp() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([
    {
      id: "KEY-001",
      name: "Production LLM Routing Gateway",
      prefix: "cs_live_9a7f...",
      created: "2026-11-15",
      rateLimit: "10,000 req/min",
      status: "active",
    },
    {
      id: "KEY-002",
      name: "Staging Kane CLI Automated Verifier",
      prefix: "cs_test_3b2e...",
      created: "2026-11-17",
      rateLimit: "2,500 req/min",
      status: "active",
    },
  ]);

  const [quotaBalance, setQuotaBalance] = useState<number>(4500);
  const [lastActionStatus, setLastActionStatus] = useState<string>("SYSTEM_READY");

  // Handler for primary CTA: Generate Production API Key
  const handleGenerateKey = () => {
    const newKey: ApiKeyRecord = {
      id: `KEY-00${keys.length + 1}`,
      name: `Production Agent Fleet Key #${keys.length + 1}`,
      prefix: `cs_live_${Math.random().toString(36).slice(2, 6)}...`,
      created: new Date().toISOString().split("T")[0],
      rateLimit: "15,000 req/min",
      status: "active",
    };

    setKeys([newKey, ...keys]);
    setLastActionStatus("KEY_GENERATED_HEALTHY");

    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
    });
  };

  // Handler for Quota Top-Up
  const handleTopup = () => {
    setQuotaBalance((prev) => prev + 250);
    setLastActionStatus("QUOTA_TOPUP_SUCCESS");
  };

  return (
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Visual Occlusion Regression Layer (Active when BANNER_OCCLUSION is true) */}
      {BANNER_OCCLUSION && (
        <div
          data-testid="occlusion-backdrop"
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[1px] pointer-events-auto flex items-start justify-center pt-20 px-4"
        >
          <div className="max-w-lg w-full bg-rose-950/95 border-2 border-rose-500 rounded-2xl p-5 shadow-2xl glow-rose text-rose-100">
            <div className="flex items-center space-x-3 mb-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h3 className="font-bold text-sm">EMERGENCY CLOUD MAINTENANCE ANNOUNCEMENT</h3>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              Global API gateway nodes are undergoing hot-patching.
              <br />
              <strong className="text-rose-300">
                [DRIFTOR DETECTED BUG: This modal backdrop has pointer-events-auto and z-index:50, intercepting clicks meant for the page below!]
              </strong>
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              CloudScale AI Inference Gateway
            </h1>
            <span className="px-2 py-0.5 text-xs font-mono bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 rounded">
              Protected by Driftor
            </span>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Enterprise Model Routing & Production API Key Provisioning.
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center space-x-3">
          <div
            data-testid="key-status"
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs flex items-center space-x-2"
          >
            <span className={`w-2 h-2 rounded-full ${lastActionStatus === "KEY_GENERATED_HEALTHY" ? "bg-emerald-400 animate-pulse" : "bg-cyan-400"}`} />
            <span className="text-slate-400">Action Status:</span>
            <span className="font-bold text-slate-200">{lastActionStatus}</span>
          </div>
        </div>
      </div>

      {/* Primary Action Hero Bar */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-xs uppercase font-mono tracking-wider text-fuchsia-400 font-semibold">
            Primary Production Workflow
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            Provision High-Throughput API Credentials
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Generates a dedicated TLS-encrypted API token with zero rate-limit throttling across US and EU edge clusters.
          </p>
        </div>

        {/* PRIMARY CTA BUTTON (The element tested by Kane CLI) */}
        <button
          onClick={handleGenerateKey}
          data-testid="deploy-key-btn"
          className="relative px-6 py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-fuchsia-600/25 transition-all flex items-center justify-center space-x-2 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Production API Key</span>
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-mono text-slate-400">Active API Keys</span>
            <Key className="w-4 h-4 text-fuchsia-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono mt-3" data-testid="key-count">
            {keys.length} Keys
          </div>
          <div className="text-[11px] text-slate-500 mt-1">100% Validated in Chrome</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-mono text-slate-400">Available Quota</span>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono mt-3" data-testid="quota-balance">
            ${quotaBalance.toLocaleString()}.00
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <button
              onClick={handleTopup}
              data-testid="topup-btn"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
            >
              <span>+ Top Up Quota ($250)</span>
            </button>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-mono text-slate-400">Driftor Health</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono mt-3 text-emerald-400">
            {BANNER_OCCLUSION ? "OCCLUDED" : "UNOBSTRUCTED"}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {BANNER_OCCLUSION ? "Click intercepted by overlay" : "All CTAs Clickable & Verified"}
          </div>
        </div>
      </div>

      {/* Active API Keys Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base text-white">Active Key Registry</h3>
          <span className="text-xs text-slate-400 font-mono">Live Invariant Ledger</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 font-semibold">Key ID</th>
                <th className="pb-3 font-semibold">Name</th>
                <th className="pb-3 font-semibold">Prefix</th>
                <th className="pb-3 font-semibold">Rate Limit</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 font-bold text-fuchsia-400">{k.id}</td>
                  <td className="py-3 text-slate-200">{k.name}</td>
                  <td className="py-3 text-slate-400">{k.prefix}</td>
                  <td className="py-3 text-slate-300">{k.rateLimit}</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {k.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
