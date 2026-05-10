import type { Metadata } from 'next';
import Header from '@/components/header';
import Footer from '@/components/footer';
import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cases de Sucesso | Resultados reais de clientes',
  description:
    'Conheça histórias reais de empresas que transformaram sua TI com a Winner Tecnologia: redução de custos, aumento de segurança e produtividade.',
  alternates: { canonical: '/cases' },
};

export default async function CasesPage() {
  const cases = await prisma.caseStudy.findMany({
    where: { isPublished: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <main className="min-h-screen bg-navy">
      <Header />
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-16">
            <h1 className="font-montserrat font-bold text-4xl md:text-5xl text-white mb-4">
              Cases de <span className="text-accent-blue">Sucesso</span>
            </h1>
            <p className="text-gray-300 text-lg max-w-2xl mx-auto">
              Resultados mensuráveis em empresas reais de múltiplos setores.
            </p>
          </div>

          <div className="space-y-8">
            {cases.map((c) => {
              const metrics = (Array.isArray(c.metrics) ? c.metrics : []) as { label: string; value: string }[];
              return (
                <article key={c.id} className="bg-[#112240]/50 border border-white/10 rounded-2xl p-8 md:p-10">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-accent-blue" />
                    </div>
                    <div>
                      <span className="text-accent-blue text-sm font-semibold">{c.theme}</span>
                      <h2 className="font-montserrat font-semibold text-2xl text-white mt-1">{c.title}</h2>
                    </div>
                  </div>
                  {c.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.imageUrl} alt={c.title} className="w-full rounded-xl mb-6 max-h-80 object-cover" />
                  )}
                  <p className="text-gray-300 mb-6 leading-relaxed">{c.summary}</p>
                  {metrics.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {metrics.map((m, i) => (
                        <div key={i} className="bg-navy/50 rounded-xl p-4 text-center border border-white/5">
                          <div className="font-montserrat font-bold text-2xl text-accent-blue">{m.value}</div>
                          <div className="text-xs text-gray-400 mt-1">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
            {cases.length === 0 && (
              <p className="text-gray-400 text-center">Nenhum case publicado.</p>
            )}
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/#contato"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-orange to-orange-600 text-white font-semibold px-8 py-4 rounded-full hover:scale-105 transition"
            >
              Quero resultados como esses
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
