'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Monitor,
  Wifi,
  WifiOff,
  Server,
  Building2,
  Terminal,
  Download,
  RefreshCw,
  Search,
  ChevronRight,
  HardDrive,
  Cpu,
  Clock,
  Trash2,
  Activity,
  FileCode2,
  ShieldAlert,
  AlertTriangle,
  FileSpreadsheet,
  Shield,
  Network,
  Zap,
  Bot,
  Power,
  Loader2,
  ArrowUpCircle,
  Rocket,
  CheckCircle2,
} from 'lucide-react';

interface RmmMachine {
  id: string;
  hostname: string;
  username: string | null;
  os: string | null;
  ram: string | null;
  diskModel: string | null;
  diskSize: string | null;
  status: string;
  lastLogin: string | null;
  lastCheckin: string | null;
  ipAddress: string | null;
  teamviewerId: string | null;
  agentVersion: string | null;
  company: { id: string; name: string };
  _count: { tasks: number };
}

interface RmmStats {
  totalMachines: number;
  onlineMachines: number;
  offlineMachines: number;
  totalTasks: number;
  pendingTasks: number;
  companiesWithRmm: number;
}

export default function RmmDashboardPage() {
  const { data: session } = useSession();
  const [machines, setMachines] = useState<RmmMachine[]>([]);
  const [stats, setStats] = useState<RmmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const [updatingAgent, setUpdatingAgent] = useState<string | null>(null);
  const [migratingAgent, setMigratingAgent] = useState<string | null>(null);
  const [migratingBulk, setMigratingBulk] = useState(false);

  const isAdmin = ['ADMIN','SUPPORT'].includes(session?.user?.role || '');

  const isLegacyAgent = (m: RmmMachine) => {
    if (!m.agentVersion) return true;
    return !m.agentVersion.startsWith('3');
  };

  const getVersionBadge = (v: string | null) => {
    if (!v) return { label: 'N/A', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
    if (v.startsWith('3')) return { label: `V3`, color: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (v.startsWith('2')) return { label: `V2`, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    return { label: `V1`, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
  };

  const fetchData = async () => {
    try {
      const [machinesRes, statsRes, companiesRes] = await Promise.all([
        fetch(`/api/rmm/machines${filterCompany ? `?companyId=${filterCompany}` : ''}`),
        fetch('/api/rmm/stats'),
        fetch('/api/companies?limit=500'),
      ]);

      if (machinesRes.ok) setMachines(await machinesRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (companiesRes.ok) {
        const data = await companiesRes.json();
        setCompanies(Array.isArray(data) ? data : data.companies || []);
      }
    } catch (e) {
      console.error('Erro ao carregar dados RMM:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Auto-refresh 60s
    return () => clearInterval(interval);
  }, [filterCompany]);

  const handleDeleteMachine = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover esta máquina?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/rmm/machines/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMachines((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (e) {
      console.error('Erro ao excluir:', e);
    } finally {
      setDeleting(null);
    }
  };

  const handleReactivateAgent = async (machineId: string) => {
    if (reactivating) return;
    setReactivating(machineId);
    try {
      const res = await fetch(`/api/rmm/machines/${machineId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.recoveryScript) {
          const blob = new Blob([data.recoveryScript], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `reativar-rmm-${data.hostname || 'agente'}.ps1`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        alert('Ping enviado! Se o agente responder, ficara online em 1-2 min.\n\nSe NAO responder, execute o script de recuperacao baixado como Administrador na maquina.');
      } else {
        alert('Erro ao tentar reativar o agente.');
      }
    } catch (e) {
      console.error('Erro ao reativar:', e);
      alert('Erro ao tentar reativar o agente.');
    } finally {
      setReactivating(null);
    }
  };

  const handleMigrateV3 = async (machineId: string) => {
    if (!confirm('Deseja migrar esta máquina para o Agente V3?\n\nO processo inclui:\n• Download do agente V3\n• Reconfiguração do serviço NSSM\n• Rollback automático em caso de falha')) return;
    setMigratingAgent(machineId);
    try {
      const res = await fetch('/api/rmm/agent/migrate-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineIds: [machineId] }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Migração agendada para ${data.machines?.[0] || 'a máquina'}.\nSerá executada no próximo check-in.`);
      } else {
        alert(data.error || 'Erro ao agendar migração.');
      }
    } catch (e) {
      console.error('Erro:', e);
      alert('Erro ao agendar migração.');
    } finally {
      setMigratingAgent(null);
    }
  };

  const handleBulkMigrateV3 = async (mode: 'all' | 'company') => {
    const label = mode === 'all'
      ? 'TODAS as máquinas V1/V2 online'
      : `máquinas V1/V2 da empresa selecionada (${companies.find(c => c.id === filterCompany)?.name || filterCompany})`;
    if (!confirm(`Deseja migrar ${label} para o Agente V3?\n\nIsso agendará a migração para cada máquina elegível.`)) return;
    setMigratingBulk(true);
    try {
      const payload: any = mode === 'all'
        ? { allLegacy: true }
        : { companyId: filterCompany };
      const res = await fetch('/api/rmm/agent/migrate-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Migração agendada!\n\n• ${data.tasksCreated} tarefas criadas\n• ${data.skipped} já tinham migração pendente\n\nMáquinas: ${data.machines?.join(', ') || 'N/A'}`);
        fetchData();
      } else {
        alert(data.error || 'Erro ao agendar migração em massa.');
      }
    } catch (e) {
      console.error('Erro:', e);
      alert('Erro ao agendar migração em massa.');
    } finally {
      setMigratingBulk(false);
    }
  };

  const handleForceUpdate = async (machineId: string) => {
    if (updatingAgent) return;
    setUpdatingAgent(machineId);
    try {
      const res = await fetch('/api/rmm/agent/push-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineIds: [machineId] }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Atualização enviada para ${data.machines?.[0] || 'a máquina'}.\nO agente será atualizado no próximo check-in.`);
      } else {
        alert('Erro ao enviar atualização.');
      }
    } catch (e) {
      console.error('Erro:', e);
      alert('Erro ao enviar atualização.');
    } finally {
      setUpdatingAgent(null);
    }
  };

  const filtered = machines.filter((m) => {
    // Filtro de status (online/offline)
    if (filterStatus === 'online' && m.status !== 'Ligado') return false;
    if (filterStatus === 'offline' && m.status === 'Ligado') return false;

    const q = search.toLowerCase();
    return (
      m.hostname.toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q) ||
      (m.ipAddress || '').toLowerCase().includes(q) ||
      m.company.name.toLowerCase().includes(q)
    );
  });

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const timeAgo = (d: string | null) => {
    if (!d) return null;
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `há ${days} dia${days > 1 ? 's' : ''}`;
    if (hours > 0) return `há ${hours}h`;
    if (mins > 0) return `há ${mins}min`;
    return 'agora';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Monitor className="text-accent-blue" size={28} />
            RMM — Monitoramento Remoto
          </h1>
          <p className="tm-text-secondary mt-1">Gerencie máquinas e execute comandos remotamente</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm"
          >
            <RefreshCw size={16} /> Atualizar
          </button>
          {isAdmin && (
            <Link
              href="/tickets/rmm/export"
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
            >
              <FileSpreadsheet size={16} /> Exportar
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/tickets/rmm/agent"
              className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
            >
              <Download size={16} /> Gerar Agente
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/tickets/rmm/installers"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
            >
              <Download size={16} /> Pacotes MSI
            </Link>
          )}
        </div>
      </div>

      {/* Quick Nav */}
      <div className="flex flex-wrap gap-2">
        {[
          { href: '/tickets/rmm/governance', icon: Shield, label: 'Governance', color: 'text-emerald-400' },
          { href: '/tickets/rmm/security', icon: ShieldAlert, label: 'Segurança (SIEM)', color: 'text-red-400' },
          { href: '/tickets/rmm/playbooks', icon: Zap, label: 'Playbooks', color: 'text-yellow-400' },
          { href: '/tickets/rmm/ai-chat', icon: Bot, label: 'Assistente IA', color: 'text-purple-400' },
          { href: '/tickets/rmm/scripts', icon: FileCode2, label: 'Scripts Remotos', color: 'text-cyan-400' },
          { href: '/tickets/rmm/policies', icon: ShieldAlert, label: 'Políticas de Alerta', color: 'text-yellow-400' },
          { href: '/tickets/rmm/alerts', icon: AlertTriangle, label: 'Alertas', color: 'text-red-400' },
        ].map(nav => (
          <Link key={nav.href} href={nav.href} className="flex items-center gap-2 px-4 py-2.5 tm-bg-card border tm-border rounded-lg hover:bg-white/10 transition-colors text-sm">
            <nav.icon size={16} className={nav.color} />
            <span className="tm-text">{nav.label}</span>
          </Link>
        ))}
      </div>

      {/* Stats Cards — clicáveis para filtrar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Máquinas', value: stats.totalMachines, icon: Server, color: 'text-blue-400', border: 'border-blue-500', filterVal: 'all' as const },
            { label: 'Online', value: stats.onlineMachines, icon: Wifi, color: 'text-green-400', border: 'border-green-500', filterVal: 'online' as const },
            { label: 'Offline', value: stats.offlineMachines, icon: WifiOff, color: 'text-red-400', border: 'border-red-500', filterVal: 'offline' as const },
            { label: 'Empresas RMM', value: stats.companiesWithRmm, icon: Building2, color: 'text-purple-400', border: 'border-purple-500', filterVal: null },
          ].map((s, i) => {
            const isActive = s.filterVal !== null && filterStatus === s.filterVal;
            const isClickable = s.filterVal !== null;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  if (s.filterVal !== null) {
                    setFilterStatus(filterStatus === s.filterVal ? 'all' : s.filterVal);
                  }
                }}
                className={`tm-bg-card border rounded-xl p-4 transition-all ${
                  isClickable ? 'cursor-pointer hover:scale-[1.02]' : ''
                } ${isActive ? `${s.border} border-2 ring-1 ring-opacity-30 ${s.border.replace('border-', 'ring-')}` : 'tm-border'}`}
              >
                <div className="flex items-center gap-3">
                  <s.icon size={20} className={s.color} />
                  <div>
                    <p className="text-2xl font-bold tm-text">{s.value}</p>
                    <p className="text-xs tm-text-secondary">{s.label}</p>
                  </div>
                </div>
                {isActive && (
                  <p className="text-[10px] mt-2 text-center tm-text-muted">Filtro ativo — clique para limpar</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" />
          <input
            type="text"
            placeholder="Buscar por hostname, usuário, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 text-sm"
          />
        </div>
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="px-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm focus:outline-none focus:border-accent-blue/50"
        >
          <option value="">Todas as empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Migração em massa V3 — só aparece se houver máquinas legacy */}
      {isAdmin && machines.some(m => isLegacyAgent(m)) && (
        <div className="flex flex-wrap items-center gap-3 p-3 tm-bg-card border border-orange-500/30 rounded-xl">
          <div className="flex items-center gap-2 text-sm">
            <Rocket size={16} className="text-orange-400" />
            <span className="tm-text font-medium">Migração V3</span>
            <span className="tm-text-secondary text-xs">
              ({machines.filter(m => isLegacyAgent(m)).length} máquina(s) V1/V2)
            </span>
          </div>
          <div className="flex gap-2 ml-auto">
            {filterCompany && (
              <button
                onClick={() => handleBulkMigrateV3('company')}
                disabled={migratingBulk}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition flex items-center gap-2 text-xs font-medium disabled:opacity-50"
              >
                {migratingBulk ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                Migrar empresa selecionada
              </button>
            )}
            <button
              onClick={() => handleBulkMigrateV3('all')}
              disabled={migratingBulk}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition flex items-center gap-2 text-xs font-medium disabled:opacity-50"
            >
              {migratingBulk ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Migrar todas V1/V2
            </button>
          </div>
        </div>
      )}

      {/* Machine List */}
      <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Monitor size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="tm-text-secondary">Nenhuma máquina encontrada</p>
            <p className="tm-text-muted text-sm mt-1">Instale o agente RMM nas máquinas para monitorar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b tm-border">
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3">Hostname</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden md:table-cell">Usuário</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden lg:table-cell">S.O.</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden lg:table-cell">RAM</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden xl:table-cell">IP</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden lg:table-cell">TeamViewer</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3">Empresa</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden md:table-cell">Versão</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3 hidden md:table-cell">Último Check-in</th>
                  <th className="text-left text-xs font-medium tm-text-secondary uppercase px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, idx) => (
                  <motion.tr
                    key={m.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    className="border-b tm-border hover:tm-bg-card transition"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        m.status === 'Ligado'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {m.status === 'Ligado' ? <Wifi size={12} /> : <WifiOff size={12} />}
                        {m.status === 'Ligado' ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="tm-text font-medium text-sm">{m.hostname}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="tm-text text-sm">{m.username || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="tm-text-secondary text-xs">{m.os ? m.os.substring(0, 30) : '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="tm-text text-sm">{m.ram || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="tm-text-secondary text-xs font-mono">{m.ipAddress || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {m.teamviewerId ? (
                        <a
                          href={`teamviewer10://control?device=${m.teamviewerId}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition cursor-pointer"
                          title={`Conectar via TeamViewer (ID: ${m.teamviewerId})`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.597 24H1.406A1.41 1.41 0 0 1 0 22.594V1.406A1.41 1.41 0 0 1 1.406 0h21.191A1.41 1.41 0 0 1 24 1.406v21.188A1.41 1.41 0 0 1 22.597 24zM4.95 11.953l6.036-6.037.967.968-5.069 5.069 5.069 5.069-.967.967-6.036-6.036zm7.1 0l6.036-6.037.967.968-5.069 5.069 5.069 5.069-.967.967-6.036-6.036z"/></svg>
                          {m.teamviewerId}
                        </a>
                      ) : (
                        <span className="text-xs tm-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="tm-text text-sm">{m.company.name}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {(() => {
                        const badge = getVersionBadge(m.agentVersion);
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {m.status !== 'Ligado' && m.lastCheckin ? (
                        <div>
                          <span className="text-orange-400 text-xs font-medium block">{timeAgo(m.lastCheckin)}</span>
                          <span className="tm-text-muted text-[10px]">{formatDate(m.lastCheckin)}</span>
                        </div>
                      ) : (
                        <span className="tm-text-secondary text-xs">{formatDate(m.lastCheckin)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/tickets/rmm/machine/${m.id}`}
                          className="p-1.5 tm-text-secondary hover:text-accent-blue hover:tm-bg-card rounded-lg transition"
                          title="Console / Detalhes"
                        >
                          <Terminal size={16} />
                        </Link>
                        {m.status === 'Ligado' && isAdmin && isLegacyAgent(m) && (
                          <button
                            onClick={() => handleMigrateV3(m.id)}
                            disabled={migratingAgent === m.id}
                            className="p-1.5 text-orange-400 hover:text-orange-300 hover:tm-bg-card rounded-lg transition disabled:opacity-50"
                            title="Migrar para Agente V3"
                          >
                            {migratingAgent === m.id ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                          </button>
                        )}
                        {m.status === 'Ligado' && isAdmin && !isLegacyAgent(m) && (
                          <button
                            onClick={() => handleForceUpdate(m.id)}
                            disabled={updatingAgent === m.id}
                            className="p-1.5 tm-text-secondary hover:text-cyan-400 hover:tm-bg-card rounded-lg transition disabled:opacity-50"
                            title="Forçar atualização do agente"
                          >
                            {updatingAgent === m.id ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpCircle size={16} />}
                          </button>
                        )}
                        {m.status !== 'Ligado' && (
                          <button
                            onClick={() => handleReactivateAgent(m.id)}
                            disabled={reactivating === m.id}
                            className="p-1.5 tm-text-secondary hover:text-orange-400 hover:tm-bg-card rounded-lg transition disabled:opacity-50"
                            title="Reativar agente"
                          >
                            {reactivating === m.id ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteMachine(m.id)}
                            disabled={deleting === m.id}
                            className="p-1.5 tm-text-secondary hover:text-red-400 hover:tm-bg-card rounded-lg transition disabled:opacity-50"
                            title="Remover máquina"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
