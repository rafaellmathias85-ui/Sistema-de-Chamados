import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function getSiteUrl() {
  try {
    const h = headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) return `${proto}://${host}`;
  } catch {}
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://wticorp.com.br';
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const [posts, cases] = await Promise.all([
    prisma.blogPost.findMany({ where: { isPublished: true, link: null }, select: { slug: true, updatedAt: true } }).catch(() => []),
    prisma.caseStudy.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }).catch(() => []),
  ]);

  const services = [
    'cyber-security',
    'cloud-computing',
    'microsoft-365',
    'azure',
    'aws',
    'backup-em-nuvem',
    'antivirus-corporativo',
    'monitoramento-24-7',
    'ti-gerenciada',
  ];

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/servicos`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/cases`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/acesso-remoto`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
  ];

  const servicePages: MetadataRoute.Sitemap = services.map((slug) => ({
    url: `${base}/servicos/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticPages, ...servicePages, ...blogPages];
}
