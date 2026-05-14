'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Radio, ChevronLeft, RefreshCw, Search, Loader2,
  Check, X, Clock, Play, Plus, Monitor, Wifi, Shield,
} from 'lucide-react';

interface DiscoveredMachine {
  id: string;
  hostname: string;
  ipAddress: string;
  macAddress: string | null;
  osGuess: string | null;
  status: string;
  discoveredAt: string;
  scannerMachine: { hostname: string };
}

interface RelayConfigItem {
  id: string;
  machineId: string;
  isActive: boolean;
  scanInterval: number;
  autoApprove: boolean;
  machine: { hostname: string; company: { name: string } };
}

export default function RelayPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'discovered' | 'relays'>('discovered');
  const [discovered, setDiscovered] = useState<DiscoveredMachine[]>([]);
  const [relays, setRelays] = useState<RelayConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const loadDiscovered = useCallback(async () => {
    const res = await fetch('/api/rmm/relay/discovered');
    if (res.ok) setDiscovered(await res.json());
  }, []);
  const loadRelays = useCallback(async () => {
    const res = await fetch('/api/rmm/relay/config');
    if (res.ok) setRelays(await res.json());
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([loadDiscovered(), loadRelays()]).finally(() => setLoading(false));
  }, [session, loadDiscovered, loadRelays]);

  const handleApproveReject = async (id: string, status: 'approved' | 'rejected') => {
    setProcessing(id);
    try {
      await fetch('/api/rmm/relay/discovered', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      await loadDiscovered();
    } finally {
      setProcessing(null);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'text-yellow-400',
    approved: 'text-green-400',
    rejected: 'text-red-400',
    deployed: 'text-blue-400',
  };

  const filteredDiscovered = discovered.filter(d =>
    !search ||
    d.hostname.toLowerCase().includes(search.toLowerCase()) ||
    d.ipAddress.includes(search) ||
    d.scannerMachine.hostname.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Radio className="text-cyan-400" size={28} />
            Relay & Discovery
          </h1>
          <p className="tm-text-secondary mt-1">Máquinas descobertas na rede e configuração de relay</p>
        </div>
        <Link href="/tickets/rmm/governance" className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
          <ChevronLeft size={14} /> Governance
        </Link>
      </div>

      <div className="flex gap-2 border-b tm-border pb-2">
        {([['discovered', `Descobertas (${discovered.length})`, Wifi], ['relays', `Relays (${relays.length})`, Radio]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === key ? 'bg-blue-600 text-white' : 'tm-text-secondary hover:bg-white/10'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'discovered' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
            <input type="text" placeholder="Buscar por host, IP, relay..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
          </div>
          {filteredDiscovered.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Wifi className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhuma máquina descoberta</p>
              <p className="text-xs mt-1">Configure um relay para iniciar a varredura da rede</p>
            </div>
          ) : (
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b tm-border text-left">
                      <th className="px-4 py-3 tm-text-secondary font-medium">STATUS</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">IP</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">MAC</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">S.O.</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">RELAY</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DESCOBERTA</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiscovered.map((d, i) => (
                      <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="border-b tm-border hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3"><span className={`text-xs ${statusColors[d.status] || 'tm-text-muted'}`}>{d.status}</span></td>
                        <td className="px-4 py-3 font-mono text-xs tm-text">{d.hostname}</td>
                        <td className="px-4 py-3 font-mono text-xs tm-text-secondary">{d.ipAddress}</td>
                        <td className="px-4 py-3 font-mono text-xs tm-text-muted">{d.macAddress || '—'}</td>
                        <td className="px-4 py-3 tm-text-secondary text-xs">{d.osGuess || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs tm-text">{d.scannerMachine.hostname}</td>
                        <td className="px-4 py-3 tm-text-muted text-xs">{new Date(d.discoveredAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                        <td className="px-4 py-3">
                          {d.status === 'pending' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleApproveReject(d.id, 'approved')} disabled={processing === d.id}
                                className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30"><Check size={12} /></button>
                              <button onClick={() => handleApproveReject(d.id, 'rejected')} disabled={processing === d.id}
                                className="px-2 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30"><X size={12} /></button>
                            </div>
                          )}
                          {d.status === 'approved' && <span className="text-xs text-blue-400">Pronto p/ deploy</span>}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'relays' && (
        <>
          {relays.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Radio className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhum relay configurado</p>
              <p className="text-xs mt-1">Configure uma máquina como relay para escanear a rede local</p>
            </div>
          ) : (
            <div className="space-y-3">
              {relays.map(r => (
                <div key={r.id} className={`tm-bg-card border rounded-xl p-4 ${r.isActive ? 'border-cyan-500/30' : 'tm-border opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Monitor className="text-cyan-400" size={20} />
                      <div>
                        <h4 className="font-medium tm-text">{r.machine.hostname}</h4>
                        <p className="text-xs tm-text-secondary">{r.machine.company.name} | Scan: {r.scanInterval}min | {r.autoApprove ? 'Auto-approve' : 'Aprovação manual'}</p>
                      </div>
                    </div>
                    <span className={`text-xs ${r.isActive ? 'text-green-400' : 'tm-text-muted'}`}>{r.isActive ? '● Ativo' : '○ Inativo'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
