"use client";

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { ArrowRight, Shield, Zap } from 'lucide-react';

export default function CtaSection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.2 });

  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/20 via-navy-light to-accent-orange/10" />
      <div className="absolute inset-0 bg-navy/60" />

      <div ref={ref} className="max-w-[1200px] mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="bg-gradient-to-r from-navy-light to-navy-lighter rounded-xl p-10 md:p-16 text-center shadow-2xl border border-white/5"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <Shield size={28} className="text-accent-blue" />
            <Zap size={28} className="text-accent-orange" />
          </div>
          <h2 className="font-montserrat font-bold text-3xl md:text-4xl lg:text-5xl text-white mb-6">
            Diagnóstico <span className="text-accent-orange">Gratuito</span>
          </h2>
          <p className="font-lato text-gray-300 text-lg max-w-2xl mx-auto mb-10">
            Descubra como podemos fortalecer a segurança e performance da sua infraestrutura de TI.
            Solicite uma avaliação completa sem compromisso.
          </p>
          <button
            onClick={() => {
              const el = document.querySelector('#contato');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="group inline-flex items-center gap-2 px-10 py-4 bg-accent-orange text-white font-montserrat font-bold text-lg rounded-md hover:bg-orange-600 transition-all duration-300 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50"
          >
            Solicitar Diagnóstico
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
