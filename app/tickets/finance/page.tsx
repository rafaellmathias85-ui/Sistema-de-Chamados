'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertCircle,
  Check,
  X,
  Download,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Loader2,
} from 'lucide-react';

interface FinanceTicket {
  id: string;
  number: number;
  subject: string;
  status: string;
  closedAt: string | null;
  createdAt: string;
  financialValue: number | null;
  financialNotes: string | null;
  faturado: boolean;
  dataFaturamento: string | null;
  notaFiscalPath: string | null;
  creator: { name: string; email: string };
  company: { name: string; clientType: string };
  assignee: { name: string } | null;
}

interface Company {
  id: string;
  name: string;
  clientType: string;
  ticketCount: number;
  totalValue: number;
}

interface Stats {
  totalValue: number;
  totalTickets: number;
  pendingValue: number;
  faturadoCount: number;
  faturadoValue: number;
}

export default function FinancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<FinanceTicket[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<Stats>({ totalValue: 0, totalTickets: 0, pendingValue: 0, faturadoCount: 0, faturadoValue: 0 });

  // Filtros
  const [companyFilter, setCompanyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateField, setDateField] = useState<'createdAt' | 'dataFaturamento'>('createdAt');
  const [hasValue, setHasValue] = useState<string>('');
  const [faturadoFilter, setFaturadoFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Modal de edição de valor
  const [editingTicket, setEditingTicket] = useState<FinanceTicket | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // NF upload
  const [uploadingNF, setUploadingNF] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      if (!['ADMIN', 'FINANCE'].includes(session?.user?.role || '')) {
        router.push('/tickets');
      } else {
        loadCompanies();
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'authenticated' && ['ADMIN', 'FINANCE'].includes(session?.user?.role || '')) {
      loadTickets();
    }
  }, [page, companyFilter, dateFrom, dateTo, dateField, hasValue, faturadoFilter, search, status]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '15' });
      if (companyFilter) params.append('companyId', companyFilter);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      if (dateField !== 'createdAt') params.append('dateField', dateField);
      if (hasValue) params.append('hasValue', hasValue);
      if (faturadoFilter) params.append('faturado', faturadoFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/finance?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        setTotalPages(data.totalPages || 1);
        setStats(data.stats || { totalValue: 0, totalTickets: 0, pendingValue: 0, faturadoCount: 0, faturadoValue: 0 });
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/finance/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data || []);
      }
    } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  // Fix: reset search when input is cleared
  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    if (value === '') {
      setSearch('');
      setPage(1);
    }
  };

  const setPeriod = (period: string) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let from = today;
    if (period === 'day') {
      from = today;
    } else if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString().slice(0, 10);
    } else if (period === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      from = d.toISOString().slice(0, 10);
    } else if (period === 'year') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      from = d.toISOString().slice(0, 10);
    } else {
      setDateFrom('');
      setDateTo('');
      setSearchInput('');
      setSearch('');
      setCompanyFilter('');
      setHasValue('');
      setFaturadoFilter('');
      setPage(1);
      return;
    }
    setDateFrom(from);
    setDateTo(today);
    setPage(1);
  };

  const openEditModal = (ticket: FinanceTicket) => {
    setEditingTicket(ticket);
    setEditValue(ticket.financialValue?.toString() || '');
    setEditNotes(ticket.financialNotes || '');
  };

  const saveValue = async () => {
    if (!editingTicket) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tickets/${editingTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          financialValue: editValue ? parseFloat(editValue) : null,
          financialNotes: editNotes,
        }),
      });
      if (res.ok) {
        setEditingTicket(null);
        loadTickets();
      }
    } catch (error) {
      console.error('Error saving value:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleFaturado = async (ticket: FinanceTicket) => {
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faturado: !ticket.faturado }),
      });
      if (res.ok) loadTickets();
    } catch (error) {
      console.error('Error toggling faturado:', error);
    }
  };

  // Faturar - send email to faturamento@wticorp.com.br
  const [faturando, setFaturando] = useState<string | null>(null);
  const [faturarSuccess, setFaturarSuccess] = useState('');
  const [viewingNotes, setViewingNotes] = useState<FinanceTicket | null>(null);

  const handleFaturar = async (ticket: FinanceTicket) => {
    if (!confirm(`Confirma o faturamento do chamado #${ticket.number} - ${ticket.company.name}?\n\nUm email será enviado para faturamento@wticorp.com.br`)) return;
    setFaturando(ticket.id);
    setFaturarSuccess('');
    try {
      const res = await fetch('/api/finance/faturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setFaturarSuccess(`Chamado #${ticket.number} faturado! Email enviado.`);
        loadTickets();
        setTimeout(() => setFaturarSuccess(''), 5000);
      } else {
        alert(data.error || 'Erro ao faturar');
      }
    } catch {
      alert('Erro ao faturar');
    } finally {
      setFaturando(null);
    }
  };

  const ALLOWED_NF_TYPES = ['application/pdf', 'text/xml', 'application/xml'];
  const ALLOWED_NF_EXTENSIONS = ['.pdf', '.xml'];
  const MAX_NF_SIZE = 5 * 1024 * 1024; // 5MB

  const validateNFFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_NF_EXTENSIONS.includes(ext)) {
      return 'Apenas arquivos PDF e XML são permitidos.';
    }
    if (!ALLOWED_NF_TYPES.includes(file.type) && !file.type.includes('xml')) {
      return 'Tipo de arquivo não permitido. Apenas PDF e XML.';
    }
    if (file.size > MAX_NF_SIZE) {
      return `Arquivo excede o limite de 5MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`;
    }
    return null;
  };

  const handleNFUpload = async (ticketId: string, file: File) => {
    const error = validateNFFile(file);
    if (error) { alert(error); return; }

    setUploadingNF(ticketId);
    try {
      const { uploadFile } = await import('@/lib/upload-helper');
      const { cloudStoragePath } = await uploadFile(file, false);

      // Save NF path on ticket
      const patchRes = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notaFiscalPath: cloudStoragePath }),
      });
      if (patchRes.ok) loadTickets();
    } catch (err) {
      console.error('Error uploading NF:', err);
      alert('Erro ao fazer upload da Nota Fiscal');
    } finally {
      setUploadingNF(null);
    }
  };

  const handleReplaceNF = async (ticketId: string, file: File) => {
    const error = validateNFFile(file);
    if (error) { alert(error); return; }

    setUploadingNF(ticketId);
    try {
      // Delete old NF
      await fetch(`/api/tickets/${ticketId}/nf`, { method: 'DELETE' });

      // Upload new
      const { uploadFile } = await import('@/lib/upload-helper');
      const { cloudStoragePath } = await uploadFile(file, false);

      const patchRes = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notaFiscalPath: cloudStoragePath }),
      });
      if (patchRes.ok) loadTickets();
    } catch (err) {
      console.error('Error replacing NF:', err);
      alert('Erro ao substituir Nota Fiscal');
    } finally {
      setUploadingNF(null);
    }
  };

  // NF preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTicket, setPreviewTicket] = useState<FinanceTicket | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleViewNF = async (ticket: FinanceTicket) => {
    if (!ticket.notaFiscalPath) return;
    setLoadingPreview(true);
    setPreviewTicket(ticket);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/nf`);
      if (res.ok) {
        const { url } = await res.json();
        setPreviewUrl(url);
      } else {
        alert('Erro ao obter URL do arquivo');
        setPreviewTicket(null);
      }
    } catch {
      alert('Erro ao visualizar nota fiscal');
      setPreviewTicket(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRemoveNF = async (ticket: FinanceTicket) => {
    if (!confirm('Deseja remover a nota fiscal anexada?')) return;
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/nf`, { method: 'DELETE' });
      if (res.ok) loadTickets();
      else alert('Erro ao remover nota fiscal');
    } catch {
      alert('Erro ao remover nota fiscal');
    }
  };

  const exportCSV = async () => {
    const params = new URLSearchParams();
    params.append('format', 'csv');
    if (companyFilter) params.append('companyId', companyFilter);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (dateField !== 'createdAt') params.append('dateField', dateField);
    if (hasValue) params.append('hasValue', hasValue);
    if (faturadoFilter) params.append('faturado', faturadoFilter);
    if (search) params.append('search', search);

    const a = document.createElement('a');
    a.href = `/api/finance/export?${params}`;
    a.click();
  };

  const exportPDF = async () => {
    const params = new URLSearchParams();
    params.append('format', 'json');
    if (companyFilter) params.append('companyId', companyFilter);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (dateField !== 'createdAt') params.append('dateField', dateField);
    if (hasValue) params.append('hasValue', hasValue);
    if (faturadoFilter) params.append('faturado', faturadoFilter);
    if (search) params.append('search', search);

    const res = await fetch(`/api/finance/export?${params}`);
    if (!res.ok) return;
    const data = await res.json();

    const totalVal = data.tickets.reduce((s: number, t: any) => s + (parseFloat(t.value.replace(',', '.')) || 0), 0);

    const html = `
      <html><head><title>Relatório Financeiro</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #1e293b; }
        h1 { text-align: center; color: #0A1628; }
        .info { text-align: center; color: #64748b; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #0A1628; color: white; padding: 8px 6px; text-align: left; }
        td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 20px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Relatório Financeiro - Winner Tecnologia</h1>
      <p class="info">Gerado em ${new Date().toLocaleDateString('pt-BR')} ${dateFrom ? `| Período: ${dateFrom} a ${dateTo || 'hoje'}` : ''}</p>
      <table>
        <thead><tr>
          <th>#</th><th>Empresa</th><th>Tipo</th><th>Assunto</th><th>Status</th><th>Criado em</th><th>Faturado em</th><th>Valor</th><th>Faturado</th>
        </tr></thead>
        <tbody>
          ${data.tickets.map((t: any) => `<tr><td>${t.number}</td><td>${t.company}</td><td>${t.clientType}</td><td>${t.subject}</td><td>${t.status}</td><td>${t.createdAt}</td><td>${t.dataFaturamento || '—'}</td><td>R$ ${t.value || '-'}</td><td>${t.faturado}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="total">Total: R$ ${totalVal.toFixed(2).replace('.', ',')}</p>
      </body></html>
    `;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const clientTypeLabels: Record<string, string> = {
    CONTRATO: 'Contrato', AVULSO: 'Avulso', PROJETO: 'Projeto', PARCEIRO: 'Parceiro',
  };

  if (status === 'loading' || (loading && tickets.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tm-text">Financeiro</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors">
            <FileSpreadsheet size={16} />
            Exportar XLS
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors">
            <Download size={16} />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg"><DollarSign className="w-6 h-6 text-green-400" /></div>
            <div>
              <p className="text-sm tm-text-secondary">Total Geral</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(stats.totalValue)}</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg"><FileText className="w-6 h-6 text-blue-400" /></div>
            <div>
              <p className="text-sm tm-text-secondary">Total de Chamados</p>
              <p className="text-xl font-bold text-blue-400">{stats.totalTickets}</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg"><AlertCircle className="w-6 h-6 text-yellow-400" /></div>
            <div>
              <p className="text-sm tm-text-secondary">Pendentes de Valor</p>
              <p className="text-xl font-bold text-yellow-400">{stats.pendingValue}</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg"><CheckCircle2 className="w-6 h-6 text-cyan-400" /></div>
            <div>
              <p className="text-sm tm-text-secondary">Faturados ({stats.faturadoCount})</p>
              <p className="text-xl font-bold text-cyan-400">{formatCurrency(stats.faturadoValue)}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="tm-bg-card border tm-border rounded-xl p-4 space-y-4">
        {/* Search + Period shortcuts */}
        <div className="flex flex-col md:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                placeholder="Buscar por nº ou assunto..."
                className="w-full tm-bg-card border tm-border rounded-lg py-2.5 pl-10 pr-4 tm-text placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </form>
          <div className="flex gap-2 flex-wrap">
            <span className="text-sm tm-text-secondary self-center">Período:</span>
            {[{l:'Dia',v:'day'},{l:'Semana',v:'week'},{l:'Mês',v:'month'},{l:'Ano',v:'year'},{l:'Todos',v:'all'}].map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v)} className="px-3 py-1.5 text-sm rounded-lg border tm-border tm-text hover:bg-white/10 hover:tm-text transition-colors">
                {p.l}
              </button>
            ))}
          </div>
        </div>
        {/* Row 2: Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs tm-text-muted mb-1">Empresa</label>
            <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text text-sm">
              <option value="">Todas</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs tm-text-muted mb-1">Filtrar por</label>
            <select value={dateField} onChange={(e) => { setDateField(e.target.value as 'createdAt' | 'dataFaturamento'); setPage(1); }} className="tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text text-sm">
              <option value="createdAt">Data de Criação</option>
              <option value="dataFaturamento">Data de Faturamento</option>
            </select>
          </div>
          <div>
            <label className="block text-xs tm-text-muted mb-1">Data Inicial</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text text-sm" />
          </div>
          <div>
            <label className="block text-xs tm-text-muted mb-1">Data Final</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text text-sm" />
          </div>
          <div>
            <label className="block text-xs tm-text-muted mb-1">Valor</label>
            <select value={hasValue} onChange={(e) => { setHasValue(e.target.value); setPage(1); }} className="tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text text-sm">
              <option value="">Todos</option>
              <option value="true">Com valor</option>
              <option value="false">Sem valor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs tm-text-muted mb-1">Faturado</label>
            <select value={faturadoFilter} onChange={(e) => { setFaturadoFilter(e.target.value); setPage(1); }} className="tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text text-sm">
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
        </div>
      </div>

      {/* Faturar Success */}
      {faturarSuccess && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> {faturarSuccess}
        </motion.div>
      )}

      {/* Table */}
      <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="tm-bg-card">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold tm-text-secondary uppercase hidden md:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">Assunto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold tm-text-secondary uppercase hidden lg:table-cell">Criado em</th>
                <th className="text-left px-4 py-3 text-xs font-semibold tm-text-secondary uppercase hidden lg:table-cell">Faturado em</th>
                <th className="text-right px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">Valor</th>
                <th className="text-center px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">Faturado</th>
                <th className="text-center px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">NF</th>
                <th className="text-center px-4 py-3 text-xs font-semibold tm-text-secondary uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t tm-border hover:tm-bg-card transition-colors">
                  <td className="px-4 py-3"><span className="text-blue-400 font-medium">#{ticket.number}</span></td>
                  <td className="px-4 py-3 tm-text text-sm">{ticket.company.name}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="px-2 py-1 bg-white/10 rounded text-xs tm-text">
                      {clientTypeLabels[ticket.company.clientType] || ticket.company.clientType}
                    </span>
                  </td>
                  <td className="px-4 py-3 tm-text text-sm max-w-xs truncate">{ticket.subject}</td>
                  <td className="px-4 py-3 tm-text-secondary text-sm hidden lg:table-cell">{formatDate(ticket.createdAt)}</td>
                  <td className="px-4 py-3 tm-text-secondary text-sm hidden lg:table-cell">{ticket.dataFaturamento ? formatDate(ticket.dataFaturamento) : <span className="tm-text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    {ticket.financialValue ? (
                      <span className="text-green-400 font-medium text-sm">{formatCurrency(ticket.financialValue)}</span>
                    ) : (
                      <span className="text-yellow-400 text-sm">Pendente</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleFaturado(ticket)} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      ticket.faturado ? 'bg-green-500/30 text-green-400 hover:bg-green-500/40' : 'bg-white/10 text-white-muted hover:bg-white/20'
                    }`} title={ticket.faturado ? 'Faturado' : 'Marcar como faturado'}>
                      {ticket.faturado ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {uploadingNF === ticket.id ? (
                      <span className="text-blue-400 text-xs animate-pulse">Enviando...</span>
                    ) : ticket.notaFiscalPath ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewNF(ticket)}
                          className="p-1 text-green-400 hover:text-green-300 transition-colors"
                          title="Visualizar NF"
                        >
                          <Eye size={15} />
                        </button>
                        <label className="cursor-pointer p-1 text-blue-400 hover:text-blue-300 transition-colors" title="Substituir NF">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.xml"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleReplaceNF(ticket.id, f);
                              e.target.value = '';
                            }}
                          />
                          <Upload size={15} />
                        </label>
                        <button
                          onClick={() => handleRemoveNF(ticket)}
                          className="p-1 tm-text-muted hover:text-red-400 transition-colors"
                          title="Remover NF"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.xml"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleNFUpload(ticket.id, f);
                            e.target.value = '';
                          }}
                        />
                        <span className="tm-text-muted hover:text-blue-400 transition-colors text-xs flex items-center justify-center gap-1">
                          <Upload size={14} /> Anexar
                        </span>
                      </label>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button onClick={() => openEditModal(ticket)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors">
                        {ticket.financialValue ? 'Editar' : 'Def. Valor'}
                      </button>
                      {ticket.financialNotes && (
                        <button onClick={() => setViewingNotes(ticket)} className="p-1 tm-text-secondary hover:text-blue-400 transition-colors" title="Ver observações">
                          <Eye size={14} />
                        </button>
                      )}
                      {!ticket.faturado && ticket.financialValue && (
                        <button
                          onClick={() => handleFaturar(ticket)}
                          disabled={faturando === ticket.id}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors disabled:opacity-50 flex items-center gap-1"
                          title="Faturar e enviar email"
                        >
                          {faturando === ticket.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          Faturar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tickets.length === 0 && !loading && (
          <div className="text-center py-8 tm-text-secondary">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum chamado encontrado</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t tm-border flex items-center justify-between">
            <p className="text-sm tm-text-secondary">Página {page} de {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 tm-text-secondary hover:tm-text disabled:opacity-50"><ChevronLeft size={20} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 tm-text-secondary hover:tm-text disabled:opacity-50"><ChevronRight size={20} /></button>
            </div>
          </div>
        )}
      </div>

      {/* View Notes Modal */}
      {viewingNotes && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="tm-bg-main rounded-xl p-6 w-full max-w-md border tm-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold tm-text">Observações - #{viewingNotes.number}</h2>
              <button onClick={() => setViewingNotes(null)} className="tm-text-secondary hover:tm-text"><X size={20} /></button>
            </div>
            <p className="text-sm tm-text-secondary mb-2">{viewingNotes.company.name} - {viewingNotes.subject}</p>
            {viewingNotes.financialValue && (
              <p className="text-green-400 font-medium mb-3">Valor: {formatCurrency(viewingNotes.financialValue)}</p>
            )}
            <div className="tm-bg-card border tm-border rounded-lg p-4">
              <p className="tm-text whitespace-pre-wrap text-sm">{viewingNotes.financialNotes || 'Sem observações'}</p>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setViewingNotes(null)} className="px-4 py-2 bg-white/10 hover:bg-white/20 tm-text rounded-lg transition-colors">
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* NF Preview Modal */}
      {previewTicket && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="tm-bg-main rounded-xl w-full max-w-4xl h-[85vh] flex flex-col border tm-border">
            <div className="flex items-center justify-between p-4 border-b tm-border">
              <h2 className="text-lg font-bold tm-text">
                Nota Fiscal - Chamado #{previewTicket.number}
              </h2>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <button
                    onClick={() => {
                      // Força download anexando ?disposition=attachment ao URL
                      // (rota local respeita esse override; URLs S3 ignoram e seguem padrão)
                      const sep = previewUrl.includes('?') ? '&' : '?';
                      const dlUrl = previewUrl.startsWith('/api/')
                        ? `${previewUrl}${sep}disposition=attachment`
                        : previewUrl;
                      const a = document.createElement('a');
                      a.href = dlUrl;
                      a.download = `nf_chamado_${previewTicket?.number || ''}.pdf`;
                      a.rel = 'noopener noreferrer';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                  >
                    <Download size={14} /> Baixar
                  </button>
                )}
                <button onClick={() => { setPreviewTicket(null); setPreviewUrl(null); }} className="tm-text-secondary hover:tm-text p-1">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {loadingPreview ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                </div>
              ) : previewUrl ? (
                previewTicket.notaFiscalPath?.endsWith('.xml') ? (
                  <iframe src={previewUrl} className="w-full h-full border-0" title="NF Preview" />
                ) : (
                  <iframe src={previewUrl} className="w-full h-full border-0" title="NF Preview" />
                )
              ) : (
                <div className="flex items-center justify-center h-full tm-text-muted">
                  Não foi possível carregar a visualização
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="tm-bg-main rounded-xl p-6 w-full max-w-md border tm-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tm-text">Definir Valor - #{editingTicket.number}</h2>
              <button onClick={() => setEditingTicket(null)} className="tm-text-secondary hover:tm-text"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <p className="tm-text-secondary text-sm">{editingTicket.company.name} - {editingTicket.subject}</p>
              <div>
                <label className="block text-sm font-medium tm-text mb-1">Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="0,00" className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium tm-text mb-1">Observações</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} placeholder="Notas sobre o faturamento..." className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingTicket(null)} className="px-4 py-2 tm-text-secondary hover:tm-text transition-colors">Cancelar</button>
              <button onClick={saveValue} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Salvar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
