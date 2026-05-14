'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ClipboardList, ChevronLeft, RefreshCw, Loader2,
  Filter, Search,
} from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  performedById: string | null;
  oldValues: any;
  newValues: any;
  ipAddress: string | null;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  create: 'text-green-400',
  update: 'text-blue-400',
  delete: 'text-red-400',
  toggle: 'text-yellow-400',
  approve: 'text-emerald-400',
  reject: 'text-red-400',
  deploy: 'text-cyan-400',
};

export default function AuditPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (filterAction) params.append('action', filterAction);
      if (filterEntity) params.append('entityType', filterEntity);
      const res = await fetch(`/api/rmm/governance/audit-log?${params}`);
      if (res.ok) setLogs(await res.json());
    } finally { setLoading(false); }
  }, [filterAction, filterEntity]);

  useEffect(() => { if (session?.user) loadData(); }, [session, loadData]);

  const allActions = [...new Set(logs.map(l => l.action))];
  const allEntities = [...new Set(logs.map(l => l.entityType))];

  const filtered = logs.filter(l =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.entityType.toLowerCase().includes(search.toLowerCase()) ||
    (l.entityId || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <ClipboardList className="text-red-400" size={28} />
            Audit Log
          </h1>
          <p className="tm-text-secondary mt-1">Registro completo de ações de governance ({logs.length} entradas)</p>
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
          <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
        </div>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
          <option value="">Todas as ações</option>
          {allActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}
          className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
          <option value="">Todas as entidades</option>
          {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 tm-text-secondary">
          <ClipboardList className="mx-auto mb-3 opacity-30" size={48} />
          <p>Nenhum registro de auditoria</p>
        </div>
      ) : (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b tm-border text-left">
                  <th className="px-4 py-3 tm-text-secondary font-medium">DATA</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">AÇÃO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">ENTIDADE</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">ID</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">IP</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">DETALHES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                    className="border-b tm-border hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 tm-text-muted text-xs whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${actionColors[l.action] || 'tm-text'}`}>{l.action}</span>
                    </td>
                    <td className="px-4 py-3 tm-text text-xs">{l.entityType}</td>
                    <td className="px-4 py-3 font-mono tm-text-muted text-xs">{l.entityId ? l.entityId.substring(0, 8) + '...' : '—'}</td>
                    <td className="px-4 py-3 font-mono tm-text-muted text-xs">{l.ipAddress || '—'}</td>
                    <td className="px-4 py-3 tm-text-muted text-xs max-w-[250px] truncate">
                      {l.newValues ? JSON.stringify(l.newValues).substring(0, 60) : '—'}
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
