import type { NextConfig } from 'next';

const backend = new URL((process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, ''));

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Photos du catalogue : backend (stockage local en développement) et Cloudinary.
    remotePatterns: [
      {
        protocol: backend.protocol.replace(':', '') as 'http' | 'https',
        hostname: backend.hostname,
        port: backend.port,
        pathname: '/api/v1/media/**',
      },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    // En local, le backend tourne sur localhost : autorisé seulement hors production.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
  // Seule la candidature des restaurants passe par le site (même origine) :
  // le reste de l'API n'est pas relayé.
  async rewrites() {
    return [{ source: '/api/v1/partner-requests', destination: `${backend.origin}/api/v1/partner-requests` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
