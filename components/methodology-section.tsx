"use client";

import { motion } from 'framer-motion';
import { Search, FileText, Cog, Shield, TrendingUp, Activity } from 'lucide-react';

const steps = [
  {
    icon: Search,
    title: 'Diagnóstico',
    description: 'Análise completa da sua infraestrutura atual, identificando vulnerabilidades e oportunidades de melhoria.',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    icon: FileText,
    title: 'Planejamento',
    description: 'Elaboração de um plano estratégico personalizado com roadmap de implementação e prioridades.',
    color: 'from-cyan-500 to-teal-500'
  },
  {
    icon: Cog,
    title: 'Implementação',
    description: 'Execução das soluções com mínimo impacto operacional, seguindo metodologias ágeis e boas práticas.',
    color: 'from-teal-500 to-green-500'
  },
  {
    icon: Shield,
    title: 'Segurança',
    description: 'Aplicação de camadas de proteção avançada, compliance LGPD e políticas de segurança robustas.',
    color: 'from-green-500 to-emerald-500'
  },
  {
    icon: TrendingUp,
    title: 'Otimização',
    description: 'Monitoramento contínuo de performance com ajustes proativos para garantir máxima eficiência.',
    color: 'from-emerald-500 to-accent-blue'
  },
  {
    icon: Activity,
    title: 'Monitoramento 24/7',
    description: 'Monitoramento contínuo com equipe especializada identificando e resolvendo problemas proativamente.',
    color: 'from-accent-blue to-accent-orange'
  }
];

export default function MethodologySection() {
  return (
    <section id="metodologia" className="py-24 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-orange font-montserrat font-semibold text-sm uppercase tracking-widest">
            Como Trabalhamos
          </span>
          <h2 className="font-montserrat font-bold text-3xl sm:text-4xl md:text-5xl text-navy mt-4 mb-4">
            Nossa <span className="text-accent-blue">Metodologia</span>
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-lg">
            Processo estruturado e comprovado para transformar sua infraestrutura de TI com segurança e eficiência
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection Line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-accent-blue via-accent-orange to-accent-blue transform -translate-y-1/2 opacity-20" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative"
              >
                <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-100 h-full group">
                  {/* Step Number */}
                  <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-r from-accent-blue to-accent-orange rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                    {index + 1}
                  </div>
                  
                  {/* Icon */}
                  <div className={`w-16 h-16 mb-6 rounded-2xl bg-gradient-to-r ${step.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="font-montserrat font-bold text-xl text-navy mb-3">
                    {step.title}
                  </h3>
                  
                  <p className="text-gray-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-600 mb-6">Pronto para transformar sua infraestrutura de TI?</p>
          <button
            onClick={() => document.querySelector('#contato')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-orange to-orange-600 text-white font-semibold px-8 py-4 rounded-full hover:shadow-lg hover:shadow-accent-orange/30 transition-all duration-300 hover:scale-105"
          >
            Solicitar Diagnóstico Gratuito
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </motion.div>
      </div>
    </section>
  );
}
