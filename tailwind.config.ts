import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Driftor: drafting-table palette
        paper: "#F3F1EC",
        sheet: "#FAF9F6",
        ink: "#17160F",
        graphite: "#5F5B52",
        rule: "#D8D3C8",
        signal: "#D9412F",
        pass: "#2E6B46",
        // CloudScale: the demo target's own brand
        cs: {
          bg: "#F7F7F8",
          line: "#E4E4E7",
          text: "#18181B",
          sub: "#71717A",
          brand: "#2443B8",
          brandHover: "#1C3696",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
