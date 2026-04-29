"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';

const faqs = [
  {
    question: 'Como funciona o monitoramento 24/7?',
    answer: 'Nossa equipe de especialistas monitora sua infraestrutura 24 horas por dia, 7 dias por semana. Identificamos e resolvemos problemas proativamente antes que impactem sua operação. Você pode abrir chamados via portal, telefone, WhatsApp ou e-mail, com SLA de resposta em até 4 horas para incidentes críticos.'
  },
  {
    question: 'Quais são os benefícios do backup em nuvem?',
    answer: 'O backup em nuvem oferece proteção contra ransomware, desastres naturais e falhas de hardware. Seus dados ficam criptografados, com replicação geográfica e recuperação rápida. Realizamos testes periódicos de restauração e garantimos conformidade com a LGPD.'
  },
  {
    question: 'Como é feita a precificação dos serviços?',
    answer: 'Nossa precificação é transparente e baseada na quantidade de máquinas (desktops, notebooks, servidores) do seu parque tecnológico. Após um diagnóstico gratuito da sua infraestrutura, apresentamos uma proposta personalizada com valores justos e serviços adequados às suas necessidades.'
  },
  {
    question: 'Vocês atendem empresas de qual porte?',
    answer: 'Atendemos empresas de pequeno, médio e grande porte em todo o Brasil. Nossa metodologia e soluções são escaláveis, adaptando-se perfeitamente às necessidades específicas de cada cliente, desde startups até grandes corporações.'
  },
  {
    question: 'O que inclui a gestão de Microsoft 365?',
    answer: 'Nossa gestão de Microsoft 365 inclui licenciamento, configuração, migração de e-mails, gestão de usuários, políticas de segurança, backup dos dados do M365, suporte técnico especializado e treinamento para sua equipe. Também integramos com o Microsoft Intune para gestão de dispositivos.'
  },
  {
    question: 'Como funciona a proteção com BitDefender?',
    answer: 'Somos parceiros oficiais BitDefender e oferecemos a solução GravityZone, líder em proteção endpoint. Inclui antivírus, anti-ransomware, firewall, controle de aplicações, detecção avançada de ameaças (EDR) e console de gerenciamento centralizado. Toda a gestão é feita pela nossa equipe.'
  },
  {
    question: 'Qual o tempo de implantação dos serviços?',
    answer: 'O tempo varia conforme a complexidade do projeto. Após o diagnóstico, apresentamos um cronograma detalhado. Projetos simples podem ser implementados em 1-2 semanas, enquanto migrações completas para nuvem podem levar de 30 a 90 dias, sempre com mínimo impacto operacional.'
  },
  {
    question: 'Vocês oferecem conformidade com LGPD?',
    answer: 'Sim! Todas as nossas soluções são desenvolvidas considerando a Lei Geral de Proteção de Dados. Oferecemos consultoria em adequação LGPD, implementação de controles técnicos, políticas de privacidade, gestão de consentimento e relatórios de impacto à proteção de dados.'
  }
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-navy">
      <div className="max-w-[900px] mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-orange font-montserrat font-semibold text-sm uppercase tracking-widest">
            Dúvidas Frequentes
          </span>
          <h2 className="font-montserrat font-bold text-3xl sm:text-4xl md:text-5xl text-white mt-4 mb-4">
            Perguntas <span className="text-accent-blue">Frequentes</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Tire suas dúvidas sobre nossos serviços e soluções
          </p>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
            >
              <div
                className={`bg-[#112240] rounded-2xl border transition-all duration-300 ${
                  openIndex === index ? 'border-accent-blue/50' : 'border-accent-blue/20 hover:border-accent-blue/30'
                }`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-white pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-accent-blue flex-shrink-0 transition-transform duration-300 ${
                      openIndex === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 text-gray-400 leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <div className="bg-gradient-to-r from-accent-blue/10 to-accent-orange/10 rounded-2xl p-8 border border-accent-blue/20">
            <MessageCircle className="w-12 h-12 text-accent-blue mx-auto mb-4" />
            <h3 className="font-montserrat font-bold text-xl text-white mb-2">
              Não encontrou sua resposta?
            </h3>
            <p className="text-gray-400 mb-6">
              Nossa equipe está pronta para ajudar você
            </p>
            <button
              onClick={() => document.querySelector('#contato')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex items-center gap-2 bg-accent-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-accent-blue/90 transition-colors"
            >
              Fale Conosco
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
