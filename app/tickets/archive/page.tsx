'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Search,
  Upload,
  Trash2,
  RefreshCw,
  Building2,
  User,
  Calendar,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  History,
  Undo2,
  X,
} from 'lucide-react';

interface LegacyTicket {
  id: string;
  ticketNumber: string;
  requester: string;
  company: string;
  assignee: string | null;
  ticketDate: string;
  description: string;
  descriptionHtml: string | null;
  status: string | null;
  priority: string | null;
  category: string | null;
  sourceSystem: string;
  importedAt: string;
}

export default function ArchivePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<LegacyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    else if (status === 'authenticated' && session?.user?.role !== 'ADMIN' && session?.user?.role !== 'SUPPORT') {
      router.push('/tickets');
    }
  }, [status, session, router]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const res = await fetch(`/api/legacy-tickets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Erro ao carregar arquivo:', err);
    }
    setLoading(false);
  }, [search, page, pageSize]);

  useEffect(() => {
    if (status === 'authenticated') loadTickets();
  }, [status, loadTickets]);

  const selectedTicket = tickets.find((t) => t.id === selectedId);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (status !== 'authenticated') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] tm-bg-main">
      {/* Column 1: list */}
      <div className="w-96 border-r tm-border tm-bg-card flex flex-col">
        <div className="p-3 border-b tm-border space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold tm-text flex items-center gap-2">
              <Archive size={16} className="text-cyan-400" />
              Arquivo de Chamados
            </h2>
            <span className="text-xs tm-text-muted">{total} total</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Upload size={12} />
              Importar
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="px-2 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-lg transition-colors"
              title="Histórico de Importações / Desfazer"
            >
              <History size={12} />
            </button>
            <button
              onClick={loadTickets}
              className="px-2 py-1.5 tm-bg-main hover:tm-bg-card border tm-border rounded-lg tm-text-secondary transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 tm-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por número, solicitante, empresa..."
              className="w-full pl-7 pr-2 py-1.5 text-xs tm-bg-main border tm-border rounded-lg tm-text placeholder:tm-text-muted focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center">
              <Archive size={32} className="mx-auto mb-2 tm-text-muted opacity-50" />
              <p className="text-sm tm-text-muted">Nenhum chamado arquivado</p>
              <p className="text-xs tm-text-muted mt-1">Use o botão Importar para carregar o histórico</p>
            </div>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 border-b tm-border transition-colors ${
                  selectedId === t.id ? 'bg-cyan-900/20 border-l-2 border-l-cyan-400' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-mono text-cyan-400">#{t.ticketNumber}</span>
                  <span className="text-[10px] tm-text-muted">
                    {new Date(t.ticketDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs tm-text font-medium line-clamp-2 mb-1">
                  {t.description.substring(0, 120) || '(sem descrição)'}
                </p>
                <div className="flex items-center gap-2 text-[10px] tm-text-muted">
                  <span className="flex items-center gap-0.5 truncate"><Building2 size={9} />{t.company}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] tm-text-muted mt-0.5">
                  <span className="flex items-center gap-0.5 truncate"><User size={9} />{t.requester}</span>
                </div>
              </button>
            ))
          )}
        </div>
        {/* Pagination */}
        {total > pageSize && (
          <div className="p-2 border-t tm-border flex items-center justify-between text-xs">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded tm-text-secondary hover:tm-text disabled:opacity-40"
            >
              ←
            </button>
            <span className="tm-text-muted">
              Pág. {page} de {Math.ceil(total / pageSize)}
            </span>
            <button
              onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
              disabled={page >= Math.ceil(total / pageSize)}
              className="px-2 py-1 rounded tm-text-secondary hover:tm-text disabled:opacity-40"
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Column 2: detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedTicket ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Archive size={48} className="mx-auto mb-3 tm-text-muted opacity-30" />
              <p className="text-sm tm-text-muted">Selecione um chamado arquivado para visualizar</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded font-mono">
                    #{selectedTicket.ticketNumber}
                  </span>
                  <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">
                    {selectedTicket.sourceSystem}
                  </span>
                  {selectedTicket.status && (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                      {selectedTicket.status}
                    </span>
                  )}
                  {selectedTicket.priority && (
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                      {selectedTicket.priority}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-semibold tm-text">
                  Chamado Arquivado - {formatDate(selectedTicket.ticketDate)}
                </h1>
              </div>
              {session?.user?.role === 'ADMIN' && (
                <button
                  onClick={async () => {
                    if (!confirm('Excluir este chamado arquivado?')) return;
                    const res = await fetch(`/api/legacy-tickets/${selectedTicket.id}`, { method: 'DELETE' });
                    if (res.ok) {
                      setSelectedId(null);
                      loadTickets();
                    }
                  }}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm flex items-center gap-1.5"
                >
                  <Trash2 size={14} /> Excluir
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="tm-bg-card border tm-border rounded-lg p-3">
                <p className="text-[10px] uppercase tm-text-muted mb-1">Solicitante</p>
                <p className="text-sm tm-text font-medium">{selectedTicket.requester}</p>
              </div>
              <div className="tm-bg-card border tm-border rounded-lg p-3">
                <p className="text-[10px] uppercase tm-text-muted mb-1">Empresa</p>
                <p className="text-sm tm-text font-medium">{selectedTicket.company}</p>
              </div>
              <div className="tm-bg-card border tm-border rounded-lg p-3">
                <p className="text-[10px] uppercase tm-text-muted mb-1">Responsável</p>
                <p className="text-sm tm-text font-medium">{selectedTicket.assignee || '—'}</p>
              </div>
            </div>

            <div className="tm-bg-card border tm-border rounded-lg p-4">
              <h3 className="text-xs font-semibold uppercase tm-text-muted mb-3 flex items-center gap-1.5">
                <FileText size={12} /> Descrição e Interações
              </h3>
              {selectedTicket.descriptionHtml ? (
                <div
                  className="email-body prose prose-sm prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedTicket.descriptionHtml }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm tm-text" style={{ color: 'var(--text-primary)' }}>
                  {selectedTicket.description || '(sem descrição)'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs tm-text-muted pt-2">
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                Chamado em {formatDate(selectedTicket.ticketDate)}
              </span>
              <span>
                Importado em {formatDate(selectedTicket.importedAt)}
              </span>
            </div>
          </div>
        )}
      </div>

      {showImport && <ImportLegacyModal onClose={() => setShowImport(false)} onSuccess={loadTickets} />}
      {showHistory && (
        <ImportHistoryModal
          onClose={() => setShowHistory(false)}
          onUndone={() => {
            loadTickets();
            setSelectedId(null);
          }}
          canUndo={session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPPORT'}
        />
      )}
    </div>
  );
}

// Modal de importacao
function ImportLegacyModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceSystem, setSourceSystem] = useState('N-ABLE');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceSystem', sourceSystem);
      const res = await fetch('/api/legacy-tickets/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro na importação');
      } else {
        setResult(data);
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || 'Erro de rede');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="tm-bg-card border tm-border rounded-2xl p-6 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tm-text mb-1 flex items-center gap-2">
          <Upload className="text-cyan-400" size={20} />
          Importar Chamados Antigos
        </h2>
        <p className="text-xs tm-text-muted mb-4">
          Aceita XLSX, CSV ou JSON. Campos obrigatórios: <strong>número</strong>, <strong>solicitante</strong>, <strong>empresa</strong>.
          Opcionais: responsável, data, descrição e interações.
        </p>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle2 className="text-green-400" size={18} />
              <p className="text-sm text-green-400 font-medium">Importação concluída!</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="tm-bg-main border tm-border rounded-lg p-3">
                <p className="text-xs tm-text-muted">Criados</p>
                <p className="text-lg font-bold text-green-400">{result.created}</p>
              </div>
              <div className="tm-bg-main border tm-border rounded-lg p-3">
                <p className="text-xs tm-text-muted">Atualizados</p>
                <p className="text-lg font-bold text-blue-400">{result.updated}</p>
              </div>
              <div className="tm-bg-main border tm-border rounded-lg p-3">
                <p className="text-xs tm-text-muted">Ignorados</p>
                <p className="text-lg font-bold text-orange-400">{result.skipped}</p>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="tm-bg-main border border-red-500/30 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-red-400 mb-2">Erros:</p>
                {result.errors.map((e: string, i: number) => (
                  <p key={i} className="text-xs tm-text-muted">• {e}</p>
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs tm-text-muted block mb-1">Sistema de Origem</label>
              <select
                value={sourceSystem}
                onChange={(e) => setSourceSystem(e.target.value)}
                className="w-full tm-bg-main border tm-border rounded-lg px-3 py-2 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="N-ABLE">N-able (MSP Manager)</option>
                <option value="KASEYA">Kaseya / Connectwise</option>
                <option value="TOMTICKET">TomTicket</option>
                <option value="OTRS">OTRS</option>
                <option value="GLPI">GLPI</option>
                <option value="ZENDESK">Zendesk</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div>
              <label className="text-xs tm-text-muted block mb-1">Arquivo (XLSX, CSV ou JSON)</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm tm-text file:mr-3 file:px-3 file:py-1.5 file:bg-cyan-600 file:text-white file:rounded-lg file:border-0 file:cursor-pointer hover:file:bg-cyan-500"
              />
              {file && (
                <p className="text-xs tm-text-muted mt-1">
                  Selecionado: <strong className="tm-text">{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-300 font-medium mb-1">Campos aceitos (case-insensitive):</p>
              <ul className="text-[11px] tm-text-muted space-y-0.5">
                <li>• <strong>Número:</strong> ticketNumber, numero, number, id</li>
                <li>• <strong>Solicitante:</strong> requester, solicitante, cliente</li>
                <li>• <strong>Empresa:</strong> company, empresa</li>
                <li>• <strong>Responsável:</strong> assignee, responsavel, agent</li>
                <li>• <strong>Data:</strong> ticketDate, date, data, dataAbertura</li>
                <li>• <strong>Descrição:</strong> description, descricao, conteudo, historico</li>
              </ul>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="text-red-400" size={16} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={uploading}
                className="flex-1 px-4 py-2 tm-bg-main hover:tm-bg-card border tm-border rounded-lg tm-text-secondary text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Importar
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// Modal de Historico de Importacoes + Desfazer
interface ImportBatch {
  id: string;
  fileName: string;
  sourceSystem: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  importedByName: string | null;
  createdAt: string;
  undoneAt: string | null;
  undoneBy: string | null;
  activeTicketsCount: number;
}

function ImportHistoryModal({
  onClose,
  onUndone,
  canUndo,
}: {
  onClose: () => void;
  onUndone: () => void;
  canUndo: boolean;
}) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/legacy-tickets/imports');
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      } else {
        setError('Erro ao carregar histórico');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro de rede');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleUndo = async (id: string) => {
    setUndoing(id);
    setError('');
    try {
      const res = await fetch(`/api/legacy-tickets/imports/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao desfazer');
      } else {
        setConfirmUndoId(null);
        await loadBatches();
        onUndone();
      }
    } catch (err: any) {
      setError(err?.message || 'Erro de rede');
    } finally {
      setUndoing(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="tm-bg-card border tm-border rounded-2xl p-6 max-w-4xl w-full shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tm-text flex items-center gap-2">
            <History className="text-amber-400" size={20} />
            Histórico de Importações
          </h2>
          <button onClick={onClose} className="tm-text-muted hover:tm-text">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs tm-text-muted mb-3">
          Cada linha representa uma importação realizada. O botão <strong className="text-amber-400">Desfazer</strong> remove
          apenas os chamados <strong>CRIADOS</strong> por essa importação. Chamados que já existiam e foram apenas atualizados
          <strong> não</strong> são removidos.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertCircle className="text-red-400" size={16} />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center p-12">
              <History size={36} className="mx-auto mb-2 tm-text-muted opacity-40" />
              <p className="text-sm tm-text-muted">Nenhuma importação registrada ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((b) => {
                const isUndone = !!b.undoneAt;
                const canUndoThis = canUndo && !isUndone && b.activeTicketsCount > 0;
                const isConfirming = confirmUndoId === b.id;
                return (
                  <div
                    key={b.id}
                    className={`tm-bg-main border rounded-lg p-3 transition-all ${
                      isUndone ? 'border-white/5 opacity-60' : 'tm-border hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold tm-text truncate">{b.fileName}</p>
                          <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-[10px] rounded font-mono">
                            {b.sourceSystem}
                          </span>
                          {isUndone && (
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded flex items-center gap-1">
                              <Undo2 size={9} /> DESFEITO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] tm-text-muted flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {formatDate(b.createdAt)}
                          </span>
                          {b.importedByName && (
                            <span className="flex items-center gap-1">
                              <User size={10} />
                              {b.importedByName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-[11px]">
                          <span className="text-green-400">✓ {b.created} criados</span>
                          <span className="text-blue-400">↻ {b.updated} atualizados</span>
                          {b.skipped > 0 && <span className="text-orange-400">⊘ {b.skipped} ignorados</span>}
                          {!isUndone && (
                            <span className="tm-text-muted">
                              (<strong className="tm-text">{b.activeTicketsCount}</strong> ativos)
                            </span>
                          )}
                        </div>
                        {isUndone && b.undoneAt && (
                          <p className="text-[10px] text-red-300 mt-1.5">
                            Desfeito em {formatDate(b.undoneAt)}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {canUndoThis && !isConfirming && (
                          <button
                            onClick={() => setConfirmUndoId(b.id)}
                            disabled={undoing !== null}
                            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
                          >
                            <Undo2 size={12} />
                            Desfazer
                          </button>
                        )}
                        {isConfirming && (
                          <div className="flex flex-col gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                            <p className="text-[10px] text-red-300 mb-1">Confirmar exclusão de <strong>{b.activeTicketsCount}</strong> chamados?</p>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleUndo(b.id)}
                                disabled={undoing === b.id}
                                className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40"
                              >
                                {undoing === b.id ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <Trash2 size={10} />
                                )}
                                Sim
                              </button>
                              <button
                                onClick={() => setConfirmUndoId(null)}
                                disabled={undoing === b.id}
                                className="flex-1 px-2 py-1 tm-bg-card border tm-border rounded text-[10px] tm-text-secondary"
                              >
                                Não
                              </button>
                            </div>
                          </div>
                        )}
                        {isUndone && (
                          <span className="text-[10px] tm-text-muted italic">Já desfeito</span>
                        )}
                        {!canUndoThis && !isUndone && b.activeTicketsCount === 0 && (
                          <span className="text-[10px] tm-text-muted italic">Sem tickets</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={loadBatches}
            disabled={loading}
            className="px-3 py-1.5 tm-bg-main hover:tm-bg-card border tm-border rounded-lg text-xs tm-text-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}