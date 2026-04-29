"use client";

import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import { Shield, Users, Clock, Award, TrendingUp, CheckCircle } from 'lucide-react';

function AnimatedCounter({ value, suffix = '', duration = 2 }: { value: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (isInView) {
      let start = 0;
      const end = value;
      const incrementTime = (duration * 1000) / end;
      const timer = setInterval(() => {
        start += 1;
        setDisplayValue(start);
        if (start >= end) clearInterval(timer);
      }, incrementTime);
      return () => clearInterval(timer);
    }
  }, [isInView, value, duration]);

  return <span ref={ref}>{displayValue}{suffix}</span>;
}

const stats = [
  {
    icon: Clock,
    value: 13,
    suffix: '+',
    label: 'Anos de Experiência',
    description: 'No mercado de tecnologia'
  },
  {
    icon: Users,
    value: 200,
    suffix: '+',
    label: 'Empresas Atendidas',
    description: 'Em todo o Brasil'
  },
  {
    icon: Shield,
    value: 99,
    suffix: '%',
    label: 'Uptime Garantido',
    description: 'Disponibilidade dos sistemas'
  },
  {
    icon: CheckCircle,
    value: 98,
    suffix: '%',
    label: 'Satisfação',
    description: 'Clientes satisfeitos'
  },
  {
    icon: TrendingUp,
    value: 24,
    suffix: '/7',
    label: 'Monitoramento',
    description: 'Suporte ininterrupto'
  },
  {
    icon: Award,
    value: 10,
    suffix: '+',
    label: 'Certificações',
    description: 'Profissionais certificados'
  }
];

export default function StatsSection() {
  return (
    <section className="relative py-20 bg-gradient-to-b from-navy via-[#0d1f3c] to-navy overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-orange font-montserrat font-semibold text-sm uppercase tracking-widest">
            Nossos Números
          </span>
          <h2 className="font-montserrat font-bold text-3xl sm:text-4xl md:text-5xl text-white mt-4 mb-4">
            Resultados que <span className="text-accent-blue">Comprovam</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Números que refletem nosso compromisso com a excelência e a satisfação dos nossos clientes
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative group"
            >
              <div className="bg-[#112240]/80 backdrop-blur-sm border border-accent-blue/20 rounded-2xl p-6 text-center h-full hover:border-accent-blue/50 transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-12 h-12 mx-auto mb-4 bg-accent-blue/10 rounded-xl flex items-center justify-center group-hover:bg-accent-blue/20 transition-colors">
                  <stat.icon className="w-6 h-6 text-accent-blue" />
                </div>
                <div className="font-montserrat font-bold text-3xl md:text-4xl text-white mb-2">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </div>
                <div className="font-semibold text-white text-sm mb-1">{stat.label}</div>
                <div className="text-gray-500 text-xs">{stat.description}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
