'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  MessageCircle,
  User,
  Mail,
  AlertTriangle,
  FileText,
  Send,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

const WHATSAPP_NUMBER = '5511999999999'; // Substituir pelo número real

export default function WhatsAppTicketPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    priority: 'MEDIUM',
    subject: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [ticketCreated, setTicketCreated] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);

  const priorityOptions = [
    { value: 'LOW', label: 'Baixa', description: 'Pode aguardar', color: 'bg-green-500' },
    { value: 'MEDIUM', label: 'Média', description: 'Prazo normal', color: 'bg-yellow-500' },
    { value: 'HIGH', label: 'Alta', description: 'Urgente', color: 'bg-orange-500' },
    { value: 'CRITICAL', label: 'Crítica', description: 'Parou tudo!', color: 'bg-red-500' },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Tentar criar o chamado no sistema
      const res = await fetch('/api/tickets/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        setTicketNumber(data.number);
        setTicketCreated(true);
      }
    } catch (err) {
      console.error('Erro ao criar chamado:', err);
    }
    setLoading(false);
    
    // Gerar link do WhatsApp independentemente
    openWhatsApp();
  };

  const openWhatsApp = () => {
    const priorityLabel = priorityOptions.find(p => p.value === formData.priority)?.label || 'Média';
    
    const message = `*Novo Chamado de Suporte*\n\n` +
      `*Nome:* ${formData.name}\n` +
      `*Email:* ${formData.email}\n` +
      `*Empresa:* ${formData.company}\n` +
      `*Criticidade:* ${priorityLabel}\n\n` +
      `*Assunto:* ${formData.subject}\n\n` +
      `*Descrição:*\n${formData.description}` +
      (ticketNumber ? `\n\n_Chamado registrado: #${ticketNumber}_` : '');

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const isStep1Valid = formData.name && formData.email;
  const isStep2Valid = formData.priority;
  const isStep3Valid = formData.subject && formData.description;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1628] via-[#1a2744] to-[#0A1628]">
      {/* Header */}
      <header className="bg-[#0A1628]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="relative w-10 h-10">
            <Image src="/favicon.png" alt="Winner" fill className="object-contain" />
          </div>
          <div>
            <h1 className="text-white font-bold">Winner Tecnologia</h1>
            <p className="text-gray-400 text-sm">Abertura de Chamado via WhatsApp</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                  step >= s ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-400'
                }`}
              >
                {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
              </div>
              {i < 2 && (
                <div className={`w-16 h-1 mx-2 rounded ${step > s ? 'bg-green-500' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 md:p-8"
        >
          {/* Step 1: Dados Pessoais */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <User className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-white">Seus Dados</h2>
                <p className="text-gray-400">Precisamos saber quem você é</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nome Completo *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Seu nome"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">E-mail *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Empresa</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Nome da empresa"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!isStep1Valid}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continuar
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 2: Criticidade */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-white">Qual a Criticidade?</h2>
                <p className="text-gray-400">Isso nos ajuda a priorizar seu atendimento</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFormData({ ...formData, priority: opt.value })}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      formData.priority === opt.value
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full ${opt.color}`} />
                      <div className="text-left">
                        <p className="font-medium text-white">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-6 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!isStep2Valid}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50"
                >
                  Continuar
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Problema */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <FileText className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-white">Descreva o Problema</h2>
                <p className="text-gray-400">Quanto mais detalhes, mais rápido podemos ajudar</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Assunto *</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Resuma o problema em poucas palavras"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Descrição Detalhada *</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o problema com o máximo de detalhes possível...\n\n- O que aconteceu?\n- Quando começou?\n- O que você já tentou?"
                  rows={6}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 px-6 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!isStep3Valid || loading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-medium hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <MessageCircle className="w-5 h-5" />
                      Enviar via WhatsApp
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Resumo */}
        {step > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10"
          >
            <h3 className="text-sm font-medium text-gray-400 mb-2">Resumo</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="px-2 py-1 bg-white/10 rounded text-white">{formData.name}</span>
              <span className="px-2 py-1 bg-white/10 rounded text-gray-300">{formData.email}</span>
              {formData.company && (
                <span className="px-2 py-1 bg-white/10 rounded text-gray-300">{formData.company}</span>
              )}
              <span className={`px-2 py-1 rounded text-white ${
                priorityOptions.find(p => p.value === formData.priority)?.color
              }`}>
                {priorityOptions.find(p => p.value === formData.priority)?.label}
              </span>
            </div>
          </motion.div>
        )}

        {/* Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Ao enviar, você será redirecionado para o WhatsApp</p>
          <p>com todas as informações já preenchidas.</p>
        </div>
      </main>
    </div>
  );
}
