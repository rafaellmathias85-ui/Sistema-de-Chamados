'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2, KeyRound, CheckCircle, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'code' | 'newPassword' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetMfa, setResetMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mfaWasReset, setMfaWasReset] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStep('code');
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao enviar código');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'code') {
      if (!code.trim() || code.trim().length < 6) {
        setError('Digite o código de 6 dígitos');
        return;
      }
      setError('');
      setStep('newPassword');
      return;
    }

    // step === 'newPassword'
    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim(), newPassword, resetMfa }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMfaWasReset(!!data.mfaReset);
        setStep('success');
      } else {
        setError(data.error || 'Erro ao redefinir senha');
        if (data.error?.includes('Código')) {
          setStep('code');
        }
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-orange/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="relative w-16 h-16">
                <Image
                  src="/favicon.png"
                  alt="Logo"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <h1 className="text-2xl font-montserrat font-bold text-white mb-2">
              {step === 'success' ? 'Senha Redefinida!' : 'Recuperar Senha'}
            </h1>
            <p className="text-gray-400 text-sm">
              {step === 'email' && 'Digite seu email para receber o código de recuperação'}
              {step === 'code' && 'Verifique seu email e digite o código recebido'}
              {step === 'newPassword' && 'Defina sua nova senha'}
              {step === 'success' && 'Sua senha foi alterada com sucesso'}
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg mb-5"
            >
              {error}
            </motion.div>
          )}

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
                    placeholder="seu@email.com"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : 'Enviar Código'}
              </button>
            </form>
          )}

          {/* Step 2: Code */}
          {step === 'code' && (
            <form onSubmit={handleVerifyAndReset} className="space-y-5">
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-blue-500/10 rounded-full">
                  <KeyRound className="w-10 h-10 text-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Código de Verificação</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  required
                />
              </div>
              <p className="text-xs text-gray-500 text-center">O código expira em 15 minutos</p>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); }}
                className="w-full text-sm text-gray-400 hover:text-white transition-colors text-center"
              >
                Reenviar código
              </button>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === 'newPassword' && (
            <form onSubmit={handleVerifyAndReset} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nova Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
                    placeholder="Repita a nova senha"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              {/* MFA Reset Option */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetMfa}
                    onChange={(e) => setResetMfa(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-white/30 bg-white/10 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm text-orange-300 font-medium flex items-center gap-1">
                      <Shield size={14} />
                      Resetar autenticação em duas etapas (MFA)
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Marque se você perdeu acesso ao app autenticador. O MFA será desativado e poderá ser reconfigurado.
                    </p>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Redefinindo...</> : 'Redefinir Senha'}
              </button>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="text-center space-y-5">
              <div className="flex justify-center">
                <div className="p-4 bg-green-500/10 rounded-full">
                  <CheckCircle className="w-12 h-12 text-green-400" />
                </div>
              </div>
              <p className="text-gray-300">Sua senha foi redefinida com sucesso.</p>
              {mfaWasReset && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm text-orange-300">
                  <Shield className="inline w-4 h-4 mr-1" />
                  A autenticação em duas etapas (MFA) foi resetada. Você poderá reconfigurá-la no próximo login.
                </div>
              )}
              <Link
                href="/login"
                className="inline-block w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity text-center"
              >
                Ir para o Login
              </Link>
            </div>
          )}

          {/* Back to login */}
          {step !== 'success' && (
            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="text-sm text-gray-400 hover:text-accent-blue transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                Voltar ao login
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
