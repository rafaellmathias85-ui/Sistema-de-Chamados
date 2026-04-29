"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import {
  Send, MapPin, Phone, Mail, Globe, CheckCircle, AlertCircle, Loader2, Building2
} from 'lucide-react';

export default function ContactSection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', company: '', subject: '', message: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e?.target ?? {};
    setFormData((prev) => ({ ...(prev ?? {}), [name ?? '']: value ?? '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData ?? {}),
      });

      if (!res?.ok) {
        const data = await res?.json?.().catch(() => ({}));
        throw new Error(data?.error ?? 'Erro ao enviar mensagem');
      }

      setStatus('success');
      setFormData({ name: '', email: '', phone: '', company: '', subject: '', message: '' });
    } catch (err: unknown) {
      setStatus('error');
      const message = err instanceof Error ? err?.message : 'Erro ao enviar mensagem';
      setErrorMsg(message ?? 'Erro ao enviar mensagem');
    }
  };

  return (
    <section id="contato" className="py-20 md:py-28 bg-navy-light relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl" />

      <div ref={ref} className="max-w-[1200px] mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent-blue font-montserrat font-semibold text-sm uppercase tracking-widest">Fale Conosco</span>
          <h2 className="font-montserrat font-bold text-3xl md:text-4xl lg:text-5xl text-white mt-3 mb-6">
            Entre em Contato
          </h2>
          <p className="font-lato text-gray-400 text-lg max-w-2xl mx-auto">
            Solicite um diagnóstico gratuito e descubra como podemos transformar a tecnologia da sua empresa.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Contact Info */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-2 space-y-6"
          >
            <div className="bg-navy/60 backdrop-blur-sm rounded-lg p-8 shadow-lg space-y-6">
              <h3 className="font-montserrat font-bold text-xl text-white mb-4">Informações</h3>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin size={20} className="text-accent-blue" />
                </div>
                <div>
                  <h4 className="font-montserrat font-semibold text-white text-sm">Endereço</h4>
                  <p className="font-lato text-gray-400 text-sm">Rua Brasil, 1170, CJ 34<br />Rudge Ramos, São Bernardo do Campo – SP</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center shrink-0">
                  <Phone size={20} className="text-accent-blue" />
                </div>
                <div>
                  <h4 className="font-montserrat font-semibold text-white text-sm">Telefone</h4>
                  <p className="font-lato text-gray-400 text-sm">+55 (11) 2083-2815</p>
                  <p className="font-lato text-gray-400 text-sm">+55 (11) 98681-0480</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center shrink-0">
                  <Mail size={20} className="text-accent-blue" />
                </div>
                <div>
                  <h4 className="font-montserrat font-semibold text-white text-sm">E-mail</h4>
                  <p className="font-lato text-gray-400 text-sm">atendimento@wticorp.com.br</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center shrink-0">
                  <Globe size={20} className="text-accent-blue" />
                </div>
                <div>
                  <h4 className="font-montserrat font-semibold text-white text-sm">Website</h4>
                  <a href="https://wticorp.com.br" target="_blank" rel="noopener noreferrer" className="font-lato text-accent-blue text-sm hover:underline">
                    www.wticorp.com.br
                  </a>
                </div>
              </div>
            </div>

            {/* WhatsApp button */}
            <a
              href="https://wa.me/5511986810480?text=Olá! Gostaria de saber mais sobre os serviços da Winner Tecnologia."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 bg-green-600 text-white font-montserrat font-semibold rounded-lg hover:bg-green-700 transition-all duration-300 shadow-lg shadow-green-600/25"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.462-1.496A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.34 0-4.512-.67-6.356-1.828a.75.75 0 00-.636-.079l-3.012 1.01 1.01-3.012a.75.75 0 00-.08-.637A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Falar pelo WhatsApp
            </a>
          </motion.div>

          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="lg:col-span-3"
          >
            <form onSubmit={handleSubmit} className="bg-navy/60 backdrop-blur-sm rounded-lg p-8 shadow-lg space-y-5">
              <h3 className="font-montserrat font-bold text-xl text-white mb-2">Solicite um Diagnóstico Gratuito</h3>
              <p className="font-lato text-gray-400 text-sm mb-6">Preencha o formulário e entraremos em contato em até 24 horas.</p>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block font-montserrat text-sm font-medium text-gray-300 mb-1.5">Nome *</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="name"
                      value={formData?.name ?? ''}
                      onChange={handleChange}
                      required
                      placeholder="Seu nome completo"
                      className="w-full pl-10 pr-4 py-3 bg-navy-lighter/80 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all text-sm"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Building2 size={16} /></span>
                  </div>
                </div>
                <div>
                  <label className="block font-montserrat text-sm font-medium text-gray-300 mb-1.5">E-mail *</label>
                  <div className="relative">
                    <input
                      type="email"
                      name="email"
                      value={formData?.email ?? ''}
                      onChange={handleChange}
                      required
                      placeholder="seu@email.com.br"
                      className="w-full pl-10 pr-4 py-3 bg-navy-lighter/80 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all text-sm"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Mail size={16} /></span>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block font-montserrat text-sm font-medium text-gray-300 mb-1.5">Telefone</label>
                  <div className="relative">
                    <input
                      type="tel"
                      name="phone"
                      value={formData?.phone ?? ''}
                      onChange={handleChange}
                      placeholder="(11) 99999-9999"
                      className="w-full pl-10 pr-4 py-3 bg-navy-lighter/80 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all text-sm"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Phone size={16} /></span>
                  </div>
                </div>
                <div>
                  <label className="block font-montserrat text-sm font-medium text-gray-300 mb-1.5">Empresa</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="company"
                      value={formData?.company ?? ''}
                      onChange={handleChange}
                      placeholder="Nome da empresa"
                      className="w-full pl-10 pr-4 py-3 bg-navy-lighter/80 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all text-sm"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Building2 size={16} /></span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-montserrat text-sm font-medium text-gray-300 mb-1.5">Assunto</label>
                <select
                  name="subject"
                  value={formData?.subject ?? ''}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-navy-lighter/80 border border-white/10 rounded-md text-white focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all text-sm"
                >
                  <option value="" className="bg-navy">Selecione um assunto</option>
                  <option value="Cyber Security" className="bg-navy">Cyber Security</option>
                  <option value="Cloud Computing" className="bg-navy">Cloud Computing (Azure/AWS)</option>
                  <option value="Microsoft 365" className="bg-navy">Microsoft 365 &amp; Intune</option>
                  <option value="Backup" className="bg-navy">Backup em Nuvem</option>
                  <option value="Antivirus" className="bg-navy">Antivírus BitDefender</option>
                  <option value="Suporte" className="bg-navy">Suporte Técnico</option>
                  <option value="Diagnostico" className="bg-navy">Diagnóstico Gratuito</option>
                  <option value="Outro" className="bg-navy">Outro</option>
                </select>
              </div>

              <div>
                <label className="block font-montserrat text-sm font-medium text-gray-300 mb-1.5">Mensagem *</label>
                <textarea
                  name="message"
                  value={formData?.message ?? ''}
                  onChange={handleChange}
                  required
                  rows={4}
                  placeholder="Descreva como podemos ajudar..."
                  className="w-full px-4 py-3 bg-navy-lighter/80 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all text-sm resize-none"
                />
              </div>

              {status === 'success' && (
                <div className="flex items-center gap-2 text-green-400 bg-green-400/10 p-4 rounded-md">
                  <CheckCircle size={18} />
                  <span className="font-lato text-sm">Mensagem enviada com sucesso! Entraremos em contato em breve.</span>
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-4 rounded-md">
                  <AlertCircle size={18} />
                  <span className="font-lato text-sm">{errorMsg || 'Erro ao enviar mensagem. Tente novamente.'}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full flex items-center justify-center gap-2 py-4 bg-accent-orange text-white font-montserrat font-bold rounded-md hover:bg-orange-600 transition-all duration-300 shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <><Loader2 size={18} className="animate-spin" /> Enviando...</>
                ) : (
                  <><Send size={18} /> Enviar Mensagem</>
                )}
              </button>

              <p className="font-lato text-xs text-gray-500 text-center">
                Seus dados estão protegidos e serão utilizados exclusivamente para contato comercial.
              </p>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
