'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  Ticket,
  ChevronLeft,
  ChevronRight,
  User,
  UserCheck,
  Bell,
  Download,
  Upload,
  Trash2,
  Loader2,
  Clock,
  PlayCircle,
  PauseCircle,
  Hourglass,
} from 'lucide-react';
import ResolveTicketModal from '@/components/resolve-ticket-modal';
import ExportTicketsModal from '@/components/export-tickets-modal';
import ImportTicketsModal from '@/components/import-tickets-modal';

interface TicketItem {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  creator: { name: string; email: string };
  assignee: { id: string; name: string } | null;
  company: { name: string };
  alertAssignee?: boolean;
}

interface SupportUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function TicketListPage() {
  const { data: session } = useSession() || {};
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [onlyMyTickets, setOnlyMyTickets] = useState(false);
  const [slaViolated, setSlaViolated] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [supportUsers, setSupportUsers] = useState<SupportUser[]>([]);

  // Resolve ticket modal
  const [resolveTicketId, setResolveTicketId] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  // Bulk delete
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Status counters
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  // Auto-refresh (1 min) + som em novo chamado ou interação cliente
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const prevTicketsRef = useRef<Map<string, string>>(new Map()); // id -> status
  const prevOpenUnassignedRef = useRef<number>(-1);

  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPPORT' || session?.user?.role === 'FINANCE';

  // Beep de alerta (Web Audio API)
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.value = 1320;
      gain2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.35);
      gain2.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.37);
      gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
      osc2.start(ctx.currentTime + 0.35);
      osc2.stop(ctx.currentTime + 0.65);
    } catch {}
  };

  // Carregar lista de usuários de suporte
  useEffect(() => {
    if (isStaff) {
      fetch('/api/users/support')
        .then(res => res.json())
        .then(data => setSupportUsers(data || []))
        .catch(err => console.error('Error loading support users:', err));
    }
  }, [isStaff]);

  // Fetch status counts
  const fetchStatusCounts = async () => {
    try {
      const res = await fetch('/api/tickets/counts');
      if (res.ok) setStatusCounts(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchTickets();
    fetchStatusCounts();
  }, [page, pageSize, statusFilter, priorityFilter, assigneeFilter, onlyMyTickets, slaViolated]);

  // Auto-refresh a cada 1 min (para manter lista sempre atualizada)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTickets(true);
      fetchStatusCounts();
    }, 60000); // 1 min
    return () => clearInterval(interval);
  }, [autoRefresh, page, pageSize, statusFilter, priorityFilter, assigneeFilter, onlyMyTickets, slaViolated]);

  const fetchTickets = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      });
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (search) params.append('search', search);
      if (assigneeFilter) params.append('assigneeId', assigneeFilter);
      if (onlyMyTickets && session?.user?.id) params.append('onlyMine', 'true');
      if (slaViolated) params.append('slaViolated', 'true');

      const res = await fetch(`/api/tickets?${params}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const newTickets: TicketItem[] = data.tickets || [];

        // Detectar novos chamados ou novas interações de cliente
        if (silent && prevTicketsRef.current.size > 0) {
          let newCount = 0;
          let newInteractions = 0;
          for (const t of newTickets) {
            if (!prevTicketsRef.current.has(t.id)) {
              newCount++;
            }
          }
          // Detectar aumento em chamados abertos sem responsável (indica cliente nova)
          const openUnassigned = newTickets.filter(t => t.status === 'OPEN' && !t.assignee).length;
          if (prevOpenUnassignedRef.current >= 0 && openUnassigned > prevOpenUnassignedRef.current) {
            newInteractions++;
          }
          prevOpenUnassignedRef.current = openUnassigned;
          if (newCount > 0 || newInteractions > 0) {
            playBeep();
          }
        } else {
          prevOpenUnassignedRef.current = newTickets.filter(t => t.status === 'OPEN' && !t.assignee).length;
        }

        // Atualizar mapa
        const nextMap = new Map<string, string>();
        newTickets.forEach(t => nextMap.set(t.id, t.status));
        prevTicketsRef.current = nextMap;

        setTickets(newTickets);
        setTotalPages(data.totalPages || 1);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTickets();
  };

  const handleStatusChange = async (ticketId: string, newStatus: string, currentStatus: string) => {
    // RESOLVED triggers the resolve modal (decision: finance or just close)
    if (newStatus === 'RESOLVED' && currentStatus !== 'RESOLVED' && currentStatus !== 'CLOSED') {
      setResolveTicketId(ticketId);
      return;
    }
    // CLOSED is blocked from dropdown — must go through resolve modal
    if (newStatus === 'CLOSED') return;

    setChangingStatus(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchTickets();
    } catch (error) {
      console.error('Error changing status:', error);
    } finally {
      setChangingStatus(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      OPEN: 'bg-yellow-500/20 text-yellow-400',
      IN_PROGRESS: 'bg-purple-500/20 text-purple-400',
      IN_PARTNER: 'bg-indigo-500/20 text-indigo-400',
      PAUSED: 'bg-orange-500/20 text-orange-400',
      AWAITING_CLIENT: 'bg-cyan-500/20 text-cyan-400',
      RESOLVED: 'bg-green-500/20 text-green-400',
      CLOSED: 'bg-gray-500/20 tm-text-secondary',
    };
    const labels: Record<string, string> = {
      OPEN: 'Aberto',
      IN_PROGRESS: 'Em Andamento',
      IN_PARTNER: 'Com Parceiro',
      PAUSED: 'Pausado',
      AWAITING_CLIENT: 'Aguardando Cliente',
      RESOLVED: 'Resolvido',
      CLOSED: 'Fechado',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      LOW: 'bg-gray-500/20 tm-text-secondary',
      MEDIUM: 'bg-blue-500/20 text-blue-400',
      HIGH: 'bg-orange-500/20 text-orange-400',
      CRITICAL: 'bg-red-500/20 text-red-400',
    };
    const labels: Record<string, string> = {
      LOW: 'Baixa',
      MEDIUM: 'Média',
      HIGH: 'Alta',
      CRITICAL: 'Crítica',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[priority]}`}>
        {labels[priority]}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text">
            Chamados
          </h1>
          <div className="flex items-center gap-3 mt-1 text-xs tm-text-muted">
            <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Atualiza a cada 1 minuto">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-cyan-500"
              />
              Auto 1min
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Som em novo chamado">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="accent-cyan-500"
              />
              🔊 Som
            </label>
            <span title={`Última atualização: ${lastRefresh.toLocaleString('pt-BR')}`}>
              {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isStaff && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                <Upload size={18} />
                Importar
              </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors"
              >
                <Download size={18} />
                Exportar
              </button>
            </>
          )}
          <Link
            href="/tickets/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-blue to-accent-orange text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={20} />
            Novo Chamado
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="tm-bg-card border tm-border rounded-xl p-4">
        <div className="flex flex-col gap-4">
          {/* Linha 1: Busca e filtros básicos */}
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nº, assunto, domínio ou email..."
                  className="w-full tm-bg-card border tm-border rounded-lg py-2.5 pl-10 pr-4 tm-text placeholder-gray-500 focus:outline-none focus:border-accent-blue/50"
                />
              </div>
            </form>
            <div className="flex gap-3 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="tm-bg-card border tm-border rounded-lg px-4 py-2.5 tm-text focus:outline-none focus:border-accent-blue/50"
              >
                <option value="">Todos os Status</option>
                <option value="OPEN">Aberto</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="IN_PARTNER">Com Parceiro</option>
                <option value="PAUSED">Pausado</option>
                <option value="AWAITING_CLIENT">Aguardando Cliente</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Fechado</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
                className="tm-bg-card border tm-border rounded-lg px-4 py-2.5 tm-text focus:outline-none focus:border-accent-blue/50"
              >
                <option value="">Todas Prioridades</option>
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Crítica</option>
              </select>
            </div>
          </div>

          {/* Linha 2: Filtros de responsável (apenas para ADMIN/SUPPORT) */}
          {isStaff && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center border-t tm-border pt-4">
              <div className="flex items-center gap-2">
                <User size={18} className="tm-text-secondary" />
                <span className="text-sm tm-text-secondary">Responsável:</span>
              </div>
              <select
                value={assigneeFilter}
                onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }}
                className="tm-bg-card border tm-border rounded-lg px-4 py-2 tm-text focus:outline-none focus:border-accent-blue/50 text-sm"
              >
                <option value="">Todos</option>
                <option value="unassigned">Não atribuído</option>
                {supportUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 ml-0 sm:ml-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyMyTickets}
                    onChange={(e) => { 
                      setOnlyMyTickets(e.target.checked); 
                      if (e.target.checked) setAssigneeFilter('');
                      setPage(1); 
                    }}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-blue focus:ring-accent-blue focus:ring-offset-0"
                  />
                  <span className="text-sm tm-text flex items-center gap-1">
                    <UserCheck size={16} className="text-accent-blue" />
                    Apenas meus chamados
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={slaViolated}
                    onChange={(e) => { setSlaViolated(e.target.checked); setPage(1); }}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500 focus:ring-offset-0"
                  />
                  <span className="text-sm tm-text flex items-center gap-1">
                    <Clock size={16} className="text-red-400" />
                    SLA Violado
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'OPEN', label: 'Abertos', icon: Clock, color: 'yellow', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
          { key: 'IN_PROGRESS', label: 'Em Andamento', icon: PlayCircle, color: 'purple', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
          { key: 'PAUSED', label: 'Pausados', icon: PauseCircle, color: 'gray', bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400' },
          { key: 'AWAITING_CLIENT', label: 'Aguard. Cliente', icon: Hourglass, color: 'cyan', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => { setStatusFilter(statusFilter === s.key ? '' : s.key); setPage(1); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${statusFilter === s.key ? `${s.bg} ${s.border} ring-1 ring-${s.color}-500/20` : 'tm-bg-card tm-border hover:bg-white/5'}`}
          >
            <s.icon size={20} className={s.text} />
            <div className="text-left">
              <p className={`text-lg font-bold ${s.text}`}>{statusCounts[s.key] ?? '-'}</p>
              <p className="text-[10px] tm-text-muted uppercase tracking-wider">{s.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {session?.user?.role === 'ADMIN' && selectedTickets.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
          <span className="text-sm text-red-400 font-medium">{selectedTickets.size} chamado(s) selecionado(s)</span>
          <button
            onClick={async () => {
              if (!confirm(`Confirma exclusão permanente de ${selectedTickets.size} chamado(s)? Esta ação é irreversível.`)) return;
              setBulkDeleting(true);
              try {
                const res = await fetch('/api/admin/bulk-delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'tickets', ids: Array.from(selectedTickets) }),
                });
                const data = await res.json();
                if (res.ok) {
                  setSelectedTickets(new Set());
                  fetchTickets();
                  fetchStatusCounts();
                  alert(`${data.deleted} chamado(s) excluído(s)${data.errors?.length ? '. Erros: ' + data.errors.join(', ') : ''}`);
                } else {
                  alert(data.error || 'Erro');
                }
              } catch { alert('Erro ao excluir'); }
              finally { setBulkDeleting(false); }
            }}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir Selecionados
          </button>
          <button onClick={() => setSelectedTickets(new Set())} className="text-xs tm-text-muted hover:tm-text transition-colors">Limpar seleção</button>
        </div>
      )}

      {/* Table */}
      <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tickets.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b tm-border tm-bg-card">
                    {session?.user?.role === 'ADMIN' && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedTickets.size === tickets.length && tickets.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTickets(new Set(tickets.map(t => t.id)));
                            else setSelectedTickets(new Set());
                          }}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase">Assunto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase hidden md:table-cell">Empresa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase hidden lg:table-cell">Solicitante</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase hidden lg:table-cell">Responsável</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase">Prioridade</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tm-text-secondary uppercase hidden lg:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {tickets.map((ticket) => {
                    const isOpen = ticket.status === 'OPEN' && !ticket.assignee;
                    const hasAlert = ticket.alertAssignee && ticket.assignee?.id === session?.user?.id;
                    return (
                    <tr
                      key={ticket.id}
                      className={`hover:bg-white/5 transition-colors cursor-pointer ${hasAlert ? 'bg-orange-500/5 border-l-2 border-l-orange-400' : isOpen ? 'bg-yellow-500/5 border-l-2 border-l-yellow-400' : ''}`}
                      onClick={() => window.location.href = `/tickets/${ticket.id}`}
                    >
                      {session?.user?.role === 'ADMIN' && (
                        <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTickets.has(ticket.id)}
                            onChange={() => {
                              const next = new Set(selectedTickets);
                              if (next.has(ticket.id)) next.delete(ticket.id); else next.add(ticket.id);
                              setSelectedTickets(next);
                            }}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-accent-blue font-medium">#{ticket.number}</span>
                          {ticket.alertAssignee && ticket.assignee?.id === session?.user?.id && (
                            <span className="relative flex h-5 w-5" title="Nova interação – ação necessária">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <Bell className="relative inline-flex h-5 w-5 text-orange-400" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="tm-text font-medium truncate max-w-xs">{ticket.subject}</p>
                        <p className="text-sm tm-text-secondary md:hidden">{ticket.company.name}</p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="tm-text">{ticket.company.name}</p>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="tm-text" title={ticket.creator?.email}>{ticket.creator?.name || '-'}</p>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="tm-text">{ticket.assignee?.name || '-'}</p>
                      </td>
                      <td className="px-4 py-4">{getPriorityBadge(ticket.priority)}</td>
                      <td className="px-4 py-4">
                        {/* Status read-only — alteração de status feita na tela de detalhes do chamado */}
                        {getStatusBadge(ticket.status)}
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="text-sm tm-text-secondary">{formatDate(ticket.createdAt)}</p>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t tm-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <p className="text-sm tm-text-secondary">
                  Página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2 text-sm tm-text-secondary">
                  <span>Itens por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="px-2 py-1 tm-input rounded text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 tm-text-secondary hover:tm-text disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 tm-text-secondary hover:tm-text disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center tm-text-secondary">
            <Ticket className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum chamado encontrado</p>
            <Link
              href="/tickets/new"
              className="inline-flex items-center gap-2 mt-4 text-accent-blue hover:underline"
            >
              <Plus size={16} />
              Criar primeiro chamado
            </Link>
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && <ExportTicketsModal onClose={() => setShowExportModal(false)} />}
      {showImportModal && (
        <ImportTicketsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { fetchTickets(); }}
        />
      )}

      {/* Resolve Ticket Modal */}
      {resolveTicketId && (() => {
        const t = tickets.find(tk => tk.id === resolveTicketId);
        return (
          <ResolveTicketModal
            ticketId={resolveTicketId}
            ticketNumber={t?.number}
            ticketSubject={t?.subject}
            onClose={() => setResolveTicketId(null)}
            onSuccess={() => { setResolveTicketId(null); fetchTickets(); }}
          />
        );
      })()}
    </div>
  );
}