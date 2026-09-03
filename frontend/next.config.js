/** @type {import('next').NextConfig} */
// All API calls from the browser stay same-origin under /api and are proxied
// here to the FastAPI backend on port 8000. That backend runs on localhost:8000
// in local dev AND inside the same container in the production (Faable) deploy.
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
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
