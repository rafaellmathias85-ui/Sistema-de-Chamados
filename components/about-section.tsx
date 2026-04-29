"use client";

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Target, Eye, Gem, Users, TrendingUp, Award } from 'lucide-react';

const values = [
  { icon: Target, title: 'Missão', desc: 'Oferecer soluções tecnológicas inovadoras que protejam, otimizem e transformem os negócios de nossos clientes.' },
  { icon: Eye, title: 'Visão', desc: 'Ser referência nacional em segurança digital e infraestrutura de TI, reconhecida pela excelência e compromisso.' },
  { icon: Gem, title: 'Valores', desc: 'Integridade, inovação contínua, foco no cliente, excelência técnica e compromisso com resultados.' },
];

const highlights = [
  { icon: Users, title: 'Personalização', desc: 'Soluções sob medida para cada perfil de negócio.' },
  { icon: TrendingUp, title: 'Eficiência', desc: 'Processos otimizados para máxima performance.' },
  { icon: Award, title: 'Compromisso', desc: 'Parcerias de longo prazo, alguns clientes há mais de 10 anos.' },
];

export default function AboutSection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section id="sobre" className="py-20 md:py-28 bg-navy-light relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-orange/5 rounded-full blur-3xl" />

      <div ref={ref} className="max-w-[1200px] mx-auto px-4 sm:px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-blue font-montserrat font-semibold text-sm uppercase tracking-widest">Quem Somos</span>
          <h2 className="font-montserrat font-bold text-3xl md:text-4xl lg:text-5xl text-white mt-3 mb-6">
            Excelência em Soluções de TI
          </h2>
          <p className="font-lato text-gray-400 text-lg max-w-3xl mx-auto">
            A Winner Tecnologia transforma desafios tecnológicos em vantagem competitiva para empresas de pequeno, médio e grande porte. Com mais de uma década de experiência, somos parceiros estratégicos na jornada de transformação digital.
          </p>
        </motion.div>

        {/* Mission/Vision/Values */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {values?.map((item, i) => {
            const Icon = item?.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
                className="group bg-navy/60 backdrop-blur-sm p-8 rounded-lg shadow-lg hover:shadow-xl hover:shadow-accent-blue/10 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="w-12 h-12 bg-accent-blue/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-accent-blue/20 transition-colors">
                  {Icon ? <Icon size={24} className="text-accent-blue" /> : null}
                </div>
                <h3 className="font-montserrat font-bold text-xl text-white mb-3">{item?.title}</h3>
                <p className="font-lato text-gray-400 leading-relaxed">{item?.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Highlights */}
        <div className="grid md:grid-cols-3 gap-6">
          {highlights?.map((item, i) => {
            const Icon = item?.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
                className="flex items-start gap-4 p-6 rounded-lg bg-navy/40 hover:bg-navy/60 transition-all duration-300"
              >
                <div className="w-10 h-10 bg-accent-orange/10 rounded-lg flex items-center justify-center shrink-0">
                  {Icon ? <Icon size={20} className="text-accent-orange" /> : null}
                </div>
                <div>
                  <h4 className="font-montserrat font-semibold text-white mb-1">{item?.title}</h4>
                  <p className="font-lato text-gray-400 text-sm">{item?.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
