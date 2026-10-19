import type { MetadataRoute } from 'next';
import { site } from '@/lib/config';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!site.url) return [];
  const now = new Date();
  return [
    { url: `${site.url}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${site.url}/mentions-legales`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${site.url}/confidentialite`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
