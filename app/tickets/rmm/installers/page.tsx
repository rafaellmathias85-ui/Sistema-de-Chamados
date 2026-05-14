'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Upload,
  Package,
  Copy,
  Check,
  Trash2,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Download as DownloadIcon,
  Loader2,
} from 'lucide-react';

interface CompanyOption { id: string; name: string }
interface Installer {
  id: string;
  fileName: string;
  version: string;
  packageType: string;
  changelog: string | null;
  fileSize: number;
  sha256: string | null;
  downloadToken: string;
  active: boolean;
  downloadCount: number;
  lastDownloadAt: string | null;
  createdAt: string;
  uploadedByName: string;
  company: { id: string; name: string };
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function InstallersPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // agent auto-generate
  const [generatingAgent, setGeneratingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // upload form
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isAdmin = ['ADMIN','SUPPORT'].includes(session?.user?.role || '');

  useEffect(() => {
    fetch('/api/companies?limit=1000').then((r) => r.json()).then((data) => {
      setCompanies(Array.isArray(data) ? data : data.companies || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedCompany) { setInstallers([]); return; }
    fetchInstallers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, includeArchived]);

  async function fetchInstallers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/rmm/installers?companyId=${selectedCompany}&includeArchived=${includeArchived}`);
      if (res.ok) setInstallers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadAgent(format: string) {
    if (!selectedCompany) return;
    setGeneratingAgent(true);
    setAgentError(null);
    try {
      const res = await fetch('/api/rmm/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany, format }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro ao gerar agente' }));
        throw new Error(err.error || 'Erro ao gerar agente');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : `agente_rmm.ps1`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setAgentError(e.message || 'Erro ao gerar script do agente');
    } finally {
      setGeneratingAgent(false);
    }
  }

  function getDownloadUrl(i: Installer): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/rmm/installers/${i.id}/download?token=${i.downloadToken}`;
  }

  function getInstallCommand(i: Installer): string {
    const url = getDownloadUrl(i);
    if (i.packageType === 'msi') {
      return `# PowerShell (Admin) - Instalacao silenciosa do MSI\n$msi = \"$env:TEMP\\${i.fileName}\"\nInvoke-WebRequest -Uri '${url}' -OutFile $msi -UseBasicParsing\nStart-Process msiexec.exe -ArgumentList '/i',\"$msi\",'/qn','/norestart' -Wait`;
    }
    if (i.packageType === 'exe') {
      return `# PowerShell (Admin) - Instalacao silenciosa do EXE\n$exe = \"$env:TEMP\\${i.fileName}\"\nInvoke-WebRequest -Uri '${url}' -OutFile $exe -UseBasicParsing\nStart-Process $exe -ArgumentList '/S' -Wait`;
    }
    return `# PowerShell (Admin)\nInvoke-WebRequest -Uri '${url}' -OutFile \"$env:TEMP\\${i.fileName}\" -UseBasicParsing`;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !selectedCompany || !version.trim()) {
      setUploadError('Selecione empresa, arquivo e versão.');
      return;
    }
    setUploading(true); setUploadError(null); setUploadProgress(0);
    try {
      // 1. presign
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const packageType = ['msi', 'exe', 'zip', 'ps1'].includes(ext) ? ext : 'bin';
      const presignRes = await fetch('/api/rmm/installers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'presign',
          companyId: selectedCompany,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      });
      if (!presignRes.ok) throw new Error('Falha presign');
      const { uploadUrl, cloudStoragePath } = await presignRes.json();

      // 2. upload S3 via XHR (com progresso)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Erro de rede no upload'));
        xhr.send(file);
      });

      // 3. sha256 (opcional, no-op em arquivos > 500MB)
      let sha256: string | null = null;
      if (file.size <= 500 * 1024 * 1024) {
        try { sha256 = await sha256OfFile(file); } catch {}
      }

      // 4. register
      const regRes = await fetch('/api/rmm/installers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          companyId: selectedCompany,
          fileName: file.name,
          version: version.trim(),
          packageType,
          changelog: changelog.trim() || null,
          cloudStoragePath,
          fileSize: file.size,
          sha256,
        }),
      });
      if (!regRes.ok) throw new Error('Falha register');

      setFile(null); setVersion(''); setChangelog(''); setUploadProgress(0);
      await fetchInstallers();
    } catch (err: any) {
      setUploadError(err.message || 'Erro no upload');
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(i: Installer) {
    await fetch(`/api/rmm/installers/${i.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !i.active }),
    });
    fetchInstallers();
  }

  async function deleteInstaller(i: Installer) {
    if (!confirm(`Excluir DEFINITIVAMENTE ${i.fileName} v${i.version}? Esta acao remove o arquivo do storage.`)) return;
    await fetch(`/api/rmm/installers/${i.id}`, { method: 'DELETE' });
    fetchInstallers();
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-red-400">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets/rmm" className="tm-text-muted hover:tm-text">
          <ArrowLeft size={20} />
        </Link>
        <Package size={24} className="text-accent-blue" />
        <h1 className="text-2xl font-bold tm-text">Pacotes de Instalação</h1>
      </div>

      <div className="tm-bg-card tm-border border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-accent-blue" />
          <label className="tm-text font-medium">Empresa cliente</label>
        </div>
        <select
          className="w-full tm-bg-input tm-border border rounded-lg px-3 py-2 tm-text"
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
        >
          <option value="">-- selecione --</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {selectedCompany && (
        <>
          {/* Gerar Script do Agente RMM */}
          <div className="tm-bg-card tm-border border rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <DownloadIcon size={18} className="text-cyan-400" />
              <h2 className="tm-text font-semibold">Gerar Script do Agente RMM</h2>
            </div>
            <p className="tm-text-muted text-sm">
              Gera automaticamente o instalador PowerShell para esta empresa com token embutido. Basta executar como Administrador na máquina do cliente.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleDownloadAgent('full')}
                disabled={generatingAgent}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium disabled:opacity-50 flex items-center gap-2 text-sm"
              >
                {generatingAgent ? <Loader2 size={16} className="animate-spin" /> : <DownloadIcon size={16} />}
                Instalador Completo (.ps1)
              </button>
              <button
                onClick={() => handleDownloadAgent('uninstall')}
                disabled={generatingAgent}
                className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white font-medium disabled:opacity-50 flex items-center gap-2 text-sm"
              >
                <Trash2 size={16} /> Desinstalador
              </button>
            </div>
            {agentError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertTriangle size={16} /> {agentError}
              </div>
            )}
          </div>

          {/* Upload de pacote customizado */}
          <div className="tm-bg-card tm-border border rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Upload size={18} className="text-green-400" />
              <h2 className="tm-text font-semibold">Upload de pacote customizado (opcional)</h2>
            </div>
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="text-xs tm-text-muted block mb-1">Arquivo (MSI / EXE / ZIP / PS1)</label>
                <input
                  type="file"
                  accept=".msi,.exe,.zip,.ps1"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full tm-bg-input tm-border border rounded-lg px-3 py-2 tm-text text-sm"
                />
                {file && (
                  <p className="text-xs tm-text-muted mt-1">{file.name} · {formatBytes(file.size)}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-xs tm-text-muted block mb-1">Versão</label>
                  <input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full tm-bg-input tm-border border rounded-lg px-3 py-2 tm-text"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs tm-text-muted block mb-1">Changelog (opcional)</label>
                  <input
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder="Notas de release"
                    className="w-full tm-bg-input tm-border border rounded-lg px-3 py-2 tm-text"
                  />
                </div>
              </div>
              {uploadError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle size={16} /> {uploadError}
                </div>
              )}
              {uploading && (
                <div className="w-full bg-gray-700/40 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-accent-blue transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
              <button
                type="submit"
                disabled={uploading || !file || !version.trim()}
                className="px-4 py-2 rounded-lg bg-accent-blue hover:bg-accent-blue/80 text-white font-medium disabled:opacity-50"
              >
                {uploading ? `Enviando ${uploadProgress}%...` : 'Enviar pacote'}
              </button>
            </form>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="tm-text font-semibold">Pacotes desta empresa</h2>
            <label className="text-sm tm-text-muted flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
              Mostrar arquivados
            </label>
          </div>

          {loading && <p className="tm-text-muted">Carregando...</p>}
          {!loading && installers.length === 0 && (
            <p className="tm-text-muted text-sm">Nenhum pacote enviado para esta empresa ainda.</p>
          )}

          <div className="space-y-3">
            {installers.map((i) => (
              <div key={i.id} className={`tm-bg-card tm-border border rounded-xl p-4 ${i.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-accent-blue" />
                      <span className="tm-text font-medium truncate">{i.fileName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue">v{i.version}</span>
                      {!i.active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400">arquivado</span>
                      )}
                    </div>
                    <p className="text-xs tm-text-muted mt-1">
                      {formatBytes(i.fileSize)} · {i.packageType.toUpperCase()} · enviado por {i.uploadedByName} em {new Date(i.createdAt).toLocaleString('pt-BR')}
                    </p>
                    {i.changelog && <p className="text-sm tm-text mt-2">{i.changelog}</p>}
                    {i.sha256 && (
                      <p className="text-xs tm-text-muted mt-1 font-mono break-all">SHA256: {i.sha256}</p>
                    )}
                    <p className="text-xs tm-text-muted mt-1">
                      <DownloadIcon size={12} className="inline mr-1" />
                      {i.downloadCount} download(s) {i.lastDownloadAt && `· último: ${new Date(i.lastDownloadAt).toLocaleString('pt-BR')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(i)}
                      title={i.active ? 'Arquivar' : 'Reativar'}
                      className="p-2 rounded-lg hover:bg-white/5 tm-text"
                    >
                      {i.active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                    </button>
                    <button
                      onClick={() => deleteInstaller(i)}
                      title="Excluir definitivamente"
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {i.active && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <p className="text-xs tm-text-muted mb-1">Link de download (token):</p>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={getDownloadUrl(i)}
                          className="flex-1 tm-bg-input tm-border border rounded-lg px-3 py-1.5 tm-text text-xs font-mono"
                        />
                        <button
                          onClick={() => copy(getDownloadUrl(i), `url-${i.id}`)}
                          className="p-2 rounded-lg hover:bg-white/5 tm-text"
                        >
                          {copied === `url-${i.id}` ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs tm-text-muted mb-1">Comando de instalação silenciosa (PowerShell Admin):</p>
                      <div className="flex items-start gap-2">
                        <pre className="flex-1 tm-bg-input tm-border border rounded-lg px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all tm-text">{getInstallCommand(i)}</pre>
                        <button
                          onClick={() => copy(getInstallCommand(i), `cmd-${i.id}`)}
                          className="p-2 rounded-lg hover:bg-white/5 tm-text"
                        >
                          {copied === `cmd-${i.id}` ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
