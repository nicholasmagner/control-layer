import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained server in .next/standalone for the Docker image.
  output: 'standalone',
  // Don't auto-generate editor tooling files into the project root.
  agentRules: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;
