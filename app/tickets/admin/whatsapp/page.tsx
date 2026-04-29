'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Wifi, WifiOff, Save, ArrowLeft, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react';

interface WhatsAppConfig {
  id: string;
  gateway: string;
  instanceName: string | null;
  apiKey: string | null;
  apiUrl: string | null;
  webhookSecret: string | null;
  phoneNumber: string | null;
  status: string;
}

export default function WhatsAppConfigPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    gateway: 'EVOLUTION',
    instanceName: '',
    apiKey: '',
    apiUrl: '',
    webhookSecret: '',
    phoneNumber: '',
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/whatsapp/config');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setConfig(data);
          setForm({
            gateway: data.gateway || 'EVOLUTION',
            instanceName: data.instanceName || '',
            apiKey: data.apiKey || '',
            apiUrl: data.apiUrl || '',
            webhookSecret: data.webhookSecret || '',
            phoneNumber: data.phoneNumber || '',
          });
        }
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setSuccessMsg('Configuração salva com sucesso!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error saving config:', err);
    }
    setSaving(false);
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/webhook`
    : '/api/whatsapp/webhook';

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = config?.status === 'connected' ? 'text-green-400' : config?.status === 'connecting' ? 'text-yellow-400' : 'text-red-400';
  const statusLabel = config?.status === 'connected' ? 'Conectado' : config?.status === 'connecting' ? 'Conectando...' : 'Inativo';

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="tm-text">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/tickets/admin')} className="p-2 rounded-lg hover:bg-white/10 tm-text-secondary">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <MessageSquare className="text-green-400" size={28} />
            Integração WhatsApp
          </h1>
          <p className="tm-text-secondary text-sm mt-1">Configure a integração com WhatsApp para atendimento automático</p>
        </div>
      </div>

      {/* Status Card */}
      <div className="tm-bg-card border tm-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config?.status === 'connected' ? (
              <Wifi className="text-green-400" size={24} />
            ) : (
              <WifiOff className="text-red-400" size={24} />
            )}
            <div>
              <p className={`font-semibold ${statusColor}`}>{statusLabel}</p>
              <p className="tm-text-muted text-xs">
                {config ? `Gateway: ${config.gateway}` : 'Nenhuma configuração encontrada'}
              </p>
            </div>
          </div>
          {config?.phoneNumber && (
            <span className="tm-text-secondary text-sm">{config.phoneNumber}</span>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-yellow-200 font-medium text-sm">Configuração para Ativação Futura</p>
          <p className="text-yellow-200/70 text-xs mt-1">
            Preencha os dados abaixo quando tiver sua conta no gateway de WhatsApp configurada.
            Após salvar, configure o webhook no painel do seu gateway apontando para a URL abaixo.
          </p>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="tm-bg-card border tm-border rounded-xl p-5">
        <label className="block text-sm font-semibold tm-text mb-2">URL do Webhook (cole no painel do gateway)</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={webhookUrl}
            className="flex-1 px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm font-mono"
          />
          <button
            onClick={copyWebhookUrl}
            className="p-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
            title="Copiar"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="tm-bg-card border tm-border rounded-xl p-6 space-y-5">
          <h2 className="font-semibold tm-text text-lg">Configurações do Gateway</h2>

          {/* Gateway */}
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1.5">Gateway de WhatsApp</label>
            <select
              value={form.gateway}
              onChange={e => setForm({ ...form, gateway: e.target.value })}
              className="w-full px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm"
            >
              <option value="EVOLUTION">Evolution API</option>
              <option value="ZAPI">Z-API</option>
              <option value="META">Meta Business (API Oficial)</option>
            </select>
          </div>

          {/* Instance Name */}
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1.5">Nome da Instância</label>
            <input
              type="text"
              value={form.instanceName}
              onChange={e => setForm({ ...form, instanceName: e.target.value })}
              placeholder="Ex: winner-suporte"
              className="w-full px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm"
            />
          </div>

          {/* API URL */}
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1.5">URL da API</label>
            <input
              type="text"
              value={form.apiUrl}
              onChange={e => setForm({ ...form, apiUrl: e.target.value })}
              placeholder={form.gateway === 'ZAPI' ? 'https://api.z-api.io/instances/SEU_ID/token/SEU_TOKEN' : form.gateway === 'EVOLUTION' ? 'https://sua-instancia.evolution-api.com' : 'https://graph.facebook.com/v18.0'}
              className="w-full px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1.5">Chave de API / Token</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm({ ...form, apiKey: e.target.value })}
              placeholder="Cole sua chave de API aqui"
              className="w-full px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm"
            />
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1.5">Segredo do Webhook (opcional)</label>
            <input
              type="text"
              value={form.webhookSecret}
              onChange={e => setForm({ ...form, webhookSecret: e.target.value })}
              placeholder="Segredo para validar webhooks recebidos"
              className="w-full px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1.5">Número do WhatsApp</label>
            <input
              type="text"
              value={form.phoneNumber}
              onChange={e => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="5511999999999"
              className="w-full px-3 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
            >
              <Save size={18} />
              {saving ? 'Salvando...' : 'Salvar Configuração'}
            </button>
            {successMsg && (
              <span className="text-green-400 text-sm font-medium">{successMsg}</span>
            )}
          </div>

          {/* Gateway Links */}
          <div className="border-t tm-border pt-4 mt-4">
            <p className="tm-text-muted text-xs mb-2">Links úteis:</p>
            <div className="flex flex-wrap gap-3">
              <a href="https://doc.evolution-api.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                <ExternalLink size={12} /> Documentação Evolution API
              </a>
              <a href="https://developer.z-api.io/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                <ExternalLink size={12} /> Documentação Z-API
              </a>
              <a href="https://developers.facebook.com/docs/whatsapp" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                <ExternalLink size={12} /> Meta WhatsApp Business
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
