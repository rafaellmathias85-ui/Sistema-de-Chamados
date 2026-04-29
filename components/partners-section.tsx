"use client";

import { motion } from 'framer-motion';
import Image from 'next/image';

const partners = [
  {
    name: 'Microsoft',
    logo: '/partners/microsoft.png',
    description: 'Partner Gold'
  },
  {
    name: 'Microsoft Azure',
    logo: '/partners/azure.png',
    description: 'Cloud Solutions'
  },
  {
    name: 'Amazon Web Services',
    logo: '/partners/aws.png',
    description: 'Cloud Partner'
  },
  {
    name: 'BitDefender',
    logo: '/partners/bitdefender.png',
    description: 'Security Partner'
  },
  {
    name: 'Microsoft 365',
    logo: '/partners/m365.png',
    description: 'Produtividade'
  },
  {
    name: 'Veeam',
    logo: '/partners/veeam.png',
    description: 'Backup Solutions'
  }
];

export default function PartnersSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-orange font-montserrat font-semibold text-sm uppercase tracking-widest">
            Tecnologias e Parcerias
          </span>
          <h2 className="font-montserrat font-bold text-3xl sm:text-4xl md:text-5xl text-navy mt-4 mb-4">
            Trabalhamos com os <span className="text-accent-blue">Melhores</span>
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-lg">
            Parcerias estratégicas com líderes globais em tecnologia para entregar as melhores soluções
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {partners.map((partner, index) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="group"
            >
              <div className="bg-gray-50 rounded-2xl p-6 h-32 flex flex-col items-center justify-center hover:shadow-lg hover:shadow-accent-blue/10 transition-all duration-300 border border-gray-100 hover:border-accent-blue/30">
                <div className="relative w-full h-12 mb-2 grayscale group-hover:grayscale-0 transition-all duration-300">
                  <Image
                    src={partner.logo}
                    alt={partner.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xs text-gray-500 font-medium">{partner.description}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Certifications Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 text-center"
        >
          <div className="inline-flex items-center gap-4 bg-gradient-to-r from-accent-blue/10 to-accent-orange/10 rounded-full px-8 py-4 border border-accent-blue/20">
            <div className="w-10 h-10 bg-accent-blue rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-left">
              <div className="font-semibold text-navy">Equipe Certificada</div>
              <div className="text-sm text-gray-600">Microsoft, AWS, Azure, ITIL, ISO 27001</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
