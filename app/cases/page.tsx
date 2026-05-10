import type { Metadata } from 'next';
import Header from '@/components/header';
import Footer from '@/components/footer';
import Link from 'next/link';
import { ArrowRight, Building2, TrendingUp, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cases de Sucesso | Resultados reais de clientes',
  description:
    'Conheça histórias reais de empresas que transformaram sua TI com a Winner Tecnologia: redução de custos, aumento de segurança e produtividade.',
  alternates: { canonical: '/cases' },
};

const CASES = [
  {
    industry: 'Indústria',
    icon: Building2,
    title: 'Migração crítica para Azure com zero downtime',
    summary:
      'Migração de ERP de cliente industrial com múltiplas filiais, mantendo 100% de uptime durante a janela.',
    metrics: [
      { label: 'Downtime', value: '0min' },
      { label: 'Redução de TCO', value: '32%' },
      { label: 'SLA pós-go-live', value: '99,95%' },
    ],
  },
  {
    industry: 'Serviços Financeiros',
    icon: Shield,
    title: 'Implementação de Zero Trust e LGPD',
    summary:
      'Hardening completo, MFA obrigatório, segregação de redes e adequação LGPD em 90 dias.',
    metrics: [
      { label: 'Tentativas de phishing bloqueadas', value: '+98%' },
      { label: 'Compliance LGPD', value: '100%' },
      { label: 'Tempo de detecção', value: '< 5min' },
    ],
  },
  {
    industry: 'Varejo',
    icon: TrendingUp,
    title: 'Monitoramento 24/7 e helpdesk gerenciado',
    summary:
      'Centralização do atendimento de TI de uma rede de lojas com NOC próprio.',
    metrics: [
      { label: 'Reabertura de chamados', value: '-65%' },
      { label: 'Tempo médio de resposta', value: '< 2min' },
      { label: 'Satisfação do usuário', value: '4,8/5' },
    ],
  },
];

export default function CasesPage() {
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
            {CASES.map((c, i) => {
              const Icon = c.icon;
              return (
                <article key={i} className="bg-[#112240]/50 border border-white/10 rounded-2xl p-8 md:p-10">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-accent-blue" />
                    </div>
                    <div>
                      <span className="text-accent-blue text-sm font-semibold">{c.industry}</span>
                      <h2 className="font-montserrat font-semibold text-2xl text-white mt-1">{c.title}</h2>
                    </div>
                  </div>
                  <p className="text-gray-300 mb-6 leading-relaxed">{c.summary}</p>
                  <div className="grid grid-cols-3 gap-4">
                    {c.metrics.map((m) => (
                      <div key={m.label} className="bg-navy/50 rounded-xl p-4 text-center border border-white/5">
                        <div className="font-montserrat font-bold text-2xl text-accent-blue">{m.value}</div>
                        <div className="text-xs text-gray-400 mt-1">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
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
