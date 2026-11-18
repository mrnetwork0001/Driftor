"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { formatUsd, TOPUP_CENTS, type ActivityEntry, type CloudScaleState } from "@/lib/cloudscale";
import CookieConsent from "./CookieConsent";
import MaintenanceNotice from "./MaintenanceNotice";

/*
 * CloudScale — the demo target that Driftor guards. State lives server-side
 * in /api/cloudscale. Kane objectives, tests/*_test.md and tests/unit depend on:
 *   key-status    SYSTEM_READY | KEY_GENERATED_HEALTHY | QUOTA_TOPUP_SUCCESS  (label "Action status")
 *   key-count     "N Keys"
 *   quota-balance "$4,500.00"  (label "Available quota")
 *   deploy-key-btn "Generate Production API Key"
 *   topup-btn     "+ Top Up Quota ($250)"
 *   heading       "CloudScale AI Inference Gateway"
 * Keep those labels unique on the page: Kane finds controls by their text.
 */

const NAV = [
  { id: "keys", label: "API keys" },
  { id: "quota", label: "Quota" },
  { id: "activity", label: "Activity" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 13a4 4 0 0 1 3.2-3.9A5 5 0 0 1 16 10a3 3 0 0 1 0 6H6a3 3 0 0 1-3-3z" fill="#2443B8" />
      </svg>
      <span className="font-semibold tracking-tight">CloudScale</span>
    </div>
  );
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

async function call<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(path, { method, cache: "no-store" });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Re-render periodically so relative times stay current. */
function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const KIND_DOT: Record<ActivityEntry["kind"], string> = {
  "key.created": "bg-cs-brand",
  "quota.topup": "bg-emerald-500",
  "workspace.reset": "bg-zinc-400",
};

export default function CloudScaleDashboard() {
  const [state, setState] = useState<CloudScaleState | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const now = useNow();

  useEffect(() => {
    call<CloudScaleState>("/api/cloudscale")
      .then(setState)
      .catch((e: Error) => setError(e.message));
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleGenerateKey = () =>
    run(async () => {
      const res = await call<{ state: CloudScaleState; secret: string }>("/api/cloudscale/keys", "POST");
      setState(res.state);
      setSecret(res.secret);
      setCopied(false);
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.4 }, colors: ["#2443B8", "#18181B", "#A1A1AA"] });
    });

  const handleTopup = () =>
    run(async () => {
      setState(await call<CloudScaleState>("/api/cloudscale/topup", "POST"));
    });

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      /* clipboard blocked; the key is still selectable */
    }
  };

  const status = state?.status ?? "LOADING";
  const statusTone = status === "SYSTEM_READY" || status === "LOADING" ? "bg-zinc-400" : "bg-emerald-500";
  const activity = state?.activity ?? [];
  const totalRate = state?.keys.reduce((n, k) => n + k.rateLimitPerMin, 0) ?? 0;
  // Counts since the last reset (the newest workspace.reset entry).
  const resetAt = activity.find((a) => a.kind === "workspace.reset")?.at ?? "";
  const since = (kind: ActivityEntry["kind"]) => activity.filter((a) => a.kind === kind && a.at > resetAt).length;

  return (
    <div className="min-h-screen bg-cs-bg text-cs-text text-sm">
      <MaintenanceNotice />
      <CookieConsent />

      {/* Demo banner: makes it obvious this is the app under test, not Driftor itself. */}
      <div className="bg-cs-text text-zinc-300 text-xs">
        <div className="px-4 sm:px-6 h-9 flex items-center justify-between gap-4">
          <span className="truncate">
            <span className="text-white font-medium">Demo app.</span>{" "}
            <span className="hidden sm:inline">Driftor guards this page with Kane CLI in real Chrome, on wide and narrow screens.</span>
            <span className="sm:hidden">Guarded by Driftor.</span>
          </span>
          <span className="flex shrink-0 items-center gap-4">
            <Link href="/hud" className="hover:text-white">
              Traces
            </Link>
            <Link href="/" className="text-white hover:underline">
              ← Driftor
            </Link>
          </span>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[15rem_1fr] min-h-[calc(100vh-2.25rem)]">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col border-r border-cs-line bg-white">
          <div className="h-14 px-5 flex items-center border-b border-cs-line">
            <Logo />
          </div>
          <div className="px-3 py-3">
            <div className="rounded-md border border-cs-line px-3 py-2 text-xs">
              <div className="text-cs-sub">Workspace</div>
              <div className="font-medium">Acme Research · prod</div>
            </div>
          </div>
          <nav className="px-3 flex flex-col gap-0.5" aria-label="Sections">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="rounded-md px-3 py-1.5 text-cs-sub hover:bg-zinc-100 hover:text-cs-text">
                {item.label}
              </a>
            ))}
          </nav>
          <dl className="mt-auto p-4 border-t border-cs-line text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-cs-sub">Region</dt>
            <dd className="font-mono">us-east-1</dd>
            <dt className="text-cs-sub">Plan</dt>
            <dd>Team · prepaid</dd>
            <dt className="text-cs-sub">State</dt>
            <dd className="font-mono">.data/cloudscale.json</dd>
          </dl>
        </aside>

        <div className="min-w-0">
          {/* Mobile top bar */}
          <div className="lg:hidden relative h-12 px-4 flex items-center justify-between border-b border-cs-line bg-white">
            <Logo />
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="rounded-md border border-cs-line px-2.5 py-1 text-xs"
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
            {/* Fades in and out; when closed it must also be invisible, or it keeps catching taps. */}
            <nav
              id="mobile-menu"
              aria-label="Sections"
              className={`absolute inset-x-0 top-full z-40 h-[calc(100vh-5.25rem)] bg-white/95 px-4 py-3 flex flex-col gap-1 transition-opacity ${
                menuOpen ? "opacity-100" : "invisible opacity-0"
              }`}
            >
              {NAV.map((item) => (
                <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2 hover:bg-zinc-100">
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Bottom padding keeps content clear of the maintenance toast. */}
          <main className="px-4 sm:px-8 pt-6 sm:pt-8 pb-48 max-w-6xl">
            {/* Page header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="text-xs text-cs-sub">Acme Research / prod / us-east-1</div>
                <h1 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight">CloudScale AI Inference Gateway</h1>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-cs-sub">Action status</span>
                <span
                  data-testid="key-status"
                  className="inline-flex items-center gap-1.5 rounded-md border border-cs-line bg-white px-2 py-1 font-mono"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusTone}`} />
                  {status}
                </span>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Request failed: {error}
              </p>
            )}

            {/* Metrics */}
            <div
              id="quota"
              className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-lg border border-cs-line bg-cs-line scroll-mt-6"
            >
              <div className="p-4 bg-white">
                <div className="text-xs text-cs-sub">Active keys</div>
                <div data-testid="key-count" className="mt-1 text-xl font-semibold tabular-nums">
                  {state ? `${state.keys.length} Keys` : "…"}
                </div>
              </div>
              <div className="p-4 bg-white">
                <div className="text-xs text-cs-sub">Available quota</div>
                <div data-testid="quota-balance" className="mt-1 text-xl font-semibold tabular-nums">
                  {state ? formatUsd(state.quotaCents) : "…"}
                </div>
                <button
                  onClick={handleTopup}
                  disabled={!state || busy}
                  data-testid="topup-btn"
                  className="mt-1 text-xs font-medium text-cs-brand hover:underline disabled:opacity-50"
                >
                  + Top Up Quota ($250)
                </button>
              </div>
              <div className="p-4 bg-white">
                <div className="text-xs text-cs-sub">Combined rate limit</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {state ? `${totalRate.toLocaleString("en-US")}/min` : "…"}
                </div>
              </div>
              <div className="p-4 bg-white">
                <div className="text-xs text-cs-sub">Last change</div>
                <div className="mt-1 text-xl font-semibold">{state ? ago(state.updatedAt, now) : "…"}</div>
              </div>
            </div>

            {/* Keys */}
            <section id="keys" className="mt-8 rounded-lg border border-cs-line bg-white scroll-mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4 border-b border-cs-line">
                <div>
                  <h2 className="font-medium">Production API keys</h2>
                  <p className="text-xs text-cs-sub mt-0.5">
                    Keys route requests across US and EU edge clusters. Treat them like passwords.
                  </p>
                </div>
                <button
                  onClick={handleGenerateKey}
                  disabled={!state || busy}
                  data-testid="deploy-key-btn"
                  className="shrink-0 rounded-md bg-cs-brand hover:bg-cs-brandHover text-white font-medium px-3.5 py-2 active:translate-y-px disabled:opacity-60"
                >
                  Generate Production API Key
                </button>
              </div>

              {secret && (
                <div className="px-4 py-3 border-b border-cs-line bg-emerald-50 text-xs">
                  <div className="font-medium text-emerald-800">New key created. Copy it now; it won’t be shown again.</div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <code data-testid="new-key-secret" className="block min-w-0 break-all font-mono text-emerald-900">
                      {secret}
                    </code>
                    <button
                      onClick={copySecret}
                      className="shrink-0 rounded border border-emerald-300 bg-white px-2 py-0.5 text-emerald-800 hover:bg-emerald-100"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-xs text-cs-sub">
                    <tr className="border-b border-cs-line">
                      <th className="px-4 py-2 font-normal">Name</th>
                      <th className="px-4 py-2 font-normal">Key</th>
                      <th className="px-4 py-2 font-normal hidden sm:table-cell">Rate limit</th>
                      <th className="px-4 py-2 font-normal">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!state && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-cs-sub">
                          Loading keys…
                        </td>
                      </tr>
                    )}
                    {(state?.keys ?? []).map((k) => (
                      <tr key={k.id} className="border-b border-cs-line last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{k.name}</div>
                          <div className="text-xs text-cs-sub">{k.id}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{k.prefix}••••</td>
                        <td className="px-4 py-3 hidden sm:table-cell tabular-nums">
                          {k.rateLimitPerMin.toLocaleString("en-US")} / min
                        </td>
                        <td className="px-4 py-3 text-cs-sub tabular-nums">
                          {k.createdAt.slice(0, 10)} · {ago(k.createdAt, now)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-8 grid lg:grid-cols-[1fr_20rem] gap-6 items-start">
              {/* Activity */}
              <section id="activity" className="rounded-lg border border-cs-line bg-white scroll-mt-6">
                <div className="px-4 py-4 border-b border-cs-line flex items-baseline justify-between gap-3">
                  <h2 className="font-medium">Activity</h2>
                  <span className="text-xs text-cs-sub">Audit log · newest first</span>
                </div>
                <ol data-testid="activity-log">
                  {activity.length === 0 && <li className="px-4 py-6 text-center text-cs-sub">No activity yet.</li>}
                  {activity.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="px-4 py-3 border-b border-cs-line last:border-0 flex items-start gap-3">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[a.kind]}`} />
                      <div className="min-w-0 flex-1">
                        <div>{a.message}</div>
                        <div className="text-xs text-cs-sub font-mono">{a.kind}</div>
                      </div>
                      <time dateTime={a.at} className="shrink-0 text-xs text-cs-sub tabular-nums" title={a.at}>
                        {ago(a.at, now)}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Billing summary */}
              <section className="rounded-lg border border-cs-line bg-white">
                <div className="px-4 py-4 border-b border-cs-line">
                  <h2 className="font-medium">Billing</h2>
                </div>
                <dl className="px-4 py-3 grid grid-cols-[1fr_auto] gap-y-2 text-xs">
                  <dt className="text-cs-sub">Plan</dt>
                  <dd>Team · prepaid</dd>
                  <dt className="text-cs-sub">Top-up increment</dt>
                  <dd className="tabular-nums">{formatUsd(TOPUP_CENTS)}</dd>
                  <dt className="text-cs-sub">Top-ups since reset</dt>
                  <dd className="tabular-nums">{since("quota.topup")}</dd>
                  <dt className="text-cs-sub">Keys issued since reset</dt>
                  <dd className="tabular-nums">{since("key.created")}</dd>
                </dl>
                <p className="px-4 pb-4 text-xs text-cs-sub leading-relaxed">
                  Driftor restores this workspace to its seed state before every Kane run, so every check starts from the
                  same keys and balance.
                </p>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
