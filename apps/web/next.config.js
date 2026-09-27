/** @type {import('next').NextConfig} */

// Set on Vercel only (server-side env, not NEXT_PUBLIC_*): the hosted API's origin,
// e.g. https://inspectai-api.up.railway.app (no trailing slash, no /api/v1).
// When set, requests to /api/v1/* on the web app's own domain are proxied there,
// so the session cookie the API sets stays first-party (SameSite=Lax survives) —
// the browser only ever talks to inspectai-web's own origin, never Railway's.
const API_ORIGIN = process.env.API_ORIGIN;

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@inspectai/ui", "@inspectai/contracts"],
  env: {
    // Relative when proxying (API_ORIGIN set on Vercel); absolute for local dev
    // where the web app and API aren't on the same origin and no proxy runs.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1",
  },
  async rewrites() {
    if (!API_ORIGIN) return [];
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

module.exports = nextConfig;
