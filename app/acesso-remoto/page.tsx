'use client';

import { motion } from 'framer-motion';
import { Download, Shield, Monitor, CheckCircle2, Lock, Zap, Users } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';

export default function AcessoRemotoPage() {
  const openExternal = (url: string) => {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-navy via-navy-light to-navy pt-24 pb-20">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-blue to-blue-600 mb-6 shadow-2xl shadow-accent-blue/30">
              <Monitor className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Acesso Remoto &amp; Suporte
            </h1>
            <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
              Baixe a ferramenta de acesso remoto e permita que nossa equipe técnica
              solucione seus problemas em tempo real, com segurança e rapidez.
            </p>
          </motion.div>

          {/* Tools Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* AnyDesk Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-light to-slate-800/50 border border-white/10 p-8 hover:border-red-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/20"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all" />
              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                    <svg
                      xmlns="https://lh3.googleusercontent.com/64GWPJbpSJKB2hejLK02GLHjflv2B8cCr7SJUQI7cHXO0Qakc28U-ZRw7IRL3WadD8Stugb1HB4GgpqEkRydsEaR9AC4SqrTeRlCDlo=w1064-v0"
                      viewBox="0 0 24 24"
                      fill="white"
                      className="w-9 h-9"
                    >
                      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.311L18.7 8 12 11.689 5.3 8 12 4.311zM5 9.441l6 3.311v7.107l-6-3.33V9.441zm14 7.088l-6 3.33v-7.107l6-3.311v7.088z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                    Recomendado
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">AnyDesk</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Acesso remoto rápido, leve e seguro. Ideal para suporte imediato
                  em estações de trabalho e servidores Windows.
                </p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    Conexão em segundos
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    Criptografia TLS 1.2 / AES-256
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    Baixo consumo de rede
                  </li>
                </ul>
                <button
                  onClick={() =>
                    openExternal('https://anydesk.com/pt/downloads/thank-you?dv=win_exe')
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40"
                >
                  <Download className="w-5 h-5" />
                  Baixar AnyDesk
                </button>
              </div>
            </motion.div>

            {/* TeamViewer Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-light to-slate-800/50 border border-white/10 p-8 hover:border-blue-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/20"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                    <svg
                      xmlns="https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/White_circle_in_blue_background.svg/500px-White_circle_in_blue_background.svg.png"
                      viewBox="0 0 24 24"
                      fill="white"
                      className="w-9 h-9"
                    >
                      <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8zm-1-12h2v8h-2z" />
                      <circle cx="12" cy="17" r="1.2" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Corporativo
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">TeamViewer</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Solução corporativa para acesso remoto não assistido, reuniões
                  e colaboração entre equipes. Ideal para ambientes multiplataforma.
                </p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    Módulo customizado Winner Tecnologia
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    Segurança empresarial (2FA, Whitelist)
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    Compatível com macOS, Linux, iOS e Android
                  </li>
                </ul>
                <button
                  onClick={() => openExternal('https://www.898.tv/wticorp')}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
                >
                  <Download className="w-5 h-5" />
                  Baixar TeamViewer Winner
                </button>
              </div>
            </motion.div>
          </div>

          {/* Instructions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="rounded-2xl bg-navy-light/50 border border-white/10 p-6 md:p-8 mb-10"
          >
            <h3 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Shield className="w-6 h-6 text-accent-orange" />
              Como funciona o atendimento remoto
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 shrink-0 rounded-full bg-accent-blue/20 text-accent-blue font-bold flex items-center justify-center">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Baixe e execute</h4>
                  <p className="text-sm text-gray-400">
                    Baixe a ferramenta de sua preferência e execute em seu computador.
                    Não é necessário instalar.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 shrink-0 rounded-full bg-accent-blue/20 text-accent-blue font-bold flex items-center justify-center">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Informe seu ID</h4>
                  <p className="text-sm text-gray-400">
                    Compartilhe o ID e senha da sua sessão com o técnico Winner,
                    pelo telefone, WhatsApp ou chamado.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 shrink-0 rounded-full bg-accent-blue/20 text-accent-blue font-bold flex items-center justify-center">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Suporte em tempo real</h4>
                  <p className="text-sm text-gray-400">
                    Acompanhe tudo em sua tela. Você pode encerrar a sessão
                    a qualquer momento com um clique.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            <div className="flex flex-col items-center text-center p-5 rounded-xl bg-navy-light/30 border border-white/5">
              <Lock className="w-8 h-8 text-green-400 mb-2" />
              <div className="text-sm font-semibold text-white">Criptografia</div>
              <div className="text-xs text-gray-400 mt-1">AES-256 + TLS 1.2</div>
            </div>
            <div className="flex flex-col items-center text-center p-5 rounded-xl bg-navy-light/30 border border-white/5">
              <Zap className="w-8 h-8 text-yellow-400 mb-2" />
              <div className="text-sm font-semibold text-white">Conexão Rápida</div>
              <div className="text-xs text-gray-400 mt-1">&lt; 30 segundos</div>
            </div>
            <div className="flex flex-col items-center text-center p-5 rounded-xl bg-navy-light/30 border border-white/5">
              <Users className="w-8 h-8 text-accent-blue mb-2" />
              <div className="text-sm font-semibold text-white">Permissão Total</div>
              <div className="text-xs text-gray-400 mt-1">Você aprova tudo</div>
            </div>
            <div className="flex flex-col items-center text-center p-5 rounded-xl bg-navy-light/30 border border-white/5">
              <Shield className="w-8 h-8 text-accent-orange mb-2" />
              <div className="text-sm font-semibold text-white">Auditoria</div>
              <div className="text-xs text-gray-400 mt-1">Logs completos</div>
            </div>
          </motion.div>

          {/* Footer note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-12 text-center"
          >
            <p className="text-sm text-gray-400 mb-2">
              Precisa de ajuda? Entre em contato:
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
              <a
                href="tel:+551120832815"
                className="text-accent-blue hover:text-blue-300 transition-colors font-semibold"
              >
                📞 +55 (11) 2083-2815
              </a>
              <a
                href="tel:+5511986810480"
                className="text-accent-blue hover:text-blue-300 transition-colors font-semibold"
              >
                📱 +55 (11) 98681-0480
              </a>
              <a
                href="mailto:suporte@wticorp.com.br"
                className="text-accent-blue hover:text-blue-300 transition-colors font-semibold"
              >
                ✉️ suporte@wticorp.com.br
              </a>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
}
