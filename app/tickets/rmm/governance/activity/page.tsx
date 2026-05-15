'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Activity, ChevronLeft, RefreshCw, Search, Loader2,
  Monitor, Clock, Pause, Play,
} from 'lucide-react';
import MachineFilter from '@/components/rmm/machine-filter';

interface ActivitySession {
  id: string;
  machineId: string;
  windowTitle: string;
  processName: string;
  processPath: string | null;
  category: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  idleSeconds: number;
  username: string | null;
  isIdle: boolean;
  machine: { hostname: string; company: { id: string; name: string } };
}

export default function ActivityPage() {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterIdle, setFilterIdle] = useState<'all' | 'active' | 'idle'>('all');
  const [filterMachine, setFilterMachine] = useState('');

  const loadData = useCallback(async () => {
    if (!filterMachine) { setSessions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200', machineId: filterMachine });
      const res = await fetch(`/api/rmm/governance/activity?${params}`);
      if (res.ok) setSessions(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterMachine]);

  useEffect(() => { if (session?.user) loadData(); }, [session, loadData]);

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const filtered = sessions.filter(s => {
    const matchSearch = !search ||
      (s.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.machine?.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.machine?.company?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.processName || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.windowTitle || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterIdle === 'all' || (filterIdle === 'idle' ? s.isIdle : !s.isIdle);
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Activity className="text-green-400" size={28} />
            Atividade de Endpoints
          </h1>
          <p className="tm-text-secondary mt-1">Sessões de uso, aplicativos e produtividade</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> Atualizar
          </button>
          <Link href="/tickets/rmm/governance" className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
            <ChevronLeft size={14} /> Governance
          </Link>
        </div>
      </div>

      {/* Machine Filter (empresa + máquina) */}
      <MachineFilter value={filterMachine} onChange={setFilterMachine} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
          <input
            type="text"
            placeholder="Buscar por host, usuário, processo, título..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'idle'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterIdle(f)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                filterIdle === f ? 'bg-blue-600 border-blue-500 text-white' : 'tm-bg-card tm-border tm-text hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'active' ? '▶ Ativos' : '⏸ Ociosos'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 tm-text-secondary">
          <Activity className="mx-auto mb-3 opacity-30" size={48} />
          <p>{filterMachine ? 'Nenhuma sessão de atividade registrada' : 'Selecione uma máquina para ver a atividade'}</p>
          {filterMachine && <p className="text-xs mt-1">As sessões aparecerão quando o agente v2 iniciar o monitoramento</p>}
        </div>
      ) : (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b tm-border text-left">
                  <th className="px-4 py-3 tm-text-secondary font-medium">STATUS</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">USUÁRIO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">PROCESSO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">TÍTULO DA JANELA</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">CATEGORIA</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">EMPRESA</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">DURAÇÃO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">OCIOSO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">INÍCIO</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b tm-border hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {s.isIdle ? (
                        <span className="flex items-center gap-1.5 text-yellow-400 text-xs"><Pause size={12} /> Ocioso</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-green-400 text-xs"><Play size={12} /> Ativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tm-text">{s.machine?.hostname || '—'}</td>
                    <td className="px-4 py-3 tm-text text-xs">{s.username || '—'}</td>
                    <td className="px-4 py-3 tm-text text-xs font-mono">{s.processName || '—'}</td>
                    <td className="px-4 py-3 tm-text text-xs max-w-[250px] truncate" title={s.windowTitle || ''}>
                      {s.windowTitle || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        s.category === 'productive' ? 'bg-green-500/20 text-green-400' :
                        s.category === 'unproductive' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 tm-text-secondary'
                      }`}>
                        {s.category === 'productive' ? 'Produtivo' : s.category === 'unproductive' ? 'Improdutivo' : s.category || 'Neutro'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{s.machine?.company?.name || '—'}</td>
                    <td className="px-4 py-3 text-green-400 text-xs font-mono">{formatDuration(s.durationSeconds)}</td>
                    <td className="px-4 py-3 text-yellow-400 text-xs font-mono">{formatDuration(s.idleSeconds)}</td>
                    <td className="px-4 py-3 tm-text-muted text-xs">
                      {new Date(s.startedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
