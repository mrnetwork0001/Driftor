/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a production build run beside `next dev` without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // /api/traces and /api/cards read the committed Kane evidence at runtime; bundle it on serverless deploys.
    outputFileTracingIncludes: {
      "/api/traces": ["./kane-traces/**/*"],
      "/api/cards": ["./kane-traces/runs/**/*.png", "./kane-traces/runs/**/run.json"],
    },
  },
};

module.exports = nextConfig;
