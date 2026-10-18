import type { NextConfig } from 'next';

// Le navigateur ne parle qu'à cette origine : `/api/v1/*` est relayé vers le
// backend pour que les cookies httpOnly de session restent « same-site ».
const backend = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Le backoffice ne doit jamais être indexé.
      { source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default config;
