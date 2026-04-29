"use client";

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import {
  Award, Clock, ShieldCheck, Cog, Cpu, DollarSign,
} from 'lucide-react';

const differentials = [
  {
    icon: Award,
    title: 'Expertise Técnica',
    desc: 'Time altamente qualificado com certificações Microsoft, AWS e em segurança cibernética.',
  },
  {
    icon: Clock,
    title: 'Monitoramento 24/7',
    desc: 'Centro de operações com monitoramento ininterrupto de toda sua infraestrutura.',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance',
    desc: 'Adequação completa à LGPD e normas de segurança nacionais e internacionais.',
  },
  {
    icon: Cog,
    title: 'Metodologia Comprovada',
    desc: 'Processos certificados e metodologias ágeis para entrega eficiente de projetos.',
  },
  {
    icon: Cpu,
    title: 'Tecnologia de Ponta',
    desc: 'Parcerias estratégicas com os maiores players do mercado: Microsoft, AWS, BitDefender.',
  },
  {
    icon: DollarSign,
    title: 'Custo-Benefício',
    desc: 'Soluções escaláveis que otimizam investimentos e reduzem custos operacionais.',
  },
];

export default function DifferentialsSection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section id="diferenciais" className="py-20 md:py-28 bg-navy-light relative overflow-hidden">
      <div className="absolute top-0 left-1/2 w-[500px] h-[500px] bg-accent-orange/5 rounded-full blur-3xl -translate-x-1/2" />

      <div ref={ref} className="max-w-[1200px] mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-blue font-montserrat font-semibold text-sm uppercase tracking-widest">Por que Escolher a Winner?</span>
          <h2 className="font-montserrat font-bold text-3xl md:text-4xl lg:text-5xl text-white mt-3 mb-6">
            Nossos Diferenciais
          </h2>
          <p className="font-lato text-gray-400 text-lg max-w-2xl mx-auto">
            Compromisso com excelência e inovação em cada projeto que realizamos.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {differentials?.map((item, i) => {
            const Icon = item?.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
                className="group relative bg-navy/60 backdrop-blur-sm p-8 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
              >
                {/* Hover gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/5 to-accent-orange/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-accent-blue/20 to-accent-orange/10 rounded-lg flex items-center justify-center mb-5">
                    {Icon ? <Icon size={26} className="text-accent-blue" /> : null}
                  </div>
                  <h3 className="font-montserrat font-bold text-xl text-white mb-3">{item?.title}</h3>
                  <p className="font-lato text-gray-400 leading-relaxed">{item?.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
