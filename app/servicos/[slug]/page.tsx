import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { SERVICES, getServiceBySlug } from '@/lib/services-data';
import { ArrowRight, CheckCircle, ChevronRight } from 'lucide-react';

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const service = getServiceBySlug(params.slug);
  if (!service) return { title: 'Serviço não encontrado' };
  return {
    title: service.title,
    description: service.metaDescription,
    keywords: service.keywords,
    alternates: { canonical: `/servicos/${service.slug}` },
    openGraph: {
      title: service.title,
      description: service.metaDescription,
      url: `/servicos/${service.slug}`,
      type: 'article',
    },
  };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wticorp.com.br';

export default function ServicoPage({ params }: { params: { slug: string } }) {
  const service = getServiceBySlug(params.slug);
  if (!service) notFound();

  const Icon = service.icon;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Serviços', item: SITE_URL + '/servicos' },
      { '@type': 'ListItem', position: 3, name: service.shortTitle, item: `${SITE_URL}/servicos/${service.slug}` },
    ],
  };

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: service.metaDescription,
    provider: { '@type': 'Organization', name: 'Winner Tecnologia', url: SITE_URL },
    areaServed: { '@type': 'Country', name: 'Brasil' },
  };

  const faqLd =
    service.faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: service.faq.map((q) => ({
            '@type': 'Question',
            name: q.question,
            acceptedAnswer: { '@type': 'Answer', text: q.answer },
          })),
        }
      : null;

  return (
    <main className="min-h-screen bg-navy">
      <Header />

      <Script id={`ld-bc-${service.slug}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <Script id={`ld-svc-${service.slug}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      {faqLd && (
        <Script id={`ld-faq-${service.slug}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      )}

      <section className="pt-32 pb-12 px-4 sm:px-6">
        <div className="max-w-[1100px] mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
            <Link href="/" className="hover:text-white">Início</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/servicos" className="hover:text-white">Serviços</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{service.shortTitle}</span>
          </nav>

          {/* Hero */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-7 h-7 text-accent-blue" />
            </div>
            <div>
              <h1 className="font-montserrat font-bold text-3xl md:text-5xl text-white mb-3">{service.title}</h1>
              <p className="text-accent-blue text-lg">{service.tagline}</p>
            </div>
          </div>

          <p className="text-gray-300 text-lg leading-relaxed max-w-3xl mb-12">{service.description}</p>

          {/* Features */}
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 mb-16">
            {service.features.map((f) => (
              <div key={f} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-1" />
                <span className="text-gray-200">{f}</span>
              </div>
            ))}
          </div>

          {/* Benefits */}
          <h2 className="font-montserrat font-bold text-2xl md:text-3xl text-white mb-6">Benefícios</h2>
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {service.benefits.map((b) => (
              <div key={b.title} className="bg-[#112240]/50 border border-white/10 rounded-2xl p-6">
                <h3 className="font-montserrat font-semibold text-lg text-white mb-2">{b.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{b.description}</p>
              </div>
            ))}
          </div>

          {/* FAQ */}
          {service.faq.length > 0 && (
            <>
              <h2 className="font-montserrat font-bold text-2xl md:text-3xl text-white mb-6">Perguntas Frequentes</h2>
              <div className="space-y-4 mb-16">
                {service.faq.map((q) => (
                  <details key={q.question} className="bg-[#112240]/50 border border-white/10 rounded-2xl p-6 group">
                    <summary className="font-semibold text-white cursor-pointer list-none flex items-center justify-between">
                      {q.question}
                      <ChevronRight className="w-5 h-5 text-accent-blue group-open:rotate-90 transition" />
                    </summary>
                    <p className="text-gray-300 mt-4 leading-relaxed">{q.answer}</p>
                  </details>
                ))}
              </div>
            </>
          )}

          {/* CTA */}
          <div className="bg-gradient-to-r from-accent-blue/20 to-accent-orange/20 border border-accent-blue/30 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="font-montserrat font-bold text-2xl md:text-3xl text-white mb-4">
              Vamos conversar sobre {service.shortTitle}?
            </h2>
            <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
              Solicite um diagnóstico gratuito e descubra como nossa equipe pode acelerar sua estratégia de TI.
            </p>
            <Link
              href="/#contato"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-orange to-orange-600 text-white font-semibold px-8 py-4 rounded-full hover:scale-105 transition"
            >
              Solicitar diagnóstico gratuito
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
