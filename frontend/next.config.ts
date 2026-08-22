import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  reactStrictMode: true,
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
