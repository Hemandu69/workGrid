import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  reactStrictMode: true,
  async redirects() {
    return [
      // Room Overview was removed as a standalone page — its functionality
      // is fully covered by the Operations Grid's detailed room/subroom
      // interface. Not permanent: the IA may evolve again and browsers
      // should not hard-cache this.
      {
        source: '/admin/rooms',
        destination: '/admin/operations',
        permanent: false,
      },
    ];
  },
  images: {
    // Avatar images are always remote (seeded/set as Unsplash URLs today —
    // there is no local upload path). Widen this list if another avatar
    // source is ever introduced.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
