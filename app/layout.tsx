import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Driftor — a real-browser gate for AI-written UI changes",
  description:
    "Driftor drives real Chrome through Kane CLI, catches overlays that swallow clicks, and hands the failure back to your coding agent to fix.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-driftor="active" is how driftor_test.js discovers the running app.
    <html lang="en" data-driftor="active" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
