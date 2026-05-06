'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Search, Loader2, CheckCircle2, XCircle, Clock, Send } from 'lucide-react';

interface QuoteRow {
  id: string;
  number: number;
  title: string;
  status: string;
  total: number;
  createdAt: string;
  createdByName?: string;
  sentAt?: string | null;
  validUntil?: string | null;
  company?: { id: string; name: string } | null;
  ticket?: { id: string; number: number } | null;
  _count?: { items: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-300',
  SENT: 'bg-blue-500/20 text-blue-300',
  APPROVED: 'bg-green-500/20 text-green-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  EXPIRED: 'bg-yellow-500/20 text-yellow-300',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

type TabType = 'all' | 'approval';

export default function QuotesListPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<TabType>('all');
  const [approving, setApproving] = useState<string | null>(null);

  const role = session?.user?.role;
  const isStaff = role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
  const canCreate = isStaff;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tab === 'approval') {
        params.set('status', 'SENT');
      } else if (statusFilter) {
        params.set('status', statusFilter);
      }
      const r = await fetch(`/api/quotes?${params.toString()}`);
      if (r.ok) setQuotes(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]); // eslint-disable-line

  const handleCreate = async () => {
    const r = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Novo orcamento' }),
    });
    if (r.ok) {
      const q = await r.json();
      router.push(`/tickets/quotes/${q.id}`);
    }
  };

  const handleApprove = async (quoteId: string) => {
    setApproving(quoteId);
    try {
      const r = await fetch(`/api/quotes/${quoteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) });
      if (r.ok) load();
      else alert('Erro ao aprovar');
    } finally { setApproving(null); }
  };

  const handleReject = async (quoteId: string) => {
    const reason = prompt('Motivo da rejeição (opcional):');
    setApproving(quoteId);
    try {
      const r = await fetch(`/api/quotes/${quoteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REJECTED', rejectionReason: reason || null }) });
      if (r.ok) load();
      else alert('Erro ao rejeitar');
    } finally { setApproving(null); }
  };

  const sentCount = quotes.filter(q => q.status === 'SENT').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold tm-text">Orçamentos</h1>
        </div>
        {canCreate && (
          <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Plus size={16} /> Novo orçamento
          </button>
        )}
      </div>

      {/* Tabs */}
      {isStaff && (
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-blue-600 text-white' : 'tm-text-secondary hover:tm-text hover:bg-white/10'}`}
          >
            <FileText size={14} className="inline mr-1.5 -mt-0.5" /> Todos
          </button>
          <button
            onClick={() => setTab('approval')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'approval' ? 'bg-orange-600 text-white' : 'tm-text-secondary hover:tm-text hover:bg-white/10'}`}
          >
            <Clock size={14} /> Mesa de Aprovação
            {tab !== 'approval' && sentCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold">{sentCount}</span>
            )}
          </button>
        </div>
      )}

      {/* Filters - only show on "all" tab */}
      {tab === 'all' && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 tm-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Buscar por número ou título"
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); }} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 tm-text text-sm">
            <option value="">Todos status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} className="px-4 py-2 rounded-lg bg-white/10 tm-text text-sm hover:bg-white/20">Filtrar</button>
        </div>
      )}

      {/* Approval Table */}
      {tab === 'approval' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm tm-text-secondary">
            <Send size={16} className="text-orange-400" />
            <span>Orçamentos enviados aguardando aprovação ou rejeição</span>
          </div>
          <div className="tm-bg-card border tm-border rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-16 tm-text-muted">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400/50" />
                <p>Nenhum orçamento pendente de aprovação</p>
              </div>
            ) : (
              <div className="divide-y tm-border">
                {quotes.map((q) => (
                  <div key={q.id} className="p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-blue-400 font-semibold">#{q.number}</span>
                          <span className="tm-text font-medium truncate">{q.title}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs tm-text-secondary flex-wrap">
                          <span>Empresa: <strong className="tm-text">{q.company?.name || '—'}</strong></span>
                          <span>Criado por: {q.createdByName || '—'}</span>
                          <span>Enviado: {q.sentAt ? new Date(q.sentAt).toLocaleDateString('pt-BR') : '—'}</span>
                          {q.validUntil && <span>Válido até: {new Date(q.validUntil).toLocaleDateString('pt-BR')}</span>}
                          <span>{q._count?.items || 0} itens</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right mr-3">
                          <div className="text-xs tm-text-muted">Total</div>
                          <div className="text-lg font-bold tm-text font-mono">R$ {q.total.toFixed(2)}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/tickets/quotes/${q.id}`); }}
                          className="px-3 py-1.5 rounded bg-white/10 tm-text text-sm hover:bg-white/20"
                        >
                          Ver detalhes
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleApprove(q.id); }}
                          disabled={approving === q.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm disabled:opacity-50"
                        >
                          {approving === q.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Aprovar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReject(q.id); }}
                          disabled={approving === q.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm disabled:opacity-50"
                        >
                          <XCircle size={14} /> Rejeitar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* All Quotes Table */
        <div className="tm-bg-card border tm-border rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-16 tm-text-muted">Nenhum orçamento encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left tm-text-muted">
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Criado</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => router.push(`/tickets/quotes/${q.id}`)}
                    className="border-t tm-border hover:bg-white/5 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-blue-400 font-semibold">#{q.number}</td>
                    <td className="px-4 py-3 tm-text">{q.title}</td>
                    <td className="px-4 py-3 tm-text-secondary">{q.company?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[q.status] || 'bg-white/10 tm-text'}`}>
                        {STATUS_LABEL[q.status] || q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tm-text font-mono">R$ {q.total.toFixed(2)}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">
                      {q.validUntil ? new Date(q.validUntil).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">
                      {new Date(q.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
