"use client";

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  Shield,
  Cloud,
  Laptop,
  Database,
  Lock,
  Activity,
  ChevronRight,
  Check,
  ArrowRight
} from 'lucide-react';

const services = [
  {
    id: 'cyber',
    icon: Shield,
    title: 'Cyber Security',
    shortDesc: 'Proteção avançada contra ameaças digitais',
    description: 'Soluções completas de segurança cibernética para proteger seus dados, sistemas e infraestrutura contra as ameaças mais sofisticadas do mercado.',
    features: [
      'Monitoramento de ameaças 24/7',
      'Análise de vulnerabilidades',
      'Testes de penetração (Pentest)',
      'Resposta a incidentes',
      'Compliance LGPD',
      'Treinamento de segurança'
    ],
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    id: 'cloud',
    icon: Cloud,
    title: 'Cloud Computing',
    shortDesc: 'Azure e AWS para sua empresa',
    description: 'Migração e gestão de ambientes em nuvem com os principais provedores do mercado. Escalabilidade, segurança e economia para o seu negócio.',
    features: [
      'Migração para nuvem',
      'Arquitetura cloud-native',
      'Microsoft Azure',
      'Amazon Web Services (AWS)',
      'Otimização de custos',
      'Disaster Recovery'
    ],
    color: 'from-cyan-500 to-teal-500',
    bgColor: 'bg-cyan-500/10'
  },
  {
    id: 'm365',
    icon: Laptop,
    title: 'Microsoft 365 & Intune',
    shortDesc: 'Produtividade e gestão de dispositivos',
    description: 'Maximize a produtividade da sua equipe com Microsoft 365 e gerencie todos os dispositivos da empresa de forma centralizada com Intune.',
    features: [
      'Licenciamento Microsoft 365',
      'Migração de e-mails',
      'Microsoft Teams',
      'SharePoint & OneDrive',
      'Microsoft Intune (MDM)',
      'Políticas de segurança'
    ],
    color: 'from-teal-500 to-green-500',
    bgColor: 'bg-teal-500/10'
  },
  {
    id: 'backup',
    icon: Database,
    title: 'Backup em Nuvem',
    shortDesc: 'Proteção total dos seus dados',
    description: 'Soluções de backup gerenciado que garantem a segurança e disponibilidade dos seus dados críticos, com recuperação rápida em caso de desastres.',
    features: [
      'Backup automático',
      'Replicação geográfica',
      'Criptografia end-to-end',
      'Testes de restauração',
      'Proteção anti-ransomware',
      'Compliance LGPD'
    ],
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10'
  },
  {
    id: 'antivirus',
    icon: Lock,
    title: 'Antivírus BitDefender',
    shortDesc: 'Proteção endpoint líder mundial',
    description: 'Parceiros oficiais BitDefender GravityZone. Proteção de classe mundial contra vírus, ransomware e ameaças avançadas, com gestão centralizada.',
    features: [
      'BitDefender GravityZone',
      'Detecção avançada (EDR)',
      'Anti-ransomware',
      'Firewall integrado',
      'Console centralizado',
      'Relatórios detalhados'
    ],
    color: 'from-emerald-500 to-accent-blue',
    bgColor: 'bg-emerald-500/10'
  },
  {
    id: 'monitoramento',
    icon: Activity,
    title: 'Monitoramento 24/7',
    shortDesc: 'Infraestrutura monitorada em tempo real',
    description: 'Monitoramento contínuo da sua infraestrutura com identificação proativa de problemas, alertas em tempo real e SLA garantido. Sua TI em boas mãos.',
    features: [
      'Monitoramento proativo',
      'Alertas em tempo real',
      'SLA de 4 horas',
      'Análise de performance',
      'NOC dedicado',
      'Gestão de incidentes'
    ],
    color: 'from-accent-blue to-accent-orange',
    bgColor: 'bg-accent-blue/10'
  }
];

export default function ServicesSection() {
  const [activeService, setActiveService] = useState(services[0]);

  return (
    <section id="servicos" className="py-24 bg-navy">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-orange font-montserrat font-semibold text-sm uppercase tracking-widest">
            Nossas Soluções
          </span>
          <h2 className="font-montserrat font-bold text-3xl sm:text-4xl md:text-5xl text-white mt-4 mb-4">
            Serviços <span className="text-accent-blue">Especializados</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Soluções completas em tecnologia para proteger e impulsionar o seu negócio
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Service Navigation */}
          <div className="lg:col-span-4">
            <div className="space-y-3">
              {services.map((service, index) => (
                <motion.button
                  key={service.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  onClick={() => setActiveService(service)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300 text-left group ${
                    activeService.id === service.id
                      ? 'bg-gradient-to-r ' + service.color + ' shadow-lg'
                      : 'bg-[#112240] hover:bg-[#1a3154] border border-accent-blue/20'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    activeService.id === service.id ? 'bg-white/20' : service.bgColor
                  }`}>
                    <service.icon className={`w-6 h-6 ${
                      activeService.id === service.id ? 'text-white' : 'text-accent-blue'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold truncate ${
                      activeService.id === service.id ? 'text-white' : 'text-white'
                    }`}>
                      {service.title}
                    </h3>
                    <p className={`text-sm truncate ${
                      activeService.id === service.id ? 'text-white/80' : 'text-gray-400'
                    }`}>
                      {service.shortDesc}
                    </p>
                  </div>
                  <ChevronRight className={`w-5 h-5 flex-shrink-0 transition-transform ${
                    activeService.id === service.id ? 'text-white rotate-90' : 'text-gray-500 group-hover:translate-x-1'
                  }`} />
                </motion.button>
              ))}
            </div>
          </div>

          {/* Service Details */}
          <div className="lg:col-span-8">
            <motion.div
              key={activeService.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-[#112240] rounded-2xl p-8 border border-accent-blue/20 h-full"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${activeService.color} flex items-center justify-center flex-shrink-0`}>
                  <activeService.icon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="font-montserrat font-bold text-2xl text-white mb-2">
                    {activeService.title}
                  </h3>
                  <p className="text-gray-400">{activeService.description}</p>
                </div>
              </div>

              <div className="mb-8">
                <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="w-8 h-0.5 bg-accent-orange"></span>
                  Recursos Incluídos
                </h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  {activeService.features.map((feature, index) => (
                    <motion.div
                      key={feature}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="flex items-center gap-3 text-gray-300"
                    >
                      <Check className="w-5 h-5 text-accent-blue flex-shrink-0" />
                      <span>{feature}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => document.querySelector('#contato')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-orange to-orange-600 text-white font-semibold px-6 py-3 rounded-full hover:shadow-lg hover:shadow-accent-orange/30 transition-all duration-300 group"
              >
                Solicitar Proposta
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
