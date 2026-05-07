'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Search, Loader2, CheckCircle2, XCircle, Clock, Send, X, Ticket, RotateCcw } from 'lucide-react';

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
  revisionReason?: string | null;
  revisionRequestedBy?: string | null;
  revisionRequestedAt?: string | null;
  approvedByName?: string | null;
  rejectedByName?: string | null;
  company?: { id: string; name: string } | null;
  ticket?: { id: string; number: number; subject?: string } | null;
  _count?: { items: number };
}

interface TicketOption {
  id: string;
  number: number;
  subject: string;
  company?: { name: string } | null;
}

/** Formata número do orçamento: se tem ticket vinculado, retorna X-YYYY */
function formatQuoteNumber(quoteNumber: number, ticketNumber?: number | null): string {
  if (ticketNumber) return `${quoteNumber}-${ticketNumber}`;
  return `${quoteNumber}`;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-300',
  SENT: 'bg-blue-500/20 text-blue-300',
  APPROVED: 'bg-green-500/20 text-green-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  EXPIRED: 'bg-yellow-500/20 text-yellow-300',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
  REVISION: 'bg-amber-500/20 text-amber-300',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
  REVISION: 'Em Revisão',
};

type TabType = 'all' | 'approval';

// Modal de ação com justificativa
function ActionModal({ action, onConfirm, onClose }: {
  action: 'APPROVE' | 'REJECT' | 'REVISION' | 'STAFF_APPROVE' | 'STAFF_REJECT';
  onConfirm: (justification: string) => void;
  onClose: () => void;
}) {
  const [justification, setJustification] = useState('');
  const titles: Record<string, string> = {
    APPROVE: 'Aprovar Orçamento',
    REJECT: 'Rejeitar Orçamento',
    REVISION: 'Solicitar Revisão',
    STAFF_APPROVE: 'Aprovar em Nome do Cliente',
    STAFF_REJECT: 'Rejeitar em Nome do Cliente',
  };
  const descriptions: Record<string, string> = {
    APPROVE: 'Confirme a aprovação deste orçamento.',
    REJECT: 'Informe o motivo da rejeição. (obrigatório)',
    REVISION: 'Descreva o que precisa ser revisado. (obrigatório)',
    STAFF_APPROVE: 'Informe a justificativa para aprovar em nome do cliente. (obrigatório)',
    STAFF_REJECT: 'Informe a justificativa para rejeitar em nome do cliente. (obrigatório)',
  };
  const required = action !== 'APPROVE';
  const btnColor = action === 'APPROVE' || action === 'STAFF_APPROVE' ? 'bg-green-600 hover:bg-green-700' : action === 'REVISION' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">{titles[action]}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-400">{descriptions[action]}</p>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder={required ? 'Justificativa...' : 'Justificativa (opcional)...'}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-500 resize-none"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20">Cancelar</button>
          <button
            onClick={() => onConfirm(justification)}
            disabled={required && !justification.trim()}
            className={`px-4 py-2 rounded-lg text-white text-sm disabled:opacity-40 ${btnColor}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuotesListPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<TabType>('all');
  const [approving, setApproving] = useState<string | null>(null);

  // Modal de ação
  const [actionModal, setActionModal] = useState<{ quoteId: string; action: 'APPROVE' | 'REJECT' | 'REVISION' | 'STAFF_APPROVE' | 'STAFF_REJECT' } | null>(null);

  // Modal de seleção de ticket para novo orçamento
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');
  const [tickets, setTickets] = useState<TicketOption[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [creating, setCreating] = useState(false);

  const role = session?.user?.role;
  const isStaff = role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
  const isAdminOrFinance = role === 'ADMIN' || role === 'FINANCE';
  const isClient = role === 'CLIENT';
  const canCreate = isStaff;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tab === 'approval') {
        // Nada — buscar tudo e filtrar SENT no front
      } else if (statusFilter) {
        params.set('status', statusFilter);
      }
      const r = await fetch(`/api/quotes?${params.toString()}`);
      if (r.ok) setQuotes(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]); // eslint-disable-line

  const searchTickets = async (q: string) => {
    setLoadingTickets(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (q) params.set('search', q);
      const r = await fetch(`/api/tickets?${params.toString()}`);
      if (r.ok) {
        const data = await r.json();
        const list = Array.isArray(data) ? data : (data.tickets || []);
        setTickets(list.map((t: any) => ({ id: t.id, number: t.number, subject: t.subject, company: t.company })));
      }
    } finally { setLoadingTickets(false); }
  };

  const openTicketModal = () => {
    setShowTicketModal(true);
    setTicketSearch('');
    searchTickets('');
  };

  const handleSelectTicket = async (ticket: TicketOption) => {
    setCreating(true);
    try {
      const r = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Orçamento - Chamado #${ticket.number}`,
          ticketId: ticket.id,
        }),
      });
      if (r.ok) {
        const q = await r.json();
        router.push(`/tickets/quotes/${q.id}`);
      } else {
        const err = await r.json();
        alert(err.error || 'Erro ao criar orçamento');
      }
    } finally {
      setCreating(false);
      setShowTicketModal(false);
    }
  };

  const handleActionConfirm = async (justification: string) => {
    if (!actionModal) return;
    const { quoteId, action } = actionModal;
    setApproving(quoteId);
    setActionModal(null);
    try {
      let body: any;
      if (isClient) {
        // CLIENT usa clientAction
        const clientActionMap: Record<string, string> = { APPROVE: 'APPROVE', REJECT: 'REJECT', REVISION: 'REVISION' };
        body = { clientAction: clientActionMap[action], justification: justification || undefined };
      } else {
        // STAFF usa status diretamente
        const statusMap: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', STAFF_APPROVE: 'APPROVED', STAFF_REJECT: 'REJECTED' };
        body = { status: statusMap[action], justification: justification || undefined };
      }
      const r = await fetch(`/api/quotes/${quoteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) load();
      else {
        const err = await r.json();
        alert(err.error || 'Erro ao processar ação');
      }
    } finally { setApproving(null); }
  };

  // Filtrar para mesa de aprovação: SENT + REVISION
  const approvalQuotes = quotes.filter(q => q.status === 'SENT' || q.status === 'REVISION');
  const sentCount = quotes.filter(q => q.status === 'SENT').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold tm-text">Orçamentos</h1>
        </div>
        {canCreate && (
          <button onClick={openTicketModal} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Plus size={16} /> Novo orçamento
          </button>
        )}
      </div>

      {/* Tabs — visível para staff E client */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-blue-600 text-white' : 'tm-text-secondary hover:tm-text hover:bg-white/10'}`}
        >
          <FileText size={14} className="inline mr-1.5 -mt-0.5" /> {isClient ? 'Meus Orçamentos' : 'Todos'}
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
            <span>{isClient ? 'Orçamentos aguardando sua aprovação' : 'Orçamentos enviados aguardando aprovação ou rejeição'}</span>
          </div>
          <div className="tm-bg-card border tm-border rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
            ) : approvalQuotes.length === 0 ? (
              <div className="text-center py-16 tm-text-muted">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400/50" />
                <p>Nenhum orçamento pendente de aprovação</p>
              </div>
            ) : (
              <div className="divide-y tm-border">
                {approvalQuotes.map((q) => (
                  <div key={q.id} className="p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-blue-400 font-semibold">#{formatQuoteNumber(q.number, q.ticket?.number)}</span>
                          <span className="tm-text font-medium truncate">{q.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs tm-text-secondary flex-wrap">
                          <span>Empresa: <strong className="tm-text">{q.company?.name || '—'}</strong></span>
                          <span>Criado por: {q.createdByName || '—'}</span>
                          <span>Enviado: {q.sentAt ? new Date(q.sentAt).toLocaleDateString('pt-BR') : '—'}</span>
                          {q.validUntil && <span>Válido até: {new Date(q.validUntil).toLocaleDateString('pt-BR')}</span>}
                          <span>{q._count?.items || 0} itens</span>
                        </div>
                        {q.status === 'REVISION' && q.revisionReason && (
                          <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <p className="text-xs text-amber-300"><strong>Revisão solicitada por {q.revisionRequestedBy}:</strong> {q.revisionReason}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
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
                        {/* Ações para CLIENT — status SENT */}
                        {isClient && q.status === 'SENT' && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); setActionModal({ quoteId: q.id, action: 'APPROVE' }); }}
                              disabled={approving === q.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} /> Aprovar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setActionModal({ quoteId: q.id, action: 'REJECT' }); }}
                              disabled={approving === q.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm disabled:opacity-50"
                            >
                              <XCircle size={14} /> Rejeitar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setActionModal({ quoteId: q.id, action: 'REVISION' }); }}
                              disabled={approving === q.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm disabled:opacity-50"
                            >
                              <RotateCcw size={14} /> Solicitar Revisão
                            </button>
                          </>
                        )}
                        {/* Ações para STAFF — status SENT */}
                        {isStaff && q.status === 'SENT' && (
                          <>
                            {isAdminOrFinance && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setActionModal({ quoteId: q.id, action: 'STAFF_APPROVE' }); }}
                                  disabled={approving === q.id}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm disabled:opacity-50"
                                >
                                  {approving === q.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Aprovar
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setActionModal({ quoteId: q.id, action: 'STAFF_REJECT' }); }}
                                  disabled={approving === q.id}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm disabled:opacity-50"
                                >
                                  <XCircle size={14} /> Rejeitar
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {/* STAFF — status REVISION: botão para voltar ao rascunho */}
                        {isStaff && q.status === 'REVISION' && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setApproving(q.id);
                              try {
                                const r = await fetch(`/api/quotes/${q.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DRAFT' }) });
                                if (r.ok) load();
                                else alert('Erro ao voltar para rascunho');
                              } finally { setApproving(null); }
                            }}
                            disabled={approving === q.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-500/20 text-gray-300 hover:bg-gray-500/30 text-sm disabled:opacity-50"
                          >
                            <RotateCcw size={14} /> Voltar p/ Rascunho
                          </button>
                        )}
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
                  <th className="px-4 py-3">Chamado</th>
                  {!isClient && <th className="px-4 py-3">Empresa</th>}
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
                    <td className="px-4 py-3 text-blue-400 font-semibold">#{formatQuoteNumber(q.number, q.ticket?.number)}</td>
                    <td className="px-4 py-3 tm-text">{q.title}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">
                      {q.ticket ? (
                        <span className="inline-flex items-center gap-1">
                          <Ticket size={12} className="text-blue-400" />
                          #{q.ticket.number}
                        </span>
                      ) : '—'}
                    </td>
                    {!isClient && <td className="px-4 py-3 tm-text-secondary">{q.company?.name || '—'}</td>}
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

      {/* Modal de ação com justificativa */}
      {actionModal && (
        <ActionModal
          action={actionModal.action}
          onConfirm={handleActionConfirm}
          onClose={() => setActionModal(null)}
        />
      )}

      {/* Modal de seleção de ticket para novo orçamento */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowTicketModal(false)}>
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-semibold text-white">Selecionar Chamado</h3>
                <p className="text-xs text-gray-400 mt-0.5">Escolha o chamado para vincular ao novo orçamento</p>
              </div>
              <button onClick={() => setShowTicketModal(false)} className="p-1.5 rounded hover:bg-white/10 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => { setTicketSearch(e.target.value); }}
                  onKeyDown={(e) => e.key === 'Enter' && searchTickets(ticketSearch)}
                  placeholder="Buscar por número ou assunto..."
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-500"
                  autoFocus
                />
              </div>
              <button onClick={() => searchTickets(ticketSearch)} className="mt-2 w-full px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm">Buscar</button>
            </div>
            <div className="flex-1 overflow-auto px-2 py-2">
              {loadingTickets ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Nenhum chamado encontrado</div>
              ) : (
                <div className="space-y-1">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTicket(t)}
                      disabled={creating}
                      className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 group"
                    >
                      <div className="flex items-center gap-2">
                        <Ticket size={14} className="text-blue-400 flex-shrink-0" />
                        <span className="text-blue-400 font-semibold text-sm">#{t.number}</span>
                        <span className="text-white text-sm truncate flex-1">{t.subject}</span>
                      </div>
                      {t.company?.name && (
                        <div className="text-xs text-gray-400 mt-0.5 ml-6">{t.company.name}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {creating && (
              <div className="px-5 py-3 border-t border-white/10 flex items-center justify-center gap-2 text-blue-400 text-sm">
                <Loader2 size={14} className="animate-spin" /> Criando orçamento...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
