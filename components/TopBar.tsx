"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Mark() {
  // Two offset sheets: one layer sitting on top of another.
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1.5" y="6.5" width="13" height="13" fill="#FAF9F6" stroke="#17160F" strokeWidth="1.5" />
      <rect x="7.5" y="1.5" width="13" height="13" fill="none" stroke="#D9412F" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

const PAGES = [
  ["/", "Overview"],
  ["/app", "Demo app"],
  ["/hud", "Traces"],
] as const;

/** Full-width top bar: wordmark left, pages right. */
export default function TopBar() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-ink bg-paper/95 backdrop-blur-sm">
      <div className="flex h-14 items-stretch">
        <Link href="/" className="flex items-center gap-2.5 px-5 sm:px-8 lg:px-12 border-r border-ink">
          <Mark />
          <span className="font-mono text-[15px] font-medium tracking-tight">driftor</span>
        </Link>

        <nav className="ml-auto flex items-stretch text-sm">
          {PAGES.map(([href, label], i) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center px-4 sm:px-6 border-l border-rule ${
                  active ? "bg-ink text-sheet" : "text-graphite hover:text-ink hover:bg-sheet"
                } ${i === 0 ? "hidden sm:flex" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
