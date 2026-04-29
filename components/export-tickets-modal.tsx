'use client';

import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';

interface Company { id: string; name: string; }
interface SupportUser { id: string; name: string; }

interface ExportTicketsModalProps {
  onClose: () => void;
}

export default function ExportTicketsModal({ onClose }: ExportTicketsModalProps) {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [forwardedToFinance, setForwardedToFinance] = useState(false);
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'json'>('csv');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<SupportUser[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/companies?limit=500').then(r => r.json()).then(d => setCompanies(Array.isArray(d) ? d : d.companies || []));
    fetch('/api/users/support').then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : []));
  }, []);

  const handleExport = () => {
    setExporting(true);
    const params = new URLSearchParams();
    params.set('format', format);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (companyId) params.set('companyId', companyId);
    if (assigneeId) params.set('assigneeId', assigneeId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (forwardedToFinance) params.set('forwardedToFinance', 'true');

    const ext = format === 'xlsx' ? 'xlsx' : (format === 'json' ? 'json' : 'csv');
    const a = document.createElement('a');
    a.href = `/api/tickets/export?${params.toString()}`;
    a.download = `chamados.${ext}`;
    a.click();
    setTimeout(() => {
      setExporting(false);
      onClose();
    }, 1500);
  };

  const selectClass = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border overflow-hidden"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Exportar Chamados</h2>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Formato de exportação</label>
            <div className="flex gap-2">
              {(['csv', 'xlsx', 'json'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${format === f ? 'bg-cyan-600 border-cyan-500 text-white' : ''}`}
                  style={format !== f ? { background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' } : undefined}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <option value="">Todos</option>
                <option value="OPEN">Aberto</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="IN_PARTNER">Com Parceiro</option>
                <option value="PAUSED">Pausado</option>
                <option value="AWAITING_CLIENT">Aguard. Cliente</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Fechado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Prioridade</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={selectClass}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <option value="">Todas</option>
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Crítica</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Empresa</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={selectClass}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <option value="">Todas</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Responsável</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={selectClass}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <option value="">Todos</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Data Início</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={selectClass}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Data Fim</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={selectClass}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={forwardedToFinance} onChange={e => setForwardedToFinance(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500" />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Apenas encaminhados ao financeiro</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? 'Exportando...' : `Exportar ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
