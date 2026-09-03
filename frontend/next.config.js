/** @type {import('next').NextConfig} */
// All API calls from the browser stay same-origin under /api and are proxied
// here to the FastAPI backend on port 8000. That backend runs on localhost:8000
// in local dev AND inside the same container in the production (Faable) deploy.
const nextConfig = {
  output: 'standalone',
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
