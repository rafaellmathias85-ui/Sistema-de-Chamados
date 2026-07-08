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
  Cpu,
  Eye,
  Package,
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

  if (!['ADMIN','SUPPORT'].includes(session?.user?.role || '')) {
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

          {/* Instalador V4 — SIGNED, token no nome do arquivo */}
          <button
            onClick={() => handleDownload('installer_v4')}
            disabled={generating}
            className="w-full flex items-center gap-4 p-5 mb-3 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-xl hover:bg-emerald-500/20 hover:border-emerald-500/60 transition disabled:opacity-50"
          >
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <Shield size={28} className="text-emerald-400" />
            </div>
            <div className="text-left flex-1">
              <span className="tm-text font-semibold text-lg block flex items-center gap-2">
                🆕 Instalador V4 <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-normal">ASSINADO · TOKEN NO ARQUIVO</span>
              </span>
              <span className="tm-text-secondary text-sm">Arquivo único p/ GPO e Intune: token embutido no nome do arquivo (assinatura Authenticode preservada) + auto-download do agente/watchdog com verificação SHA-256</span>
              <span className="text-emerald-400 text-xs block mt-1">Instalar_RMM_Winner_V4_&lt;Empresa&gt;_TK&lt;token&gt;.ps1 · ⚠ NÃO renomeie o arquivo</span>
            </div>
          </button>

          {/* Comando V4 (token já vai no nome do arquivo) */}
          {tokenInfo?.token && (
            <div className="mb-4 p-3 bg-black/40 border border-emerald-500/20 rounded-lg">
              <p className="text-xs text-emerald-400 mb-1 font-medium">Comando de instalação V4 (PowerShell como Admin — o token é lido do nome do arquivo):</p>
              <code className="text-xs text-green-300 font-mono break-all">
                {`Set-ExecutionPolicy Bypass -Scope Process -Force; .\\Instalar_RMM_Winner_V4_*_TK*.ps1`}
              </code>
              <p className="text-xs tm-text-muted mt-2">Alternativa (arquivo genérico assinado, sem token no nome): <code className="text-green-300">.\Instalar_RMM_Winner_V4.ps1 -CompanyToken &quot;{tokenInfo.token.substring(0, 12)}...&quot;</code></p>
            </div>
          )}

          <div className="border-t tm-border my-4" />

          {/* Instalador V3 — Legacy */}
          <button
            onClick={() => handleDownload('installer')}
            disabled={generating}
            className="w-full flex items-center gap-4 p-5 mb-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition disabled:opacity-50 opacity-80"
          >
            <div className="p-3 bg-white/10 rounded-lg">
              <Shield size={28} className="tm-text-secondary" />
            </div>
            <div className="text-left flex-1">
              <span className="tm-text font-semibold text-lg block flex items-center gap-2">
                Instalador V3 (Legacy) <span className="text-xs bg-white/10 tm-text-secondary border border-white/10 px-2 py-0.5 rounded-full font-normal">TOKEN EMBUTIDO</span>
              </span>
              <span className="tm-text-secondary text-sm">Windows Service via NSSM + Watchdog + DACL anti-tamper + SCM auto-recovery + dual-server fallback</span>
              <span className="tm-text-muted text-xs block mt-1">Instalar_RMM_Winner_*.ps1 · Compatível com GPO / Intune — sem assinatura Authenticode</span>
            </div>
          </button>

          {/* Downloads extras */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              onClick={() => handleDownload('agent_ps1')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-accent-blue/30 transition disabled:opacity-50"
            >
              <Terminal size={24} className="text-cyan-400" />
              <span className="tm-text font-medium text-sm">Agente V3 PS1</span>
              <span className="tm-text-muted text-xs">agente_rmm_v3.ps1</span>
            </button>
            <button
              onClick={() => handleDownload('watchdog')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-green-400/30 transition disabled:opacity-50"
            >
              <Eye size={24} className="text-green-400" />
              <span className="tm-text font-medium text-sm">Watchdog V3</span>
              <span className="tm-text-muted text-xs">watchdog.ps1</span>
            </button>
            <button
              onClick={() => handleDownload('ps2exe')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-purple-400/30 transition disabled:opacity-50"
            >
              <Cpu size={24} className="text-purple-400" />
              <span className="tm-text font-medium text-sm">Compilar EXE</span>
              <span className="tm-text-muted text-xs">ps2exe (Melhoria H)</span>
            </button>
            <button
              onClick={() => handleDownload('agent_py')}
              disabled={generating}
              className="flex flex-col items-center gap-2 p-4 tm-bg-card border tm-border rounded-xl hover:bg-white/10 hover:border-yellow-400/30 transition disabled:opacity-50"
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
        className="space-y-4"
      >
        {/* V4 Instructions — Primary */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
          <h3 className="text-emerald-400 font-semibold mb-3 flex items-center gap-2">
            <Shield size={18} />
            Instalação V4 — Recomendado
          </h3>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="tm-text font-medium mb-1">📦 Instalação Manual (1 máquina)</h4>
              <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
                <li>Selecione a empresa acima e baixe o <strong>Instalador V4</strong> — o token da empresa já vem embutido no nome do arquivo (<code className="bg-black/30 px-1 py-0.5 rounded text-green-400">_TK&lt;token&gt;.ps1</code>)</li>
                <li><strong>Não renomeie o arquivo</strong> — a assinatura Authenticode permanece válida porque o conteúdo não é alterado</li>
                <li>Na máquina alvo, abra o <strong>PowerShell como Administrador</strong> e execute o .ps1 — sem parâmetros</li>
                <li>Verifique em <code className="bg-black/30 px-1 py-0.5 rounded text-green-400">services.msc</code> que <strong>Winner RMM Agent</strong> está rodando</li>
              </ol>
            </div>

            <div>
              <h4 className="tm-text font-medium mb-1">🏢 Deploy em Massa (GPO / Intune) — arquivo único</h4>
              <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
                <li>Baixe o Instalador V4 da empresa e copie <strong>apenas esse arquivo</strong> para o compartilhamento — agente e watchdog são baixados do servidor com verificação SHA-256 contra o manifest</li>
                <li><strong>GPO:</strong> script de inicialização apontando para o .ps1 no share (o nome do arquivo carrega o token — não renomeie)</li>
                <li><strong>Intune (app Win32 / .intunewin):</strong> o nome interno é preservado; se usar &quot;Platform scripts&quot; (que renomeia o arquivo), passe <code className="bg-black/30 px-1 py-0.5 rounded text-green-400">-CompanyToken &quot;TOKEN&quot;</code> na linha de comando</li>
                <li>Silencioso: defina <code className="bg-black/30 px-1 py-0.5 rounded text-green-400">$env:RMM_SILENT=1</code> antes de executar</li>
              </ol>
            </div>

            <div>
              <h4 className="tm-text font-medium mb-1">🛡️ Proteções do V4</h4>
              <ul className="tm-text space-y-1 list-disc list-inside ml-2">
                <li><strong>Authenticode Assinado</strong> — Certificado Winner; compatível com AppLocker e WDAC</li>
                <li><strong>Watchdog Hang-Aware</strong> — Detecta agente travado e reinicia automaticamente</li>
                <li><strong>Config DPAPI</strong> — Token armazenado criptografado no perfil SYSTEM</li>
                <li><strong>Auto-Update via Manifest</strong> — Baixa e aplica nova versão com verificação SHA-256</li>
                <li><strong>Windows Service (NSSM)</strong> + SCM Auto-Recovery + DACL Anti-Tamper</li>
              </ul>
            </div>
          </div>
        </div>

        {/* V3 Instructions — Legacy */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 opacity-80">
          <h3 className="tm-text-secondary font-semibold mb-3 flex items-center gap-2">
            <Info size={18} />
            Instalador V3 (Legacy)
          </h3>
          <p className="text-xs tm-text-muted mb-4">Versão anterior sem assinatura Authenticode. Use V4 para novos deploys.</p>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="tm-text font-medium mb-1">📦 Instalação Manual</h4>
              <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
                <li>Baixe o <strong>Instalador V3 (Legacy)</strong> acima — o token da empresa já está embutido</li>
                <li>Clique com botão direito no arquivo → <strong>Executar com PowerShell como Admin</strong></li>
                <li>O instalador baixa NSSM, registra o agente como Windows Service e configura o watchdog</li>
                <li>Verifique em <code className="bg-black/30 px-1 py-0.5 rounded text-green-400">services.msc</code> que &quot;Winner RMM Agent&quot; está rodando</li>
              </ol>
            </div>

            <div>
              <h4 className="tm-text font-medium mb-1">🏢 GPO / Intune (V3)</h4>
              <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
                <li>Copie o instalador para um compartilhamento de rede acessível</li>
                <li>Comando silencioso: <code className="bg-black/30 px-2 py-0.5 rounded text-green-400">powershell -ExecutionPolicy Bypass -File &quot;\\servidor\rmm\Instalar_RMM_Winner.ps1&quot;</code></li>
                <li>Remova a linha <code className="bg-black/30 px-1 py-0.5 rounded text-yellow-400">Read-Host</code> do final do script para deploy silencioso</li>
              </ol>
            </div>

            <div>
              <h4 className="tm-text font-medium mb-1">⚡ Compilar como EXE (opcional)</h4>
              <ol className="tm-text space-y-1 list-decimal list-inside ml-2">
                <li>Baixe o script <strong>Compilar EXE</strong></li>
                <li>Execute como Admin — ele instala ps2exe e gera WinnerRMM_Agent.exe</li>
                <li>Use o EXE com NSSM para maior proteção contra engenharia reversa</li>
              </ol>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
