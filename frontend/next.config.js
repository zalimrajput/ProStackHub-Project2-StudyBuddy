/** @type {import('next').NextConfig} */
// All API calls from the browser stay same-origin under /api and are proxied
// here to the FastAPI backend. The backend target is set with BACKEND_URL:
//   - local dev / single Docker container: BACKEND_URL unset -> http://localhost:8000
//     (uvicorn runs on localhost:8000, in the same machine or the same container)
//   - Faable Free plan (two apps, no Docker): set BACKEND_URL to the deployed
//     backend app's public URL, e.g. https://<backend-app>.faable.link
// Do NOT set a trailing slash on BACKEND_URL.
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig = {
  output: 'standalone',
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
