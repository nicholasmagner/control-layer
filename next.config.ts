import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone to get a self-contained server.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
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
