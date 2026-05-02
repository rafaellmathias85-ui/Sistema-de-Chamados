'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Settings,
  Mail,
  Phone,
  Bell,
  BellOff,
  Save,
  Send,
  Check,
  X,
  Loader2,
  MessageSquare,
  Clock,
  Users,
  Server,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Inbox,
  RefreshCw,
  Play,
  FolderInput,
  Ticket,
  AlertCircle,
  Palette,
  FileText,
  Image,
  User,
  Building2,
  Cloud,
  Zap,
  Upload,
} from 'lucide-react';

interface EmailConfig {
  id: string;
  supportEmail: string;
  supportPhone: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpSecure: boolean;
  smtpFrom: string | null;
  smtpFromName: string | null;
  imapEnabled: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  imapPass: string | null;
  imapSecure: boolean;
  imapFolder: string | null;
  imapProcessed: string | null;
  imapLastCheck: string | null;
  // Microsoft Graph API
  graphEnabled: boolean;
  graphTenantId: string | null;
  graphClientId: string | null;
  graphClientSecret: string | null;
  graphUserEmail: string | null;
  graphLastCheck: string | null;
  // Notificações
  notifyNewTicket: boolean;
  notifyTicketUpdate: boolean;
  notifyNewMessage: boolean;
  notifySLAWarning: boolean;
  notifyTicketResolved: boolean;
  notifyTicketClosed: boolean;
  notifyClientNewMessage: boolean;
  notifyClientStatusChange: boolean;
  // Template de Resposta
  templateLogoUrl: string | null;
  templateCompanyName: string | null;
  templatePrimaryColor: string | null;
  templateSecondaryColor: string | null;
  templateFooterText: string | null;
  templateSignatureTitle: string | null;
  templateContactInfo: string | null;
  templateShowTicketNumber: boolean;
  templateShowTechName: boolean;
}

interface ProcessedEmail {
  id: string;
  messageId: string;
  fromEmail: string;
  subject: string;
  status: string;
  errorMsg: string | null;
  processedAt: string;
  ticket: { number: number; subject: string } | null;
}

export default function EmailSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'smtp' | 'imap' | 'graph' | 'notifications' | 'template'>('smtp');
  const [imapFolders, setImapFolders] = useState<string[]>([]);
  const [recentEmails, setRecentEmails] = useState<ProcessedEmail[]>([]);
  const [processResult, setProcessResult] = useState<any>(null);
  // Microsoft Graph states
  const [testingGraph, setTestingGraph] = useState(false);
  const [processingGraph, setProcessingGraph] = useState(false);
  const [showGraphSecret, setShowGraphSecret] = useState(false);
  const [graphResult, setGraphResult] = useState<any>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session?.user?.role !== 'ADMIN') {
      router.push('/tickets');
    }
  }, [session, status, router]);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'imap') {
      loadEmailStatus();
    }
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/settings/email');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setTestEmail(data.supportEmail || '');
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmailStatus = async () => {
    try {
      const res = await fetch('/api/settings/email/process');
      if (res.ok) {
        const data = await res.json();
        setRecentEmails(data.recentEmails || []);
      }
    } catch (error) {
      console.error('Error loading email status:', error);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Erro ao salvar' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexão' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;

    setTesting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: `Email de teste enviado para ${testEmail}` });
        setTimeout(() => setMessage(null), 5000);
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Erro ao enviar email de teste' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexão' });
    } finally {
      setTesting(false);
    }
  };

  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const handleTestImap = async () => {
    if (!config?.imapHost || !config?.imapUser || !config?.imapPass) {
      setMessage({ type: 'error', text: 'Preencha host, email e senha IMAP' });
      return;
    }

    setTestingImap(true);
    setMessage(null);
    setImapFolders([]);
    setDebugInfo(null);

    try {
      const res = await fetch('/api/settings/email/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          host: config.imapHost,
          port: config.imapPort || 993,
          user: config.imapUser,
          pass: config.imapPass === '••••••••' ? undefined : config.imapPass,
          secure: config.imapSecure,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setImapFolders(data.folders || []);
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Erro ao testar conexão IMAP' });
        if (data.debug) {
          setDebugInfo(data.debug);
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexão' });
    } finally {
      setTestingImap(false);
    }
  };

  const handleProcessEmails = async () => {
    setProcessing(true);
    setMessage(null);
    setProcessResult(null);

    try {
      const res = await fetch('/api/settings/email/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      setProcessResult(data);

      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: `Processamento concluído! ${data.created} chamado(s) criado(s) de ${data.processed} email(s).` 
        });
        loadEmailStatus();
      } else {
        setMessage({ type: 'error', text: data.details?.[0]?.error || 'Erro ao processar emails' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexão' });
    } finally {
      setProcessing(false);
    }
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)} ${numbers.slice(2)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4)}`;
    return `${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4, 9)}-${numbers.slice(9, 13)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tm-text flex items-center gap-3">
              <Settings className="w-7 h-7 text-blue-400" />
              Configurações de Email
            </h1>
            <p className="tm-text-secondary mt-1">
              Configure SMTP, IMAP e notificações por email
            </p>
          </div>
        </div>

        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                : 'bg-red-500/20 border border-red-500/30 text-red-400'
            }`}
          >
            {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
            {message.text}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-700 pb-2">
          <button
            onClick={() => setActiveTab('smtp')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'smtp'
                ? 'bg-blue-600 text-white'
                : 'tm-text-secondary hover:tm-text hover:bg-gray-700'
            }`}
          >
            <Server className="w-4 h-4 inline mr-2" />
            Envio (SMTP)
          </button>
          <button
            onClick={() => setActiveTab('imap')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'imap'
                ? 'bg-blue-600 text-white'
                : 'tm-text-secondary hover:tm-text hover:bg-gray-700'
            }`}
          >
            <Inbox className="w-4 h-4 inline mr-2" />
            IMAP
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'graph'
                ? 'bg-blue-600 text-white'
                : 'tm-text-secondary hover:tm-text hover:bg-gray-700'
            }`}
          >
            <Cloud className="w-4 h-4 inline mr-2" />
            Microsoft 365
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'notifications'
                ? 'bg-blue-600 text-white'
                : 'tm-text-secondary hover:tm-text hover:bg-gray-700'
            }`}
          >
            <Bell className="w-4 h-4 inline mr-2" />
            Notificações
          </button>
          <button
            onClick={() => setActiveTab('template')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'template'
                ? 'bg-blue-600 text-white'
                : 'tm-text-secondary hover:tm-text hover:bg-gray-700'
            }`}
          >
            <Palette className="w-4 h-4 inline mr-2" />
            Template
          </button>
        </div>

        {activeTab === 'smtp' && (
          <>
            {/* Configurações de Contato */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-400" />
                  Configurações de Contato
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Email e WhatsApp para receber notificações do sistema
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    Email do Suporte *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type="email"
                      value={config.supportEmail}
                      onChange={(e) => setConfig({ ...config, supportEmail: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="chamados@wticorp.com.br"
                    />
                  </div>
                  <p className="tm-text-muted text-xs mt-1">
                    Este email receberá todas as notificações de novos chamados e mensagens
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    WhatsApp do Suporte
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type="text"
                      value={formatPhone(config.supportPhone || '')}
                      onChange={(e) => setConfig({ ...config, supportPhone: e.target.value.replace(/\D/g, '') })}
                      className="w-full pl-10 pr-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="55 11 98681-0480"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Configurações SMTP */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Server className="w-5 h-5 text-purple-400" />
                  Servidor SMTP (Exchange / Microsoft 365)
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Configure as credenciais para envio de emails
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Alerta sobre Exchange */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-blue-300 text-sm font-medium">Configuração para Microsoft 365 / Exchange</p>
                      <p className="text-blue-300/70 text-xs mt-1">
                        Host: <code className="bg-blue-500/20 px-1 rounded">smtp.office365.com</code> | 
                        Porta: <code className="bg-blue-500/20 px-1 rounded">587</code> | 
                        TLS: Ativado
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Servidor SMTP *
                    </label>
                    <input
                      type="text"
                      value={config.smtpHost || ''}
                      onChange={(e) => setConfig({ ...config, smtpHost: e.target.value || null })}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="smtp.office365.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Porta
                    </label>
                    <input
                      type="number"
                      value={config.smtpPort || 587}
                      onChange={(e) => setConfig({ ...config, smtpPort: parseInt(e.target.value) || 587 })}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="587"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    Email de Autenticação *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type="email"
                      value={config.smtpUser || ''}
                      onChange={(e) => setConfig({ ...config, smtpUser: e.target.value || null })}
                      className="w-full pl-10 pr-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="chamados@wticorp.com.br"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    Senha / App Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={config.smtpPass || ''}
                      onChange={(e) => setConfig({ ...config, smtpPass: e.target.value || null })}
                      className="w-full pl-10 pr-12 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="••••••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 tm-text-secondary hover:tm-text"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="tm-text-muted text-xs mt-1">
                    Para Microsoft 365 com MFA, use uma "App Password" gerada no portal
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Email Remetente (opcional)
                    </label>
                    <input
                      type="email"
                      value={config.smtpFrom || ''}
                      onChange={(e) => setConfig({ ...config, smtpFrom: e.target.value || null })}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Mesmo do login"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Nome do Remetente
                    </label>
                    <input
                      type="text"
                      value={config.smtpFromName || ''}
                      onChange={(e) => setConfig({ ...config, smtpFromName: e.target.value || null })}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Winner Tecnologia"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 p-4 tm-bg-main rounded-lg border border-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.smtpSecure}
                    onChange={(e) => setConfig({ ...config, smtpSecure: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-600 text-blue-500 focus:ring-blue-500 tm-bg-main"
                  />
                  <div>
                    <span className="tm-text font-medium">Usar SSL (porta 465)</span>
                    <p className="tm-text-muted text-sm">Desmarque para usar TLS (porta 587) - recomendado para Microsoft 365</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Testar Email */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Send className="w-5 h-5 text-green-400" />
                  Testar Configuração SMTP
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Envie um email de teste para verificar se as configurações estão corretas
                </p>
              </div>
              <div className="p-6">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Email para teste"
                    />
                  </div>
                  <button
                    onClick={handleTestEmail}
                    disabled={testing || !testEmail}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                  >
                    {testing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    Enviar Teste
                  </button>
                </div>
                <p className="tm-text-muted text-xs mt-2">
                  ⚠️ Salve as configurações antes de testar
                </p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'imap' && (
          <>
            {/* Abertura de Chamados por Email */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-cyan-400" />
                  Abertura Automática de Chamados por Email
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Configure para criar chamados automaticamente a partir de emails recebidos
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Habilitar */}
                <label className="flex items-center justify-between p-4 tm-bg-main rounded-lg border border-gray-700 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Ticket className="w-5 h-5 text-cyan-400" />
                    <div>
                      <span className="tm-text font-medium">Habilitar abertura de chamados por email</span>
                      <p className="tm-text-muted text-sm">Emails recebidos criarão chamados automaticamente</p>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={config.imapEnabled || false}
                      onChange={(e) => setConfig({ ...config, imapEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </div>
                </label>

                {/* Alerta sobre Exchange */}
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-cyan-400 mt-0.5" />
                    <div>
                      <p className="text-cyan-300 text-sm font-medium">Configuração para Microsoft 365 / Exchange</p>
                      <p className="text-cyan-300/70 text-xs mt-1">
                        Host: <code className="bg-cyan-500/20 px-1 rounded">outlook.office365.com</code> | 
                        Porta: <code className="bg-cyan-500/20 px-1 rounded">993</code> | 
                        SSL: Ativado
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Servidor IMAP *
                    </label>
                    <input
                      type="text"
                      value={config.imapHost || ''}
                      onChange={(e) => setConfig({ ...config, imapHost: e.target.value || null })}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="outlook.office365.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Porta
                    </label>
                    <input
                      type="number"
                      value={config.imapPort || 993}
                      onChange={(e) => setConfig({ ...config, imapPort: parseInt(e.target.value) || 993 })}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="993"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    Email de Autenticação *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type="email"
                      value={config.imapUser || ''}
                      onChange={(e) => setConfig({ ...config, imapUser: e.target.value || null })}
                      className="w-full pl-10 pr-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="chamados@wticorp.com.br"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    Senha / App Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                    <input
                      type={showImapPassword ? 'text' : 'password'}
                      value={config.imapPass || ''}
                      onChange={(e) => setConfig({ ...config, imapPass: e.target.value || null })}
                      className="w-full pl-10 pr-12 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="••••••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowImapPassword(!showImapPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 tm-text-secondary hover:tm-text"
                    >
                      {showImapPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Pasta a Monitorar
                    </label>
                    <div className="relative">
                      <FolderInput className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                      <input
                        type="text"
                        value={config.imapFolder || 'INBOX'}
                        onChange={(e) => setConfig({ ...config, imapFolder: e.target.value || 'INBOX' })}
                        className="w-full pl-10 pr-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        placeholder="INBOX"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Usar SSL
                    </label>
                    <label className="flex items-center gap-3 h-[50px] px-4 tm-bg-main rounded-lg border border-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.imapSecure !== false}
                        onChange={(e) => setConfig({ ...config, imapSecure: e.target.checked })}
                        className="w-5 h-5 rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 tm-bg-main"
                      />
                      <span className="tm-text">SSL/TLS (porta 993)</span>
                    </label>
                  </div>
                </div>

                {/* Pastas disponíveis */}
                {imapFolders.length > 0 && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-green-300 text-sm font-medium mb-2">Pastas disponíveis:</p>
                    <div className="flex flex-wrap gap-2">
                      {imapFolders.map((folder) => (
                        <button
                          key={folder}
                          onClick={() => setConfig({ ...config, imapFolder: folder })}
                          className={`px-3 py-1 rounded text-sm ${
                            config.imapFolder === folder
                              ? 'bg-green-500 text-white'
                              : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                          }`}
                        >
                          {folder}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Debug Info para erros IMAP */}
                {debugInfo && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-red-300 text-sm font-medium mb-2">Detalhes técnicos do erro:</p>
                    <pre className="text-xs text-red-200/80 bg-red-900/20 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                      {debugInfo}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Testar e Processar */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-green-400" />
                  Testar e Processar Emails
                </h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex gap-3">
                  <button
                    onClick={handleTestImap}
                    disabled={testingImap || !config.imapHost || !config.imapUser}
                    className="flex-1 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-600/50 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {testingImap ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-5 h-5" />
                    )}
                    Testar Conexão IMAP
                  </button>
                  <button
                    onClick={handleProcessEmails}
                    disabled={processing || !config.imapEnabled}
                    className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {processing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                    Processar Emails Agora
                  </button>
                </div>

                {/* Resultado do processamento */}
                {processResult && (
                  <div className={`p-4 rounded-lg ${
                    processResult.success 
                      ? 'bg-green-500/10 border border-green-500/30' 
                      : 'bg-red-500/10 border border-red-500/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {processResult.success ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      )}
                      <span className={processResult.success ? 'text-green-300' : 'text-red-300'}>
                        {processResult.success ? 'Processamento concluído' : 'Erro no processamento'}
                      </span>
                    </div>
                    <div className="text-sm tm-text">
                      <p>Emails verificados: {processResult.processed}</p>
                      <p>Chamados criados: {processResult.created}</p>
                      {processResult.errors > 0 && (
                        <p className="text-red-400">Erros: {processResult.errors}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Última verificação */}
                {config.imapLastCheck && (
                  <p className="tm-text-muted text-sm">
                    Última verificação: {formatDate(config.imapLastCheck)}
                  </p>
                )}
              </div>
            </div>

            {/* Histórico de Emails Processados */}
            {recentEmails.length > 0 && (
              <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-700 tm-bg-main">
                  <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                    <Clock className="w-5 h-5 tm-text-secondary" />
                    Emails Recentes Processados
                  </h2>
                </div>
                <div className="divide-y divide-gray-700">
                  {recentEmails.map((email) => (
                    <div key={email.id} className="p-4 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="tm-text font-medium truncate">{email.subject}</p>
                        <p className="tm-text-secondary text-sm">{email.fromEmail}</p>
                        <p className="tm-text-muted text-xs">{formatDate(email.processedAt)}</p>
                      </div>
                      <div className="ml-4">
                        {email.status === 'processed' && email.ticket ? (
                          <a
                            href={`/tickets/${email.ticket.number}`}
                            className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm"
                          >
                            Chamado #{email.ticket.number}
                          </a>
                        ) : email.status === 'error' ? (
                          <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm" title={email.errorMsg || ''}>
                            Erro
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-gray-500/20 tm-text-secondary rounded-full text-sm">
                            {email.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab Microsoft Graph */}
        {activeTab === 'graph' && config && (
          <>
            {/* Configuração Microsoft Graph */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-cyan-400" />
                  Microsoft Graph API (Office 365)
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Integração avançada com Microsoft 365 para processamento automático de emails
                </p>
              </div>
              <div className="p-6 space-y-6">
                {/* Ativar/Desativar */}
                <div className="flex items-center justify-between p-4 tm-bg-main rounded-lg">
                  <div className="flex items-center gap-3">
                    <Zap className={`w-6 h-6 ${config.graphEnabled ? 'text-green-400' : 'tm-text-muted'}`} />
                    <div>
                      <h3 className="tm-text font-medium">Ativar Microsoft Graph API</h3>
                      <p className="tm-text-secondary text-sm">Processar emails automaticamente via API Microsoft</p>
                    </div>
                  </div>
                  <label className="relative cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.graphEnabled || false}
                      onChange={(e) => setConfig({ ...config, graphEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-gray-700 peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {config.graphEnabled && (
                  <>
                    {/* Informações Azure - Detalhadas */}
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <h4 className="text-blue-400 font-medium mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Configuração do Azure AD (Passo a Passo)
                      </h4>
                      <ol className="tm-text text-sm space-y-2 list-decimal list-inside">
                        <li>Acesse o <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Portal Azure</a> e faça login</li>
                        <li>No menu, vá em <strong>&quot;Microsoft Entra ID&quot;</strong> (antigo Azure AD)</li>
                        <li>Clique em <strong>&quot;App registrations&quot;</strong> → <strong>&quot;New registration&quot;</strong></li>
                        <li>Dê um nome (ex: &quot;Winner Tickets Email&quot;) e clique em &quot;Register&quot;</li>
                        <li>Copie o <strong>Application (client) ID</strong> e o <strong>Directory (tenant) ID</strong></li>
                        <li>Vá em <strong>&quot;API permissions&quot;</strong> → <strong>&quot;Add a permission&quot;</strong> → <strong>&quot;Microsoft Graph&quot;</strong></li>
                        <li>Escolha <strong>&quot;Application permissions&quot;</strong> (não delegated!) e adicione:
                          <ul className="ml-4 mt-1 space-y-0.5">
                            <li className="text-cyan-300">• <code className="bg-cyan-500/20 px-1 rounded">Mail.Read</code></li>
                            <li className="text-cyan-300">• <code className="bg-cyan-500/20 px-1 rounded">Mail.ReadWrite</code></li>
                            <li className="text-cyan-300">• <code className="bg-cyan-500/20 px-1 rounded">Mail.Send</code></li>
                          </ul>
                        </li>
                        <li>Clique em <strong>&quot;Grant admin consent&quot;</strong> (requer permissão de admin do tenant)</li>
                        <li>Vá em <strong>&quot;Certificates & secrets&quot;</strong> → <strong>&quot;New client secret&quot;</strong></li>
                        <li>Copie o <strong>Value</strong> do secret gerado (só aparece uma vez!)</li>
                      </ol>
                      <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                        <p className="text-yellow-300 text-xs">
                          <strong>⚠️ Importante:</strong> As permissões devem ser do tipo &quot;Application&quot; (não &quot;Delegated&quot;) e o consentimento de administrador deve ser concedido.
                        </p>
                      </div>
                    </div>

                    {/* Campos de configuração */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium tm-text mb-2">
                          Tenant ID *
                        </label>
                        <input
                          type="text"
                          value={config.graphTenantId || ''}
                          onChange={(e) => setConfig({ ...config, graphTenantId: e.target.value })}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none font-mono text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium tm-text mb-2">
                          Client ID *
                        </label>
                        <input
                          type="text"
                          value={config.graphClientId || ''}
                          onChange={(e) => setConfig({ ...config, graphClientId: e.target.value })}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none font-mono text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium tm-text mb-2">
                          Client Secret *
                        </label>
                        <div className="relative">
                          <input
                            type={showGraphSecret ? 'text' : 'password'}
                            value={config.graphClientSecret || ''}
                            onChange={(e) => setConfig({ ...config, graphClientSecret: e.target.value })}
                            placeholder="••••••••••••••••••••"
                            className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none pr-12 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGraphSecret(!showGraphSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 tm-text-secondary hover:tm-text"
                          >
                            {showGraphSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium tm-text mb-2">
                          Email da Caixa *
                        </label>
                        <input
                          type="email"
                          value={config.graphUserEmail || ''}
                          onChange={(e) => setConfig({ ...config, graphUserEmail: e.target.value })}
                          placeholder="ti.suporte@empresa.com.br"
                          className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* Botões de ação */}
                    <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-700">
                      <button
                        onClick={async () => {
                          setTestingGraph(true);
                          setGraphResult(null);
                          try {
                            const res = await fetch('/api/settings/email/graph', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'test',
                                tenantId: config.graphTenantId,
                                clientId: config.graphClientId,
                                clientSecret: config.graphClientSecret,
                                userEmail: config.graphUserEmail,
                              }),
                            });
                            const data = await res.json();
                            setGraphResult(data);
                            setMessage({
                              type: data.success ? 'success' : 'error',
                              text: data.message,
                            });
                          } catch (error) {
                            setMessage({ type: 'error', text: 'Erro ao testar conexão' });
                          } finally {
                            setTestingGraph(false);
                          }
                        }}
                        disabled={testingGraph || !config.graphTenantId || !config.graphClientId || !config.graphClientSecret || !config.graphUserEmail}
                        className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-600/50 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                      >
                        {testingGraph ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Shield className="w-4 h-4" />
                        )}
                        Testar Conexão
                      </button>

                      <button
                        onClick={async () => {
                          setProcessingGraph(true);
                          setGraphResult(null);
                          try {
                            const res = await fetch('/api/settings/email/graph', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'process' }),
                            });
                            const data = await res.json();
                            setGraphResult(data);
                            setMessage({
                              type: data.success ? 'success' : 'error',
                              text: data.message || 'Processamento concluído',
                            });
                          } catch (error) {
                            setMessage({ type: 'error', text: 'Erro ao processar emails' });
                          } finally {
                            setProcessingGraph(false);
                          }
                        }}
                        disabled={processingGraph || !config.graphEnabled}
                        className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                      >
                        {processingGraph ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Processar Emails Agora
                      </button>
                    </div>

                    {/* Resultado do teste/processamento */}
                    {graphResult && (
                      <div className={`p-4 rounded-lg ${graphResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                        <div className="flex items-start gap-3">
                          {graphResult.success ? (
                            <Check className="w-5 h-5 text-green-400 mt-0.5" />
                          ) : (
                            <X className="w-5 h-5 text-red-400 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className={graphResult.success ? 'text-green-300' : 'text-red-300'}>
                              {graphResult.message}
                            </p>
                            {graphResult.details && (
                              <p className="tm-text-secondary text-sm mt-2 p-2 bg-black/20 rounded">
                                {graphResult.details}
                              </p>
                            )}
                            {graphResult.tickets !== undefined && (
                              <p className="tm-text-secondary text-sm mt-1">
                                {graphResult.tickets} chamados criados de {graphResult.processed} emails processados
                              </p>
                            )}
                            {graphResult.tokenError && (
                              <p className="text-orange-300 text-sm mt-2">
                                💡 Erro de autenticação: {graphResult.tokenError}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Última verificação */}
                    {config.graphLastCheck && (
                      <div className="tm-text-secondary text-sm">
                        Última verificação: {new Date(config.graphLastCheck).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'notifications' && (
          <>
            {/* Notificações para Equipe */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Bell className="w-5 h-5 text-orange-400" />
                  Notificações para Equipe de Suporte
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Escolha quais eventos devem gerar notificações para a equipe
                </p>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { key: 'notifyNewTicket', label: 'Novo chamado aberto', icon: Bell, description: 'Notificar quando um cliente abre um novo chamado' },
                  { key: 'notifyNewMessage', label: 'Nova mensagem do cliente', icon: MessageSquare, description: 'Notificar quando um cliente envia uma mensagem' },
                  { key: 'notifySLAWarning', label: 'Alerta de SLA', icon: Clock, description: 'Notificar quando um chamado está próximo de vencer o prazo' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-4 tm-bg-main rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 tm-text-secondary" />
                      <div>
                        <span className="tm-text font-medium">{item.label}</span>
                        <p className="tm-text-muted text-sm">{item.description}</p>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={config[item.key as keyof EmailConfig] as boolean}
                        onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notificações para Clientes */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-400" />
                  Notificações para Clientes
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Escolha quais notificações os clientes devem receber
                </p>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { key: 'notifyClientNewMessage', label: 'Nova resposta no chamado', icon: MessageSquare, description: 'Notificar cliente quando a equipe responde' },
                  { key: 'notifyClientStatusChange', label: 'Mudança de status', icon: Bell, description: 'Notificar cliente sobre mudanças de status do chamado' },
                  { key: 'notifyTicketResolved', label: 'Chamado resolvido', icon: Check, description: 'Notificar cliente quando o chamado é marcado como resolvido' },
                  { key: 'notifyTicketClosed', label: 'Chamado fechado', icon: BellOff, description: 'Notificar cliente quando o chamado é fechado' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-4 tm-bg-main rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 tm-text-secondary" />
                      <div>
                        <span className="tm-text font-medium">{item.label}</span>
                        <p className="tm-text-muted text-sm">{item.description}</p>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={config[item.key as keyof EmailConfig] as boolean}
                        onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Tab Template */}
        {activeTab === 'template' && config && (
          <>
            {/* Configurações do Template */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Palette className="w-5 h-5 text-purple-400" />
                  Configuração do Template de Resposta
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Personalize o layout das respostas enviadas aos clientes
                </p>
              </div>
              <div className="p-6 space-y-6">
                {/* Cabeçalho */}
                <div className="space-y-4">
                  <h3 className="tm-text font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    Cabeçalho do Email
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">
                        URL do Logo
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={config.templateLogoUrl || ''}
                          onChange={(e) => setConfig({ ...config, templateLogoUrl: e.target.value })}
                          placeholder="https://i.ytimg.com/vi/PmIfCYBO02I/hqdefault.jpg"
                          className="flex-1 px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <label className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer flex items-center gap-2 whitespace-nowrap transition">
                          <Upload className="w-4 h-4" />
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) { alert('Arquivo muito grande (máx 2MB)'); return; }
                              try {
                                const { uploadFile } = await import('@/lib/upload-helper');
                                const { cloudStoragePath } = await uploadFile(file, true);
                                // Get public URL
                                const viewRes = await fetch(`/api/upload/url?path=${encodeURIComponent(cloudStoragePath)}&public=true`);
                                if (viewRes.ok) {
                                  const { url } = await viewRes.json();
                                  setConfig({ ...config, templateLogoUrl: url });
                                } else {
                                  setConfig({ ...config, templateLogoUrl: cloudStoragePath });
                                }
                                alert('Logo enviado com sucesso!');
                              } catch (err) {
                                console.error('Upload error:', err);
                                alert('Erro ao fazer upload do logo');
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      <p className="text-xs tm-text-muted mt-1">Cole uma URL pública ou faça upload de uma imagem</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">
                        Nome da Empresa
                      </label>
                      <input
                        type="text"
                        value={config.templateCompanyName || ''}
                        onChange={(e) => setConfig({ ...config, templateCompanyName: e.target.value })}
                        placeholder="Winner Tecnologia"
                        className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.templateShowTicketNumber ?? true}
                        onChange={(e) => setConfig({ ...config, templateShowTicketNumber: e.target.checked })}
                        className="w-5 h-5 rounded border-gray-600 tm-bg-main text-blue-500 focus:ring-blue-500"
                      />
                      <span className="tm-text">Mostrar número do chamado no cabeçalho</span>
                    </label>
                  </div>
                </div>

                {/* Cores */}
                <div className="space-y-4 pt-4 border-t border-gray-700">
                  <h3 className="tm-text font-medium flex items-center gap-2">
                    <Palette className="w-4 h-4 text-purple-400" />
                    Cores do Template
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">
                        Cor Primária (Cabeçalho)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={config.templatePrimaryColor || '#3B82F6'}
                          onChange={(e) => setConfig({ ...config, templatePrimaryColor: e.target.value })}
                          className="w-12 h-12 rounded cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={config.templatePrimaryColor || '#3B82F6'}
                          onChange={(e) => setConfig({ ...config, templatePrimaryColor: e.target.value })}
                          className="flex-1 px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">
                        Cor Secundária (Destaques)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={config.templateSecondaryColor || '#FF6B35'}
                          onChange={(e) => setConfig({ ...config, templateSecondaryColor: e.target.value })}
                          className="w-12 h-12 rounded cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={config.templateSecondaryColor || '#FF6B35'}
                          onChange={(e) => setConfig({ ...config, templateSecondaryColor: e.target.value })}
                          className="flex-1 px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rodapé/Assinatura */}
                <div className="space-y-4 pt-4 border-t border-gray-700">
                  <h3 className="tm-text font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-green-400" />
                    Rodapé e Assinatura
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">
                        Texto antes da assinatura
                      </label>
                      <input
                        type="text"
                        value={config.templateFooterText || ''}
                        onChange={(e) => setConfig({ ...config, templateFooterText: e.target.value })}
                        placeholder="Atenciosamente,"
                        className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">
                        Título/Cargo na assinatura
                      </label>
                      <input
                        type="text"
                        value={config.templateSignatureTitle || ''}
                        onChange={(e) => setConfig({ ...config, templateSignatureTitle: e.target.value })}
                        placeholder="Equipe de Suporte"
                        className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      Informações de contato no rodapé
                    </label>
                    <textarea
                      value={config.templateContactInfo || ''}
                      onChange={(e) => setConfig({ ...config, templateContactInfo: e.target.value })}
                      placeholder="Tel: (11) 98681-0480 | Email: suporte@winner.com.br"
                      rows={2}
                      className="w-full px-4 py-3 tm-bg-main border border-gray-600 rounded-lg tm-text placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.templateShowTechName ?? true}
                        onChange={(e) => setConfig({ ...config, templateShowTechName: e.target.checked })}
                        className="w-5 h-5 rounded border-gray-600 tm-bg-main text-blue-500 focus:ring-blue-500"
                      />
                      <span className="tm-text">Mostrar nome do técnico na assinatura</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview do Template */}
            <div className="tm-bg-card rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 tm-bg-main">
                <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  Preview do Template
                </h2>
                <p className="tm-text-secondary text-sm mt-1">
                  Visualização de como o email será exibido para o cliente
                </p>
              </div>
              <div className="p-6">
                <div className="bg-white rounded-lg overflow-hidden shadow-lg max-w-2xl mx-auto">
                  {/* Header do Email */}
                  <div 
                    className="p-6 tm-text"
                    style={{ backgroundColor: config.templatePrimaryColor || '#3B82F6' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {config.templateLogoUrl ? (
                          <img 
                            src={config.templateLogoUrl} 
                            alt="Logo" 
                            className="h-12 w-auto"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                            <Building2 className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <h1 className="text-xl font-bold">{config.templateCompanyName || 'Winner Tecnologia'}</h1>
                          <p className="tm-text/80 text-sm">Sistema de Suporte</p>
                        </div>
                      </div>
                      {(config.templateShowTicketNumber ?? true) && (
                        <div className="text-right">
                          <p className="tm-text/80 text-sm">Chamado</p>
                          <p className="text-2xl font-bold">#1234</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Corpo do Email */}
                  <div className="p-6">
                    <div className="mb-4">
                      <span 
                        className="inline-block px-3 py-1 rounded-full tm-text text-sm font-medium"
                        style={{ backgroundColor: config.templateSecondaryColor || '#FF6B35' }}
                      >
                        Nova Resposta
                      </span>
                    </div>
                    
                    <p className="text-gray-700 mb-4">Olá <strong>Cliente</strong>,</p>
                    
                    <div className="bg-gray-50 rounded-lg p-4 mb-6 border-l-4" style={{ borderColor: config.templatePrimaryColor || '#3B82F6' }}>
                      <p className="text-gray-600">
                        Esta é uma mensagem de exemplo mostrando como o conteúdo da resposta será exibido para o cliente. 
                        O técnico pode incluir instruções, esclarecimentos ou qualquer informação relevante aqui.
                      </p>
                    </div>

                    {/* Assinatura */}
                    <div className="border-t border-gray-200 pt-4 mt-6">
                      <p className="text-gray-600 mb-2">{config.templateFooterText || 'Atenciosamente,'}</p>
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center tm-text font-bold"
                          style={{ backgroundColor: config.templatePrimaryColor || '#3B82F6' }}
                        >
                          JD
                        </div>
                        <div>
                          {(config.templateShowTechName ?? true) && (
                            <p className="font-semibold text-gray-800">João da Silva</p>
                          )}
                          <p className="tm-text-muted text-sm">{config.templateSignatureTitle || 'Equipe de Suporte'}</p>
                        </div>
                      </div>
                      {config.templateContactInfo && (
                        <p className="tm-text-secondary text-sm mt-3">{config.templateContactInfo}</p>
                      )}
                    </div>
                  </div>

                  {/* Footer do Email */}
                  <div className="bg-gray-100 px-6 py-4 text-center tm-text-muted text-sm">
                    <p>© 2026 {config.templateCompanyName || 'Winner Tecnologia'}. Todos os direitos reservados.</p>
                    <p className="mt-1">Este email foi enviado automaticamente pelo sistema de suporte.</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Botão Salvar */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Salvar Configurações
          </button>
        </div>
      </motion.div>
    </div>
  );
}
