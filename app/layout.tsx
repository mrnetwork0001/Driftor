import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Driftor | Autonomous Visual Stacking & Viewport Occlusion Gate for AI PRs",
  description: "Closing the Open-Loop: Real-Browser CSS Stacking & Layout Drift Verification with Kane CLI 0.10.x",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-driftor="active">
      <body className="min-h-screen bg-[#0b0f19] text-slate-100 antialiased selection:bg-fuchsia-500 selection:text-white" data-driftor="active">
        <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <a href="/" className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-fuchsia-600 via-purple-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-fuchsia-500/20 ring-1 ring-white/20">
                  <span className="font-black text-white text-lg tracking-wider">D</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-lg text-white tracking-tight">Driftor</span>
                    <span className="px-1.5 py-0.5 text-[10px] uppercase font-semibold bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 rounded">Kane 0.10.x</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Visual Stacking & Viewport Gate</span>
                </div>
              </a>
            </div>

            <nav className="flex items-center space-x-6 text-sm">
              <a href="/" className="text-slate-300 hover:text-white transition-colors">Overview</a>
              <a href="/app" className="text-slate-300 hover:text-white transition-colors">Target App (CloudScale)</a>
              <a href="/hud" className="flex items-center space-x-1.5 text-fuchsia-400 hover:text-fuchsia-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Mission Control HUD</span>
              </a>
              <a
                href="https://github.com/mrnetwork0001/Driftor"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-all flex items-center space-x-1.5"
              >
                <span>GitHub</span>
              </a>
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
