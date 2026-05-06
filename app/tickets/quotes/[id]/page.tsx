'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

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
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado',
};

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

  const role = session?.user?.role;
  const isStaff = role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
  const isAdmin = role === 'ADMIN';
  const editable = isStaff && quote?.status === 'DRAFT';

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/quotes/${id}`);
      if (r.ok) setQuote(await r.json());
    } finally { setLoading(false); }
  };
  const loadCompanies = async () => {
    try {
      const r = await fetch('/api/companies');
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

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>;
  if (!quote) return <div className="text-center tm-text-muted py-16">Orçamento não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/tickets/quotes" className="p-2 tm-text-secondary hover:tm-text"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <div className="text-blue-400 font-semibold">#{quote.number}</div>
            <h1 className="text-xl font-bold tm-text">{quote.title}</h1>
          </div>
          <span className="px-3 py-1 rounded-full text-xs bg-white/10 tm-text">{STATUS_LABEL[quote.status]}</span>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && quote.status === 'DRAFT' && (
            <button disabled={saving} onClick={() => patch({ status: 'SENT' })} className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-sm"><Send size={14} /> Marcar como enviado</button>
          )}
          {isStaff && quote.status === 'SENT' && (
            <>
              <button disabled={saving} onClick={() => patch({ status: 'APPROVED' })} className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm"><CheckCircle2 size={14} /> Aprovar</button>
              <button disabled={saving} onClick={() => { const r = prompt('Motivo da rejeição (opcional):'); patch({ status: 'REJECTED', rejectionReason: r || null }); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm"><XCircle size={14} /> Rejeitar</button>
            </>
          )}
          {isAdmin && (
            <button onClick={handleDelete} className="px-3 py-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm flex items-center gap-1"><Trash2 size={14} /> Excluir</button>
          )}
        </div>
      </div>

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
            {quote.approvedAt && <div className="text-green-400">Aprovado em: {new Date(quote.approvedAt).toLocaleString('pt-BR')}</div>}
            {quote.rejectedAt && <div className="text-red-400">Rejeitado em: {new Date(quote.rejectedAt).toLocaleString('pt-BR')}</div>}
            {quote.rejectionReason && <div className="text-red-300">Motivo: {quote.rejectionReason}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
