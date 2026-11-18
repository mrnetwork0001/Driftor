/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // /api/traces reads the committed Kane evidence at runtime; bundle it on serverless deploys.
    outputFileTracingIncludes: {
      "/api/traces": ["./kane-traces/**/*"],
    },
  },
};

module.exports = nextConfig;
