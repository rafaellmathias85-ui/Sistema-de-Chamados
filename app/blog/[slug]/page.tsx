import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { prisma } from '@/lib/db';
import { Calendar, ChevronRight, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await prisma.blogPost.findUnique({ where: { slug: params.slug } });
  if (!post) return { title: 'Post não encontrado' };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
      authors: [post.author],
      images: post.imageUrl ? [post.imageUrl] : undefined,
    },
  };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wticorp.com.br';

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await prisma.blogPost.findUnique({ where: { slug: params.slug } });
  if (!post || !post.isPublished) notFound();

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: 'Winner Tecnologia', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    image: post.imageUrl || undefined,
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  };

  return (
    <main className="min-h-screen bg-navy">
      <Header />
      <Script id={`ld-art-${post.slug}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <Script id={`ld-bc-${post.slug}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <article className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-[800px] mx-auto">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
            <Link href="/" className="hover:text-white">Início</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/blog" className="hover:text-white">Blog</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white line-clamp-1">{post.title}</span>
          </nav>

          <span className="inline-block bg-accent-blue/10 text-accent-blue text-xs font-semibold px-3 py-1 rounded-full mb-4">
            {post.category}
          </span>

          <h1 className="font-montserrat font-bold text-3xl md:text-5xl text-white mb-6 leading-tight">{post.title}</h1>

          <div className="flex items-center gap-6 text-sm text-gray-400 mb-12 pb-6 border-b border-white/10">
            <span className="inline-flex items-center gap-1"><Calendar className="w-4 h-4" /> {formatDate(post.publishedAt)}</span>
            <span>{post.author}</span>
          </div>

          {post.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={post.imageUrl} alt={post.title} className="w-full rounded-xl mb-8" />
          )}

          <div className="prose prose-invert prose-lg max-w-none">
            {post.content.split('\n\n').map((para, i) => (
              <p key={i} className="text-gray-200 leading-relaxed mb-6 whitespace-pre-line">{para}</p>
            ))}
          </div>

          <div className="mt-16 pt-8 border-t border-white/10">
            <Link href="/blog" className="inline-flex items-center gap-2 text-accent-blue hover:text-white transition">
              <ArrowLeft className="w-4 h-4" /> Voltar para o blog
            </Link>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
