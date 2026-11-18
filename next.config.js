/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a production build run beside `next dev` without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // /api/traces reads the committed Kane evidence at runtime; bundle it on serverless deploys.
    outputFileTracingIncludes: {
      "/api/traces": ["./kane-traces/**/*"],
    },
  },
};

module.exports = nextConfig;
