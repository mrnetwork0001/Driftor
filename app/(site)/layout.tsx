import TopBar from "@/components/TopBar";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="drafting-grid min-h-screen text-ink flex flex-col">
      <TopBar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-ink">
        <div className="px-5 sm:px-8 lg:px-12 py-5 flex flex-col sm:flex-row gap-2 justify-between font-mono text-[11px] text-graphite">
          <span>driftor · Apache-2.0 · built for the Kane CLI hackathon, Nov 2026</span>
          <span className="flex gap-5">
            <a href="https://github.com/mrnetwork0001/Driftor" target="_blank" rel="noreferrer" className="hover:text-ink">
              github ↗
            </a>
            <a href="https://kaneclihack.sh" target="_blank" rel="noreferrer" className="hover:text-ink">
              kaneclihack.sh ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
