'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaUserId, setMfaUserId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  // MFA Setup state
  const [setupQr, setSetupQr] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [setupStep, setSetupStep] = useState<'qr' | 'verify'>('qr');
  const [setupCode, setSetupCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Check if MFA is required
        if (result.error.includes('MFA_SETUP_REQUIRED')) {
          const userId = result.error.split(':')[1];
          setMfaUserId(userId);
          setMfaSetupRequired(true);
          setSetupStep('qr');
          setSetupCode('');
          // Initiate MFA setup
          try {
            const setupRes = await fetch('/api/mfa/setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId }),
            });
            if (setupRes.ok) {
              const data = await setupRes.json();
              setSetupQr(data.qrCode || '');
              setSetupSecret(data.secret || '');
              setSetupBackupCodes(data.backupCodes || []);
            } else {
              setError('Erro ao iniciar configuração MFA');
            }
          } catch {
            setError('Erro ao iniciar configuração MFA');
          }
        } else if (result.error.includes('MFA_REQUIRED')) {
          const userId = result.error.split(':')[1];
          setMfaUserId(userId);
          setMfaRequired(true);
          setMfaCode('');
        } else if (result.error.includes('MFA_INVALID')) {
          setError('Verificação MFA inválida');
        } else {
          setError('Email ou senha inválidos');
        }
      } else {
        router.replace('/tickets');
      }
    } catch (err) {
      setError('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    setError('');

    try {
      // Verify MFA code via API
      const mfaRes = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: mfaUserId,
          code: mfaCode.replace(/\s/g, ''),
          isBackupCode: useBackupCode,
        }),
      });

      const mfaData = await mfaRes.json();

      if (!mfaRes.ok) {
        setError(mfaData.error || 'Código inválido');
        setMfaLoading(false);
        return;
      }

      // Now sign in with MFA token
      const result = await signIn('credentials', {
        email,
        password,
        mfaToken: mfaData.mfaToken,
        redirect: false,
      });

      if (result?.error) {
        setError('Erro na verificação MFA');
      } else {
        router.replace('/tickets');
      }
    } catch (err) {
      setError('Erro ao verificar MFA');
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      {/* Background decorations */}
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
                  alt="Winner Tecnologia"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <h1 className="text-2xl font-montserrat font-bold text-white mb-2">
              {mfaRequired ? 'Verificação em Duas Etapas' : 'Sistema de Chamados'}
            </h1>
            <p className="text-gray-400 text-sm">
              {mfaRequired ? 'Digite o código do seu autenticador' : 'Winner Tecnologia'}
            </p>
          </div>

          {/* MFA Setup Form (enforced by admin) */}
          {mfaSetupRequired ? (
            <div className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg"
                >
                  {error}
                </motion.div>
              )}

              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm text-orange-300">
                <Shield className="inline w-4 h-4 mr-1" />
                O administrador exige que você configure a autenticação em duas etapas (MFA).
              </div>

              {setupStep === 'qr' && (
                <>
                  <div className="text-center">
                    <p className="text-gray-300 text-sm mb-3">
                      Escaneie o QR Code com seu app autenticador (Google Authenticator, Authy, etc):
                    </p>
                    {setupQr && (
                      <div className="inline-block p-3 bg-white rounded-lg">
                        <img src={setupQr} alt="QR Code MFA" className="w-48 h-48" />
                      </div>
                    )}
                    {setupSecret && (
                      <div className="mt-3">
                        <p className="text-gray-500 text-xs mb-1">Ou insira manualmente:</p>
                        <code className="text-sm text-blue-400 bg-black/30 px-3 py-1 rounded font-mono break-all">{setupSecret}</code>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSetupStep('verify')}
                    className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Já escaneei, continuar
                  </button>
                </>
              )}

              {setupStep === 'verify' && (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setMfaLoading(true);
                  setError('');
                  try {
                    const confirmRes = await fetch('/api/mfa/confirm', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ code: setupCode.replace(/\s/g, ''), userId: mfaUserId }),
                    });
                    const confirmData = await confirmRes.json();
                    if (!confirmRes.ok) {
                      setError(confirmData.error || 'Código inválido');
                      setMfaLoading(false);
                      return;
                    }
                    if (confirmData.backupCodes?.length > 0) {
                      setSetupBackupCodes(confirmData.backupCodes);
                    }
                    // MFA is now enabled, proceed to verify and login
                    const verifyRes = await fetch('/api/mfa/verify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: mfaUserId, code: setupCode.replace(/\s/g, ''), isBackupCode: false }),
                    });
                    const verifyData = await verifyRes.json();
                    if (!verifyRes.ok) {
                      setError(verifyData.error || 'Erro na verificação');
                      setMfaLoading(false);
                      return;
                    }
                    // Sign in with MFA token
                    const result = await signIn('credentials', {
                      email,
                      password,
                      mfaToken: verifyData.mfaToken,
                      redirect: false,
                    });
                    if (result?.error) {
                      setError('Erro ao concluir login');
                    } else {
                      router.replace('/tickets');
                    }
                  } catch {
                    setError('Erro ao confirmar MFA');
                  } finally {
                    setMfaLoading(false);
                  }
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Digite o código do app autenticador
                    </label>
                    <input
                      type="text"
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 text-white text-center text-xl tracking-[0.3em] font-mono placeholder-gray-500 focus:outline-none focus:border-accent-blue/50"
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={mfaLoading}
                    className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {mfaLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Ativando...
                      </>
                    ) : (
                      'Ativar MFA e Entrar'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupStep('qr')}
                    className="w-full text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    ← Ver QR Code novamente
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setMfaSetupRequired(false);
                  setError('');
                }}
                className="w-full text-sm text-gray-400 hover:text-white transition-colors text-center"
              >
                Voltar ao login
              </button>
            </div>
          ) : mfaRequired ? (
            <form onSubmit={handleMfaVerify} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg"
                >
                  {error}
                </motion.div>
              )}

              <div className="flex justify-center mb-4">
                <div className="p-4 bg-blue-500/10 rounded-full">
                  <KeyRound className="w-10 h-10 text-blue-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {useBackupCode ? 'Código de Backup' : 'Código TOTP'}
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors text-center text-xl tracking-[0.3em] font-mono"
                    placeholder={useBackupCode ? 'XXXX-XXXX' : '000000'}
                    maxLength={useBackupCode ? 9 : 6}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={mfaLoading}
                className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {mfaLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Verificar'
                )}
              </button>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setMfaCode('');
                    setError('');
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {useBackupCode ? 'Usar código do app' : 'Usar código de backup'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaRequired(false);
                    setMfaCode('');
                    setError('');
                    setMfaUserId('');
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Voltar ao login
                </button>
              </div>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg"
                >
                  {error}
                </motion.div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
                    placeholder="••••••••"
                    required
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-accent-blue to-accent-orange text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </button>

              <div className="text-center">
                <a
                  href="/forgot-password"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Esqueceu a senha?
                </a>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-gray-400 hover:text-accent-blue transition-colors"
            >
              ← Voltar ao site
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
