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
      // People Management moved out from under the retired HR role's own
      // route path now that HR no longer exists as a role — the area itself
      // (People Directory + Role Audit) is unchanged, just SUPER_ADMIN-only
      // and reachable at /admin/people.
      {
        source: '/hr',
        destination: '/admin/people',
        permanent: false,
      },
      {
        source: '/hr/audit',
        destination: '/admin/people/audit',
        permanent: false,
      },
      // The recurring hourly "Weekly Availability" grid was removed entirely
      // in favor of event-scoped attendance (OrganizationEvent responses) —
      // there is no generic per-day availability concept any more.
      {
        source: '/member/availability',
        destination: '/member/events',
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
