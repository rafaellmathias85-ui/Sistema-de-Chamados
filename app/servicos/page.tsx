import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { SERVICES } from '@/lib/services-data';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Serviços | TI Gerenciada, Cloud, Cyber Security e Mais',
  description:
    'Conheça o portfólio completo da Winner Tecnologia: Cyber Security, Cloud (Azure & AWS), Microsoft 365, Backup em Nuvem, Antivírus, Monitoramento 24/7 e TI Gerenciada.',
  alternates: { canonical: '/servicos' },
};

export default function ServicosPage() {
  return (
    <main className="min-h-screen bg-navy">
      <Header />
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <h1 className="font-montserrat font-bold text-4xl md:text-5xl text-white mb-4">
              Nossos <span className="text-accent-blue">Serviços</span>
            </h1>
            <p className="text-gray-300 text-lg max-w-3xl mx-auto">
              Soluções completas em tecnologia para empresas que não podem parar.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.slug}
                  href={`/servicos/${service.slug}`}
                  className="group bg-[#112240]/50 border border-white/10 rounded-2xl p-6 hover:border-accent-blue/50 transition-all hover:-translate-y-1"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent-blue/10 flex items-center justify-center mb-4 group-hover:bg-accent-blue/20 transition">
                    <Icon className="w-6 h-6 text-accent-blue" />
                  </div>
                  <h2 className="font-montserrat font-semibold text-xl text-white mb-2">{service.shortTitle}</h2>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-3">{service.tagline}</p>
                  <span className="inline-flex items-center gap-1 text-accent-blue text-sm font-semibold group-hover:gap-2 transition-all">
                    Saiba mais <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
