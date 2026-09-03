/** @type {import('next').NextConfig} */
// This /api rewrite proxies same-origin /api/* calls to the FastAPI backend.
// It is used in LOCAL DEV and in the single Docker container, where the browser
// stays on the app origin and the backend is at localhost:8000.
//
// Production (Vercel frontend + Railway backend) does NOT use this proxy: the
// browser calls the Railway backend directly (see frontend/src/lib/api.ts, which
// reads NEXT_PUBLIC_BACKEND_URL at build time) so requests never hit Vercel's
// proxied-request timeout / request-body limits. BACKEND_URL remains a server-side
// override if you ever want to re-enable proxying.
// Do NOT set a trailing slash on the URL.
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:8000';

// 'standalone' output is only needed for the self-hosted Docker image (the
// Dockerfile copies .next/standalone/). Vercel does NOT need it: Vercel traces
// and bundles the app itself, and running standalone file-tracing on Vercel's
// build machine made the build die silently at 'Collecting build traces'.
// The Docker build sets NEXT_STANDALONE=1 (see Dockerfile); Vercel leaves it
// unset, so output falls back to Vercel's native build.
const nextConfig = {
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  experimental: {
    // Next.js's built-in /api proxy kills upstream requests after 30s by
    // default. Flashcard generation (/api/generate) legitimately takes longer:
    // PDF extraction + Gemini API calls with retries can run for minutes. The
    // 30s cutoff surfaced as 'socket hang up' + HTTP 500 'Internal Server
    // Error', and could even crash the standalone server. Raise it to 10 min.
    proxyTimeout: 10 * 60 * 1000,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
