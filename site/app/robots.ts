import type { MetadataRoute } from 'next';
import { site } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  // Sans domaine définitif configuré, on ne demande pas d'indexation.
  if (!site.url) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: `${site.url}/sitemap.xml` };
}
