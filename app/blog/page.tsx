import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { BLOG_POSTS } from '@/lib/blog-data';
import { Calendar, Clock, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog | Conteúdo técnico sobre Cyber Security, Cloud e TI',
  description:
    'Artigos técnicos da Winner Tecnologia: cyber security, cloud, Microsoft 365, backup, monitoramento e gestão de TI.',
  alternates: { canonical: '/blog' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function BlogPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <main className="min-h-screen bg-navy">
      <Header />
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-16">
            <h1 className="font-montserrat font-bold text-4xl md:text-5xl text-white mb-4">
              Blog <span className="text-accent-blue">Winner</span>
            </h1>
            <p className="text-gray-300 text-lg max-w-2xl mx-auto">
              Insights técnicos e tendências do universo de TI corporativa.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group bg-[#112240]/50 border border-white/10 rounded-2xl p-6 hover:border-accent-blue/50 transition-all hover:-translate-y-1 flex flex-col"
              >
                <span className="inline-block bg-accent-blue/10 text-accent-blue text-xs font-semibold px-3 py-1 rounded-full mb-3 self-start">
                  {post.category}
                </span>
                <h2 className="font-montserrat font-semibold text-lg text-white mb-3 line-clamp-2 group-hover:text-accent-blue transition">
                  {post.title}
                </h2>
                <p className="text-gray-400 text-sm mb-4 line-clamp-3 flex-1">{post.excerpt}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(post.date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {post.readingTime} min
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
