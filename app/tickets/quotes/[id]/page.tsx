'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, Send, CheckCircle2, XCircle, Loader2, Eye, Download, Ticket, RotateCcw, X, Mail } from 'lucide-react';

/** Formata número do orçamento: se tem ticket vinculado, retorna X-YYYY */
function formatQuoteNumber(quoteNumber: number, ticketNumber?: number | null): string {
  if (ticketNumber) return `${quoteNumber}-${ticketNumber}`;
  return `${quoteNumber}`;
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  order: number;
}
interface Quote {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  validUntil: string | null;
  notes: string | null;
  rejectionReason: string | null;
  revisionReason: string | null;
  revisionRequestedBy: string | null;
  revisionRequestedAt: string | null;
  sentToEmails: string | null;
  approvedByName: string | null;
  rejectedByName: string | null;
  actionJustification: string | null;
  companyId: string | null;
  ticketId: string | null;
  company?: { id: string; name: string } | null;
  ticket?: { id: string; number: number; subject: string } | null;
  items: QuoteItem[];
  createdAt: string;
  createdByName: string;
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado', REVISION: 'Em Revisão',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-300',
  SENT: 'bg-blue-500/20 text-blue-300',
  APPROVED: 'bg-green-500/20 text-green-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  EXPIRED: 'bg-yellow-500/20 text-yellow-300',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
  REVISION: 'bg-amber-500/20 text-amber-300',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function QuoteDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [newItem, setNewItem] = useState({ description: '', quantity: '1', unitPrice: '0' });
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Modal "Marcar como enviado" com emails
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendEmails, setSendEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sending, setSending] = useState(false);

  // Modal de ação (client approve/reject/revision)
  const [actionModal, setActionModal] = useState<{ action: 'APPROVE' | 'REJECT' | 'REVISION' | 'STAFF_APPROVE' | 'STAFF_REJECT' } | null>(null);
  const [actionJustification, setActionJustification] = useState('');

  const role = session?.user?.role;
  const isStaff = role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
  const isAdmin = role === 'ADMIN';
  const isAdminOrFinance = role === 'ADMIN' || role === 'FINANCE';
  const isClient = role === 'CLIENT';
  const editable = isStaff && (quote?.status === 'DRAFT' || quote?.status === 'REVISION');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/quotes/${id}`);
      if (r.ok) setQuote(await r.json());
    } finally { setLoading(false); }
  };
  const loadCompanies = async () => {
    try {
      const r = await fetch('/api/companies?limit=999');
      if (r.ok) {
        const data = await r.json();
        setCompanies(Array.isArray(data) ? data : (data.companies || []));
      }
    } catch {}
  };

  useEffect(() => { load(); loadCompanies(); }, [id]); // eslint-disable-line

  const patch = async (data: any) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/quotes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (r.ok) setQuote(await r.json());
      else alert((await r.json()).error || 'Erro');
    } finally { setSaving(false); }
  };

  const addItem = async () => {
    if (!newItem.description) return;
    const r = await fetch(`/api/quotes/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: newItem.description,
        quantity: Number(newItem.quantity) || 0,
        unitPrice: Number(newItem.unitPrice) || 0,
      }),
    });
    if (r.ok) {
      setNewItem({ description: '', quantity: '1', unitPrice: '0' });
      load();
    }
  };
  const updateItem = async (itemId: string, data: any) => {
    await fetch(`/api/quotes/${id}/items/${itemId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    load();
  };
  const deleteItem = async (itemId: string) => {
    if (!confirm('Excluir este item?')) return;
    await fetch(`/api/quotes/${id}/items/${itemId}`, { method: 'DELETE' });
    load();
  };
  const handleDelete = async () => {
    if (!confirm('Excluir este orçamento e todos os itens?')) return;
    const r = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/tickets/quotes');
  };

  const handlePreview = async () => {
    setLoadingPreview(true);
    try {
      const r = await fetch(`/api/quotes/${id}/pdf?format=html`);
      if (r.ok) {
        const html = await r.text();
        setPreviewHtml(html);
        setShowPreview(true);
      } else {
        alert('Erro ao gerar preview');
      }
    } finally { setLoadingPreview(false); }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const r = await fetch(`/api/quotes/${id}/pdf`);
      if (r.ok) {
        const blob = await r.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orcamento-${quote?.ticket?.number ? `${quote.number}-${quote.ticket.number}` : quote?.number || id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Erro ao gerar PDF. Tente novamente.');
      }
    } catch {
      alert('Erro ao baixar PDF');
    } finally { setDownloadingPdf(false); }
  };

  // ── "Marcar como enviado" com destinatários ──
  const openSendModal = () => {
    setShowSendModal(true);
    setSendEmails([]);
    setNewEmail('');
    setEmailError('');
  };

  const addEmail = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (!isValidEmail(email)) { setEmailError('E-mail inválido'); return; }
    if (sendEmails.includes(email)) { setEmailError('E-mail já adicionado'); return; }
    setSendEmails([...sendEmails, email]);
    setNewEmail('');
    setEmailError('');
  };

  const removeEmail = (email: string) => {
    setSendEmails(sendEmails.filter(e => e !== email));
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const r = await fetch(`/api/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SENT',
          sentToEmails: sendEmails.length > 0 ? JSON.stringify(sendEmails) : null,
        }),
      });
      if (r.ok) {
        setQuote(await r.json());
        setShowSendModal(false);

        // Enviar email para cada destinatário (fire-and-forget)
        if (sendEmails.length > 0) {
          fetch(`/api/quotes/${id}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: sendEmails }),
          }).catch(() => {});
        }
      } else {
        alert((await r.json()).error || 'Erro ao enviar');
      }
    } finally { setSending(false); }
  };

  // ── Ação do CLIENT ou ADMIN/FINANCE com justificativa ──
  const handleActionConfirm = async () => {
    if (!actionModal) return;
    setSaving(true);
    try {
      let body: any;
      if (isClient) {
        const clientActionMap: Record<string, string> = { APPROVE: 'APPROVE', REJECT: 'REJECT', REVISION: 'REVISION' };
        body = { clientAction: clientActionMap[actionModal.action], justification: actionJustification || undefined };
      } else {
        const statusMap: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', STAFF_APPROVE: 'APPROVED', STAFF_REJECT: 'REJECTED' };
        body = { status: statusMap[actionModal.action], justification: actionJustification || undefined };
      }
      const r = await fetch(`/api/quotes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        setQuote(await r.json());
        setActionModal(null);
        setActionJustification('');
      } else {
        const err = await r.json();
        alert(err.error || 'Erro');
      }
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>;
  if (!quote) return <div className="text-center tm-text-muted py-16">Orçamento não encontrado.</div>;

  const actionRequired = !!(actionModal && actionModal.action !== 'APPROVE');
  const actionTitles: Record<string, string> = {
    APPROVE: 'Aprovar Orçamento', REJECT: 'Rejeitar Orçamento', REVISION: 'Solicitar Revisão',
    STAFF_APPROVE: 'Aprovar em Nome do Cliente', STAFF_REJECT: 'Rejeitar em Nome do Cliente',
  };
  const actionBtnColor = actionModal && (actionModal.action === 'APPROVE' || actionModal.action === 'STAFF_APPROVE') ? 'bg-green-600 hover:bg-green-700' : actionModal?.action === 'REVISION' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/tickets/quotes" className="p-2 tm-text-secondary hover:tm-text"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <div className="text-blue-400 font-semibold">#{formatQuoteNumber(quote.number, quote.ticket?.number)}</div>
            <h1 className="text-xl font-bold tm-text">{quote.title}</h1>
            {quote.ticket && (
              <Link href={`/tickets/${quote.ticket.id}`} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-400 transition-colors">
                <Ticket size={12} /> Chamado #{quote.ticket.number} — {quote.ticket.subject}
              </Link>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs ${STATUS_COLORS[quote.status] || 'bg-white/10 tm-text'}`}>{STATUS_LABEL[quote.status] || quote.status}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handlePreview} disabled={loadingPreview} className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-sm disabled:opacity-50">
            {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Preview
          </button>
          <button onClick={handleDownloadPdf} disabled={downloadingPdf} className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-sm disabled:opacity-50">
            {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
          </button>

          {/* Staff: Marcar como enviado */}
          {isStaff && (quote.status === 'DRAFT' || quote.status === 'REVISION') && (
            <button disabled={saving} onClick={openSendModal} className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-sm">
              <Send size={14} /> Marcar como enviado
            </button>
          )}

          {/* Staff ADMIN/FINANCE: Aprovar/Rejeitar em nome do cliente */}
          {isAdminOrFinance && quote.status === 'SENT' && (
            <>
              <button disabled={saving} onClick={() => { setActionModal({ action: 'STAFF_APPROVE' }); setActionJustification(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm"><CheckCircle2 size={14} /> Aprovar</button>
              <button disabled={saving} onClick={() => { setActionModal({ action: 'STAFF_REJECT' }); setActionJustification(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm"><XCircle size={14} /> Rejeitar</button>
            </>
          )}

          {/* Staff: Voltar p/ Rascunho (quando em revisão) */}
          {isStaff && quote.status === 'REVISION' && (
            <button disabled={saving} onClick={() => patch({ status: 'DRAFT' })} className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-500/20 text-gray-300 hover:bg-gray-500/30 text-sm"><RotateCcw size={14} /> Voltar p/ Rascunho</button>
          )}

          {/* Client: Aprovar / Rejeitar / Solicitar Revisão */}
          {isClient && quote.status === 'SENT' && (
            <>
              <button disabled={saving} onClick={() => { setActionModal({ action: 'APPROVE' }); setActionJustification(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm"><CheckCircle2 size={14} /> Aprovar</button>
              <button disabled={saving} onClick={() => { setActionModal({ action: 'REJECT' }); setActionJustification(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm"><XCircle size={14} /> Rejeitar</button>
              <button disabled={saving} onClick={() => { setActionModal({ action: 'REVISION' }); setActionJustification(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm"><RotateCcw size={14} /> Solicitar Revisão</button>
            </>
          )}

          {isAdmin && (
            <button onClick={handleDelete} className="px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm flex items-center gap-1"><Trash2 size={14} /> Excluir</button>
          )}
        </div>
      </div>

      {/* Alerta de revisão */}
      {quote.status === 'REVISION' && quote.revisionReason && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw size={16} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Revisão solicitada por {quote.revisionRequestedBy}</span>
            {quote.revisionRequestedAt && <span className="text-xs text-amber-400/70">em {new Date(quote.revisionRequestedAt).toLocaleString('pt-BR')}</span>}
          </div>
          <p className="text-sm tm-text ml-6">{quote.revisionReason}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: dados */}
        <div className="lg:col-span-2 space-y-4">
          <div className="tm-bg-card border tm-border rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs tm-text-muted mb-1">Título</label>
              <input disabled={!editable} value={quote.title} onChange={(e) => setQuote({ ...quote, title: e.target.value })} onBlur={(e) => editable && patch({ title: e.target.value })} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 tm-text disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs tm-text-muted mb-1">Descrição</label>
              <textarea disabled={!editable} value={quote.description || ''} onChange={(e) => setQuote({ ...quote, description: e.target.value })} onBlur={(e) => editable && patch({ description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 tm-text disabled:opacity-60" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs tm-text-muted mb-1">Empresa</label>
                <select disabled={!editable} value={quote.companyId || ''} onChange={(e) => patch({ companyId: e.target.value || null })} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 tm-text disabled:opacity-60">
                  <option value="">—</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs tm-text-muted mb-1">Válido até</label>
                <input type="date" disabled={!editable} value={quote.validUntil ? quote.validUntil.slice(0, 10) : ''} onChange={(e) => patch({ validUntil: e.target.value || null })} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 tm-text disabled:opacity-60" />
              </div>
            </div>
            <div>
              <label className="block text-xs tm-text-muted mb-1">Observações</label>
              <textarea disabled={!editable} value={quote.notes || ''} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} onBlur={(e) => editable && patch({ notes: e.target.value })} rows={2} className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 tm-text disabled:opacity-60" />
            </div>
          </div>

          {/* Itens */}
          <div className="tm-bg-card border tm-border rounded-2xl p-5">
            <h2 className="text-lg font-semibold tm-text mb-3">Itens</h2>
            {quote.items.length === 0 && <div className="tm-text-muted text-sm mb-3">Nenhum item adicionado.</div>}
            <div className="space-y-2">
              {quote.items.map((it) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
                  <input disabled={!editable} defaultValue={it.description} onBlur={(e) => editable && updateItem(it.id, { description: e.target.value })} className="col-span-6 px-2 py-1.5 rounded bg-white/5 border border-white/10 tm-text text-sm disabled:opacity-60" />
                  <input disabled={!editable} type="number" step="0.01" defaultValue={it.quantity} onBlur={(e) => editable && updateItem(it.id, { quantity: Number(e.target.value) })} className="col-span-2 px-2 py-1.5 rounded bg-white/5 border border-white/10 tm-text text-sm disabled:opacity-60" />
                  <input disabled={!editable} type="number" step="0.01" defaultValue={it.unitPrice} onBlur={(e) => editable && updateItem(it.id, { unitPrice: Number(e.target.value) })} className="col-span-2 px-2 py-1.5 rounded bg-white/5 border border-white/10 tm-text text-sm disabled:opacity-60" />
                  <div className="col-span-1 text-right tm-text font-mono text-sm">{it.total.toFixed(2)}</div>
                  <div className="col-span-1 text-right">
                    {editable && <button onClick={() => deleteItem(it.id)} className="p-1 text-red-400 hover:bg-red-500/20 rounded"><Trash2 size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
            {editable && (
              <div className="grid grid-cols-12 gap-2 items-center mt-4 pt-4 border-t tm-border">
                <input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="Descrição do item" className="col-span-6 px-2 py-1.5 rounded bg-white/5 border border-white/10 tm-text text-sm" />
                <input type="number" step="0.01" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} placeholder="Qtd" className="col-span-2 px-2 py-1.5 rounded bg-white/5 border border-white/10 tm-text text-sm" />
                <input type="number" step="0.01" value={newItem.unitPrice} onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })} placeholder="Valor" className="col-span-2 px-2 py-1.5 rounded bg-white/5 border border-white/10 tm-text text-sm" />
                <div className="col-span-2">
                  <button onClick={addItem} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-blue-500 text-white text-sm hover:bg-blue-600"><Plus size={14} /> Adicionar</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: resumo */}
        <div className="space-y-4">
          <div className="tm-bg-card border tm-border rounded-2xl p-5">
            <h3 className="font-semibold tm-text mb-3">Resumo</h3>
            <div className="flex justify-between text-sm tm-text-secondary mb-2">
              <span>Subtotal</span><span className="font-mono tm-text">R$ {quote.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm tm-text-secondary mb-2 items-center">
              <span>Desconto</span>
              <input type="number" step="0.01" disabled={!editable} value={quote.discount} onChange={(e) => setQuote({ ...quote, discount: Number(e.target.value) })} onBlur={(e) => editable && patch({ discount: Number(e.target.value) })} className="w-24 text-right px-2 py-1 rounded bg-white/5 border border-white/10 tm-text text-sm disabled:opacity-60" />
            </div>
            <div className="flex justify-between text-base tm-text font-bold pt-3 border-t tm-border">
              <span>Total</span><span className="font-mono">R$ {quote.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="tm-bg-card border tm-border rounded-2xl p-5 text-xs tm-text-secondary space-y-1">
            <div>Criado por: <span className="tm-text">{quote.createdByName}</span></div>
            <div>Data: {new Date(quote.createdAt).toLocaleString('pt-BR')}</div>
            {quote.sentAt && <div>Enviado em: {new Date(quote.sentAt).toLocaleString('pt-BR')}</div>}
            {quote.sentToEmails && (() => { try { const emails = JSON.parse(quote.sentToEmails); return Array.isArray(emails) && emails.length > 0 ? <div className="flex items-center gap-1"><Mail size={12} className="text-blue-400" /> Enviado para: {emails.join(', ')}</div> : null; } catch { return null; } })()}
            {quote.approvedAt && <div className="text-green-400">Aprovado em: {new Date(quote.approvedAt).toLocaleString('pt-BR')}{quote.approvedByName ? ` por ${quote.approvedByName}` : ''}</div>}
            {quote.rejectedAt && <div className="text-red-400">Rejeitado em: {new Date(quote.rejectedAt).toLocaleString('pt-BR')}{quote.rejectedByName ? ` por ${quote.rejectedByName}` : ''}</div>}
            {quote.rejectionReason && <div className="text-red-300">Motivo: {quote.rejectionReason}</div>}
            {quote.actionJustification && quote.actionJustification !== quote.rejectionReason && <div className="tm-text-secondary">Justificativa: {quote.actionJustification}</div>}
          </div>
        </div>
      </div>

      {/* Modal "Marcar como enviado" */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSendModal(false)}>
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Marcar como Enviado</h3>
              <button onClick={() => setShowSendModal(false)} className="p-1.5 rounded hover:bg-white/10 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-400">Adicione os e-mails dos destinatários para enviar notificação do orçamento. Você pode enviar sem destinatários (sem email).</p>

              {/* Lista de emails */}
              {sendEmails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sendEmails.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs">
                      <Mail size={12} /> {email}
                      <button onClick={() => removeEmail(email)} className="ml-1 hover:text-red-300"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}

              {/* Input novo email */}
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                  placeholder="email@exemplo.com"
                  className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-500"
                />
                <button onClick={addEmail} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
                  <Plus size={16} />
                </button>
              </div>
              {emailError && <p className="text-xs text-red-400">{emailError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10">
              <button onClick={() => setShowSendModal(false)} className="px-4 py-2 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20">Cancelar</button>
              <button onClick={handleSend} disabled={sending} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sendEmails.length > 0 ? `Enviar para ${sendEmails.length} destinatário(s)` : 'Marcar como enviado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de ação com justificativa */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setActionModal(null)}>
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">{actionTitles[actionModal.action]}</h3>
              <button onClick={() => setActionModal(null)} className="p-1.5 rounded hover:bg-white/10 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <textarea
                value={actionJustification}
                onChange={(e) => setActionJustification(e.target.value)}
                placeholder={actionRequired ? 'Justificativa (obrigatória)...' : 'Justificativa (opcional)...'}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-500 resize-none"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20">Cancelar</button>
              <button
                onClick={handleActionConfirm}
                disabled={saving || (actionRequired && !actionJustification.trim())}
                className={`px-4 py-2 rounded-lg text-white text-sm disabled:opacity-40 ${actionBtnColor}`}
              >
                {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Preview do Orçamento #{formatQuoteNumber(quote.number, quote.ticket?.number)}</h3>
              <div className="flex items-center gap-2">
                <button onClick={handleDownloadPdf} disabled={downloadingPdf} className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                  {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
                </button>
                <button onClick={() => setShowPreview(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <iframe srcDoc={previewHtml} className="w-full h-full min-h-[70vh]" title="Preview do orçamento" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
