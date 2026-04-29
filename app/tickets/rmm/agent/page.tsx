'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Building2,
  Key,
  FileCode,
  Terminal,
  Copy,
  Check,
  Info,
  AlertTriangle,
  Shield,
  Trash2,
} from 'lucide-react';

interface CompanyOption {
  id: string;
  name: string;
}

export default function AgentGeneratorPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ hasToken: boolean; token: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/companies?limit=500')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.companies || [];
        // Filtrar apenas empresas com tipo CONTRATO
        const filtered = list.filter((c: any) => c.clientType === 'CONTRATO');
        setCompanies(filtered);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCompany) {
      setTokenInfo(null);
      return;
    }
    fetch(`/api/rmm/agent?companyId=${selectedCompany}`)
      .then((r) => r.json())
      .then(setTokenInfo)
      .catch(console.error);
  }, [selectedCompany]);

  const handleDownload = async (format: string) => {
    if (!selectedCompany) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/rmm/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany, format }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="(.+)"/);
        const filename = match ? match[1] : `agente_rmm.${format}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        // Refresh token info
        const infoRes = await fetch(`/api/rmm/agent?companyId=${selectedCompany}`);
        if (infoRes.ok) setTokenInfo(await infoRes.json());
      }
    } catch (e) {
      console.error('Erro ao gerar agente:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToken = () => {
    if (tokenInfo?.token) {
      navigator.clipboard.writeText(tokenInfo.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={48} className="mx-auto text-yellow-400 mb-4" />
        <p className="tm-text-secondary">Acesso restrito a administradores</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/tickets/rmm"
          className="inline-flex items-center gap-2 tm-text-secondary hover:tm-text mb-4"
        >
          <ArrowLeft size={20} /> Voltar ao RMM
        </Link>
        <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
          <Download className="text-accent-blue" size={28} />
          Gerar Agente RMM
        </h1>
        <p className="tm-text-secondary mt-1">
          Gere o instalador com o token exclusivo da empresa para deploy nas máquinas.
        </p>
      </div>

      {/* Step 1: Select Company */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="tm-bg-card border tm-border rounded-xl p-6"
      >
        <h2 className="tm-text font-semibold mb-4 flex items-center gap-2">
          <Building2 size={18} className="text-accent-blue" />
          1. Selecione a Empresa
        </h2>
        <select
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
          className="w-full px-4 py-3 tm-bg-card border tm-border rounded-lg tm-text focus:outline-none focus:border-accent-blue/50"
        >
          <option value="">Selecione uma empresa...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </motion.div>

      {/* Step 2: Token Info */}
      {selectedCompany && tokenInfo && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="tm-bg-card border tm-border rounded-xl p-6"
        >
          <h2 className="tm-text font-semibold mb-4 flex items-center gap-2">
            <Key size={18} className="text-accent-blue" />
            2. Token da Empresa
          </h2>
          {tokenInfo.hasToken ? (
            <div>
              <p className="tm-text-secondary text-sm mb-2">Token já gerado:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/30 rounded-lg px-4 py-2.5 text-green-400 font-mono text-sm truncate">
                  {tokenInfo.token}
                </code>
                <button
                  onClick={handleCopyToken}
                  className="p-2 tm-bg-card border tm-border rounded-lg hover:bg-white/10 transition"
                  title="Copiar token"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="tm-text-secondary" />}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-yellow-400 text-sm flex items-center gap-2">
              <Info size={16} />
              Token será gerado automaticamente ao baixar o instalador.
            </p>
          )}
        </motion.div>
      )}

      {/* Step 3: Download */}
      {selectedCompany && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="tm-bg-card border tm-border rounded-xl p-6"
        >
          <h2 className="tm-text font-semibold mb-4 flex items-center gap-2">
            <Download size={18} className="text-accent-blue" />
            3. Baixar Arquivos
          </h2>

          {/* Instalador principal */}
          <button
            onClick={() => handleDownload('installer')}
            disabled={generating}
            className="w-full flex items-center gap-4 p-5 mb-4 bg-accent-blue/10 border-2 border-accent-blue/30 rounded-xl hover:bg-accent-blue/20 hover:border-accent-blue/50 transition disabled:opacity-50"
          >
            <div className="p-3 bg-accent-blue/20 rounded-lg">
              <Shield size={28} className="text-accent-blue" />
            </div>
            <div className="text-left flex-1">
              <span className="tm-text font-semibold text-lg block">⭐ Instalador Completo</span>
              <span className="tm-text-secondary text-sm">PowerShell autossuficiente — instala o agente + registra como serviço SYSTEM</span>
              <span className="text-accent-blue text-xs block mt-1">Instalar_RMM_Winner_*.ps1 · Recomendado para GPO / Intune</span>
            </div>
          </button>

          {/* Downloads extras */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => handleDownload('agent_ps1')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-accent-blue/30 transition disabled:opacity-50"
            >
              <Terminal size={24} className="text-cyan-400" />
              <span className="tm-text font-medium text-sm">Agente PowerShell</span>
              <span className="tm-text-muted text-xs">agente_rmm.ps1</span>
            </button>
            <button
              onClick={() => handleDownload('agent_py')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-accent-blue/30 transition disabled:opacity-50"
            >
              <FileCode size={24} className="text-yellow-400" />
              <span className="tm-text font-medium text-sm">Agente Python</span>
              <span className="tm-text-muted text-xs">agente_rmm.py</span>
            </button>
            <button
              onClick={() => handleDownload('uninstall')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-red-400/30 transition disabled:opacity-50"
            >
              <Trash2 size={24} className="text-red-400" />
              <span className="tm-text font-medium text-sm">Desinstalador</span>
              <span className="tm-text-muted text-xs">desinstalar_rmm.ps1</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6"
      >
        <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
          <Info size={18} />
          Instruções de Instalação
        </h3>
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="tm-text font-medium mb-1">📦 Instalação Manual (1 máquina)</h4>
            <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
              <li>Baixe o <strong>Instalador Completo</strong> (.ps1)</li>
              <li>Na máquina alvo, clique com botão direito no arquivo → <strong>Executar com PowerShell como Admin</strong></li>
              <li>O agente será instalado e iniciado automaticamente</li>
            </ol>
          </div>

          <div>
            <h4 className="tm-text font-medium mb-1">🏢 Deploy em Massa (GPO / Intune)</h4>
            <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
              <li>Copie o instalador para um compartilhamento de rede acessível</li>
              <li>Crie uma GPO com script de inicialização ou política do Intune</li>
              <li>Comando silencioso: <code className="bg-black/30 px-2 py-0.5 rounded text-green-400">powershell -ExecutionPolicy Bypass -File &quot;\\servidor\rmm\Instalar_RMM_Winner.ps1&quot;</code></li>
              <li>Remova a linha <code className="bg-black/30 px-1 py-0.5 rounded text-yellow-400">Read-Host</code> do final do script para deploy silencioso</li>
            </ol>
          </div>

          <div>
            <h4 className="tm-text font-medium mb-1">🐍 Alternativa Python (avançado)</h4>
            <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
              <li>Baixe o <strong>Agente Python</strong> (.py)</li>
              <li>Instale dependências: <code className="bg-black/30 px-2 py-0.5 rounded text-green-400">pip install psutil requests wmi</code></li>
              <li>Compile: <code className="bg-black/30 px-2 py-0.5 rounded text-green-400">pyinstaller --onefile --noconsole agente_rmm.py</code></li>
            </ol>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
