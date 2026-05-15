'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  HardDrive, ChevronLeft, RefreshCw, Search, Loader2,
  AlertTriangle, Check, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import MachineFilter from '@/components/rmm/machine-filter';

interface DriverRecord {
  id: string;
  driverName: string;
  driverVersion: string | null;
  infName: string;
  driverDate: string | null;
  deviceName: string | null;
  deviceClass: string | null;
  provider: string | null;
  isSigned: boolean | null;
  signer: string | null;
  status: string;
  scannedAt: string;
  machine: { hostname: string; company: { id: string; name: string } };
}

export default function DriversPage() {
  const { data: session } = useSession();
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'warning' | 'ok'>('all');
  const [filterMachine, setFilterMachine] = useState('');

  const loadData = useCallback(async () => {
    if (!filterMachine) { setDrivers([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ machineId: filterMachine });
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
      (d.machine?.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.provider || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.deviceName || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.deviceClass || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterStatus === 'all' ||
      (filterStatus === 'warning' ? d.status !== 'ok' : d.status === 'ok');
    return matchSearch && matchFilter;
  });

  const warningCount = drivers.filter(d => d.status !== 'ok').length;
  const unsignedCount = drivers.filter(d => d.isSigned === false).length;

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
            {warningCount > 0 && <span className="text-yellow-400 ml-2">({warningCount} com problemas)</span>}
            {unsignedCount > 0 && <span className="text-red-400 ml-2">({unsignedCount} não assinados)</span>}
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

      {/* Machine Filter (empresa + máquina) */}
      <MachineFilter value={filterMachine} onChange={setFilterMachine} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
          <input type="text" placeholder="Buscar por driver, dispositivo, fabricante..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
        </div>
        <div className="flex gap-2">
          {(['all', 'warning', 'ok'] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                filterStatus === f ? 'bg-blue-600 border-blue-500 text-white' : 'tm-bg-card tm-border tm-text hover:bg-white/10'
              }`}>
              {f === 'all' ? 'Todos' : f === 'warning' ? '⚠ Problemas' : '✓ OK'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 tm-text-secondary">
          <HardDrive className="mx-auto mb-3 opacity-30" size={48} />
          <p>{filterMachine ? 'Nenhum driver registrado' : 'Selecione uma máquina para ver os drivers'}</p>
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
                  <th className="px-4 py-3 tm-text-secondary font-medium">DISPOSITIVO</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">CLASSE</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">FORNECEDOR</th>
                  <th className="px-4 py-3 tm-text-secondary font-medium">ASSINADO</th>
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
                      {d.status !== 'ok' ? (
                        <span className="text-yellow-400 flex items-center gap-1 text-xs"><AlertTriangle size={12} /> {d.status}</span>
                      ) : (
                        <span className="text-green-400 flex items-center gap-1 text-xs"><Check size={12} /> OK</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tm-text text-xs">{d.driverName}</td>
                    <td className="px-4 py-3 font-mono tm-text-secondary text-xs">{d.driverVersion || '—'}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs max-w-[200px] truncate" title={d.deviceName || ''}>{d.deviceName || '—'}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{d.deviceClass || '—'}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{d.provider || '—'}</td>
                    <td className="px-4 py-3">
                      {d.isSigned === true ? (
                        <span className="text-green-400 flex items-center gap-1 text-xs"><ShieldCheck size={12} /> Sim</span>
                      ) : d.isSigned === false ? (
                        <span className="text-red-400 flex items-center gap-1 text-xs"><ShieldAlert size={12} /> Não</span>
                      ) : (
                        <span className="tm-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tm-text text-xs">{d.machine?.hostname || '—'}</td>
                    <td className="px-4 py-3 tm-text-secondary text-xs">{d.machine?.company?.name || '—'}</td>
                    <td className="px-4 py-3 tm-text-muted text-xs">{new Date(d.scannedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
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
