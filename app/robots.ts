import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

function getSiteUrl() {
  try {
    const h = headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) return `${proto}://${host}`;
  } catch {}
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://wticorp.com.br';
}

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/tickets/', '/login', '/forgot-password', '/chamado-whatsapp'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
