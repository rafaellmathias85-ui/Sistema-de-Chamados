'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  HardDrive, ChevronLeft, RefreshCw, Search, Loader2,
  AlertTriangle, Check, Clock, Filter,
} from 'lucide-react';
import MachineFilter from '@/components/rmm/machine-filter';

interface DriverRecord {
  id: string;
  driverName: string;
  driverVersion: string;
  driverDate: string | null;
  driverClass: string | null;
  manufacturer: string | null;
  needsUpdate: boolean;
  collectedAt: string;
  machine: { hostname: string; company: { name: string } };
}

export default function DriversPage() {
  const { data: session } = useSession();
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUpdate, setFilterUpdate] = useState<'all' | 'needs_update' | 'ok'>('all');
  const [filterMachine, setFilterMachine] = useState('');

  const loadData = useCallback(async () => {
    if (!filterMachine) { setDrivers([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500', machineId: filterMachine });
      const res = await fetch(`/api/rmm/governance/drivers?${params}`);
      if (res.ok) setDrivers(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterMachine]);

  useEffect(() => { if (session?.user) loadData(); }, [session, loadData]);

  const filtered = drivers.filter(d => {
    const matchSearch = !search ||
      d.driverName.toLowerCase().includes(search.toLowerCase()) ||
      d.machine.hostname.toLowerCase().includes(search.toLowerCase()) ||
      (d.manufacturer || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.driverClass || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterUpdate === 'all' || (filterUpdate === 'needs_update' ? d.needsUpdate : !d.needsUpdate);
    return matchSearch && matchFilter;
  });

  const needsUpdateCount = drivers.filter(d => d.needsUpdate).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <HardDrive className="text-purple-400" size={28} />
            Inventário de Drivers
          </h1>
          <p className="tm-text-secondary mt-1">
            {drivers.length} drivers coletados
            {needsUpdateCount > 0 && <span className="text-yellow-400 ml-2">({needsUpdateCount} precisam atualização)</span>}
          </p>
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

      {/* Machine Filter */}
      <MachineFilter value={filterMachine} onChange={setFilterMachine} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
          <input type="text" placeholder="Buscar por driver, host, fabricante..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
        </div>
        <div className="flex gap-2">
          {(['all', 'needs_update', 'ok'] as const).map(f => (
            <button key={f} onClick={() => setFilterUpdate(f)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                filterUpdate === f ? 'bg-blue-600 border-blue-500 text-white' : 'tm-bg-card tm-border tm-text hover:bg-white/10'
              }`}>
              {f === 'all' ? 'Todos' : f === 'needs_update' ? '⚠ Atualizar' : '✓ OK'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 tm-text-secondary">
          <HardDrive className="mx-auto mb-3 opacity-30" size={48} />
          <p>Nenhum driver registrado</p>
        </div>
      ) : (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b tm-border text-left">
                  <th className="px-4 py-3 tm-text-secondary font-medium">STATUS</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">DRIVER</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">VERSÃO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">CLASSE</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">FABRICANTE</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">EMPRESA</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">COLETADO EM</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                    className="border-b tm-border hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      {d.needsUpdate ? (
                        <span className="text-yellow-400 flex items-center gap-1 text-xs"><AlertTriangle size={12} /> Atualizar</span>
                      ) : (
                        <span className="text-green-400 flex items-center gap-1 text-xs"><Check size={12} /> OK</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tm-text text-xs">{d.driverName}</td>
                    <td className="px-4 py-3 font-mono tm-text-secondary text-xs">{d.driverVersion}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{d.driverClass || '—'}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{d.manufacturer || '—'}</td>
                    <td className="px-4 py-3 font-mono tm-text text-xs">{d.machine.hostname}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{d.machine.company.name}</td>
                    <td className="px-4 py-3 tm-text-muted text-xs">{new Date(d.collectedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
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
