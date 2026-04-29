'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, ShieldCheck, ShieldAlert, QrCode, Key, Loader2, Copy, Check, X, AlertTriangle } from 'lucide-react';

export default function SecurityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState<any>(null);

  // Setup flow
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'confirm' | 'backup' | 'disable'>('idle');
  const [qrCode, setQrCode] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    else if (status === 'authenticated') loadStatus();
  }, [status]);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/mfa/status');
      if (res.ok) setMfaStatus(await res.json());
    } catch {}
    setLoading(false);
  };

  const startSetup = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mfa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setQrCode(data.qrCode);
      setManualKey(data.secret);
      setSetupStep('qr');
    } catch { setError('Erro ao iniciar configuração'); }
    finally { setActionLoading(false); }
  };

  const confirmSetup = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mfa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: confirmCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setActionLoading(false); return; }
      setBackupCodes(data.backupCodes);
      setSetupStep('backup');
      loadStatus();
    } catch { setError('Erro ao confirmar'); }
    finally { setActionLoading(false); }
  };

  const disableMfa = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setActionLoading(false); return; }
      setSetupStep('idle');
      setDisableCode('');
      loadStatus();
    } catch { setError('Erro ao desativar'); }
    finally { setActionLoading(false); }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === 'loading' || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tm-text flex items-center gap-3">
        <Shield className="w-7 h-7 text-blue-400" />
        Segurança da Conta
      </h1>

      {/* MFA Status Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {mfaStatus?.mfaEnabled ? (
              <ShieldCheck className="w-8 h-8 text-green-400" />
            ) : (
              <ShieldAlert className="w-8 h-8 text-yellow-400" />
            )}
            <div>
              <h2 className="text-lg font-semibold tm-text">Autenticação em Duas Etapas (MFA)</h2>
              <p className="text-sm tm-text-secondary">
                {mfaStatus?.mfaEnabled ? 'Ativada - Sua conta está protegida' : 'Desativada - Recomendamos ativar'}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${mfaStatus?.mfaEnabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            {mfaStatus?.mfaEnabled ? 'Ativa' : 'Inativa'}
          </span>
        </div>

        {mfaStatus?.mfaEnforced && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-sm text-blue-300">
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            MFA é obrigatório para sua conta (definido pelo administrador)
          </div>
        )}

        {mfaStatus?.mfaEnabled && (
          <div className="text-sm tm-text-secondary space-y-1 mb-4">
            <p>Códigos de backup restantes: <span className="tm-text font-medium">{mfaStatus.backupCodesRemaining}</span></p>
            {mfaStatus.mfaVerifiedAt && (
              <p>Última verificação: <span className="tm-text">{new Date(mfaStatus.mfaVerifiedAt).toLocaleString('pt-BR')}</span></p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {setupStep === 'idle' && (
          <div className="flex gap-3">
            {!mfaStatus?.mfaEnabled ? (
              <button onClick={startSetup} disabled={actionLoading} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Ativar MFA
              </button>
            ) : !mfaStatus?.mfaEnforced ? (
              <button onClick={() => { setSetupStep('disable'); setError(''); }} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                <X className="w-4 h-4" />
                Desativar MFA
              </button>
            ) : null}
          </div>
        )}
      </motion.div>

      {/* QR Code Step */}
      {setupStep === 'qr' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-6">
          <h3 className="text-lg font-semibold tm-text mb-4">1. Escaneie o QR Code</h3>
          <p className="text-sm tm-text-secondary mb-4">Use o Google Authenticator, Authy ou outro app compatível com TOTP.</p>
          
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-xl p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="QR Code MFA" className="w-48 h-48" />
            </div>
          </div>

          <div className="tm-bg-card border tm-border rounded-lg p-3 mb-4">
            <p className="text-xs tm-text-secondary mb-1">Chave manual (se não puder escanear):</p>
            <code className="text-sm text-blue-400 font-mono break-all">{manualKey}</code>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium tm-text">2. Digite o código de 6 dígitos gerado:</label>
            <input
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full tm-bg-card border tm-border rounded-lg px-4 py-3 tm-text text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:border-blue-500"
              maxLength={6}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={confirmSetup} disabled={actionLoading || confirmCode.length !== 6} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar
              </button>
              <button onClick={() => { setSetupStep('idle'); setError(''); }} className="px-4 py-2 tm-text-secondary hover:tm-text transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Backup Codes Step */}
      {setupStep === 'backup' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-green-400 mb-2 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> MFA Ativado com Sucesso!
          </h3>
          <p className="text-sm tm-text-secondary mb-4">Salve estes códigos de backup em um local seguro. Cada código só pode ser usado uma vez.</p>

          <div className="tm-bg-main border tm-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div key={i} className="text-center">
                  <code className="text-sm text-yellow-400 font-mono">{code}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={copyBackupCodes} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 tm-text rounded-lg transition-colors">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar Códigos'}
            </button>
            <button onClick={() => { setSetupStep('idle'); setBackupCodes([]); }} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              Concluído
            </button>
          </div>
        </motion.div>
      )}

      {/* Disable MFA */}
      {setupStep === 'disable' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border border-red-500/30 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Desativar MFA</h3>
          <p className="text-sm tm-text-secondary mb-4">Digite o código do seu autenticador para confirmar a desativação.</p>
          <input
            type="text"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full tm-bg-card border tm-border rounded-lg px-4 py-3 tm-text text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:border-red-500 mb-3"
            maxLength={6}
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={disableMfa} disabled={actionLoading || disableCode.length !== 6} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar Desativação
            </button>
            <button onClick={() => { setSetupStep('idle'); setError(''); }} className="px-4 py-2 tm-text-secondary hover:tm-text transition-colors">
              Cancelar
            </button>
          </div>
        </motion.div>
      )}

      {/* Info */}
      <div className="tm-bg-card border tm-border rounded-xl p-6">
        <h3 className="text-lg font-semibold tm-text mb-3">O que é MFA?</h3>
        <p className="text-sm tm-text-secondary leading-relaxed">
          A Autenticação em Duas Etapas (MFA) adiciona uma camada extra de segurança à sua conta.
          Além da senha, você precisa fornecer um código temporário gerado pelo seu app de autenticação
          (como Google Authenticator ou Authy). Isso impede que alguém acesse sua conta mesmo que tenha sua senha.
        </p>
      </div>
    </div>
  );
}
