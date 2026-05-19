'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  HardDrive, ChevronLeft, RefreshCw, Search, Loader2,
  AlertTriangle, CheckCircle, XCircle, Thermometer,
  Activity, Clock, Shield, Database, Filter, Eye,
  ChevronDown, ChevronUp, Bell, X,
} from 'lucide-react';
import MachineFilter from '@/components/rmm/machine-filter';

interface DiskMetric {
  id: string;
  temperature: number | null;
  powerOnHours: number | null;
  powerCycleCount: number | null;
  reallocatedSectors: number | null;
  pendingSectors: number | null;
  uncorrectableErrors: number | null;
  wearLeveling: number | null;
  readErrorRate: number | null;
  writeErrorRate: number | null;
  throughputMbps: number | null;
  healthScore: number | null;
  collectedAt: string;
}

interface DiskAlert {
  id: string;
  severity: string;
  alertType: string;
  title: string;
  description: string | null;
  metricValue: string | null;
  thresholdValue: string | null;
  status: string;
  createdAt: string;
}

interface DiskRecord {
  id: string;
  diskNumber: number;
  model: string | null;
  serialNumber: string | null;
  firmwareRev: string | null;
  mediaType: string;
  busType: string | null;
  sizeBytes: string | null;
  partitionCount: number | null;
  partitionsJson: string | null;
  smartStatus: string;
  smartEnabled: boolean | null;
  lastScanAt: string;
  machine: { hostname: string; company: { name: string } };
  healthMetrics: DiskMetric[];
  healthAlerts: DiskAlert[];
}

interface AlertRecord {
  id: string;
  severity: string;
  alertType: string;
  title: string;
  description: string | null;
  metricName: string | null;
  metricValue: string | null;
  thresholdValue: string | null;
  status: string;
  createdAt: string;
  machine: { hostname: string; company: { name: string } };
  diskInventory: { model: string | null; diskNumber: number; mediaType: string; serialNumber: string | null };
}

function formatBytes(bytes: string | null): string {
  if (!bytes) return '—';
  const b = parseFloat(bytes);
  if (isNaN(b)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = b;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatHours(hours: number | null): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ${hours % 24}h`;
  const years = (days / 365).toFixed(1);
  return `${years} anos`;
}

function getSmartBadge(status: string) {
  switch (status) {
    case 'Healthy': return { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle, label: 'Saudável' };
    case 'Warning': return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: AlertTriangle, label: 'Atenção' };
    case 'Critical': return { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle, label: 'Crítico' };
    case 'Failed': return { color: 'bg-red-600/30 text-red-300 border-red-600/40', icon: XCircle, label: 'Falha' };
    default: return { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: HardDrive, label: 'Desconhecido' };
  }
}

function getHealthScoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
}

export default function DiskHealthPage() {
  const { data: session } = useSession();
  const [disks, setDisks] = useState<DiskRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMedia, setFilterMedia] = useState<string>('all');
  const [expandedDisk, setExpandedDisk] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'alerts'>('inventory');
  const [resolving, setResolving] = useState<string | null>(null);
  const [filterMachine, setFilterMachine] = useState('');

  const loadData = useCallback(async () => {
    if (!filterMachine) { setDisks([]); setAlerts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const diskParams = new URLSearchParams({ limit: '500', machineId: filterMachine });
      const alertParams = new URLSearchParams({ limit: '200', machineId: filterMachine });
      const [diskRes, alertRes] = await Promise.all([
        fetch(`/api/rmm/governance/disk-health?${diskParams}`),
        fetch(`/api/rmm/governance/disk-health/alerts?${alertParams}`),
      ]);
      if (diskRes.ok) {
        const data = await diskRes.json();
        setDisks(data.disks || []);
      }
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterMachine]);

  useEffect(() => { if (session?.user) loadData(); }, [session, loadData]);

  const handleAlertAction = async (alertId: string, action: 'acknowledge' | 'resolve') => {
    setResolving(alertId);
    try {
      const res = await fetch('/api/rmm/governance/disk-health/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResolving(null);
    }
  };

  const filtered = disks.filter(d => {
    const matchSearch = !search ||
      (d.model || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.machine?.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.serialNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      d.mediaType.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || d.smartStatus === filterStatus;
    const matchMedia = filterMedia === 'all' || d.mediaType === filterMedia;
    return matchSearch && matchStatus && matchMedia;
  });

  const statusCounts = {
    total: disks.length,
    healthy: disks.filter(d => d.smartStatus === 'Healthy').length,
    warning: disks.filter(d => d.smartStatus === 'Warning').length,
    critical: disks.filter(d => ['Critical', 'Failed'].includes(d.smartStatus)).length,
    unknown: disks.filter(d => d.smartStatus === 'Unknown').length,
  };
  const activeAlerts = alerts.filter(a => a.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Database className="text-cyan-400" size={28} />
            Saúde dos Discos
          </h1>
          <p className="tm-text-secondary mt-1">
            {statusCounts.total} discos monitorados
            {activeAlerts > 0 && <span className="text-red-400 ml-2">({activeAlerts} alertas ativos)</span>}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <Database className="mx-auto text-cyan-400 mb-1" size={20} />
          <p className="text-2xl font-bold tm-text">{statusCounts.total}</p>
          <p className="text-xs tm-text-muted">Total</p>
        </div>
        <div className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <CheckCircle className="mx-auto text-green-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-green-400">{statusCounts.healthy}</p>
          <p className="text-xs tm-text-muted">Saudáveis</p>
        </div>
        <div className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <AlertTriangle className="mx-auto text-yellow-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-yellow-400">{statusCounts.warning}</p>
          <p className="text-xs tm-text-muted">Atenção</p>
        </div>
        <div className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <XCircle className="mx-auto text-red-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-red-400">{statusCounts.critical}</p>
          <p className="text-xs tm-text-muted">Críticos</p>
        </div>
        <div className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <Bell className="mx-auto text-orange-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-orange-400">{activeAlerts}</p>
          <p className="text-xs tm-text-muted">Alertas Ativos</p>
        </div>
      </div>

      {/* Machine Filter */}
      <MachineFilter value={filterMachine} onChange={setFilterMachine} />

      {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-400" size={28} /></div>}

      {/* Tabs */}
      <div className="flex gap-1 tm-bg-card border tm-border rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'inventory' ? 'bg-cyan-600 text-white' : 'tm-text hover:bg-white/10'}`}>
          <HardDrive size={14} className="inline mr-1.5" /> Inventário ({statusCounts.total})
        </button>
        <button onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'alerts' ? 'bg-cyan-600 text-white' : 'tm-text hover:bg-white/10'}`}>
          <Bell size={14} className="inline mr-1.5" /> Alertas ({activeAlerts})
        </button>
      </div>

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
              <input type="text" placeholder="Buscar por modelo, serial, hostname..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'Healthy', 'Warning', 'Critical', 'Unknown'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    filterStatus === s ? 'bg-cyan-600 border-cyan-500 text-white' : 'tm-bg-card tm-border tm-text hover:bg-white/10'
                  }`}>
                  {s === 'all' ? 'Todos' : s === 'Healthy' ? '✓ Saudável' : s === 'Warning' ? '⚠ Atenção' : s === 'Critical' ? '✕ Crítico' : '? Desc.'}
                </button>
              ))}
              <select value={filterMedia} onChange={e => setFilterMedia(e.target.value)}
                className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
                <option value="all">Todos os tipos</option>
                <option value="SSD">SSD</option>
                <option value="HDD">HDD</option>
                <option value="NVMe">NVMe</option>
                <option value="Unknown">Desconhecido</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Database className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhum disco registrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((d, i) => {
                const badge = getSmartBadge(d.smartStatus);
                const BadgeIcon = badge.icon;
                const latestMetric = d.healthMetrics?.[0] || null;
                const isExpanded = expandedDisk === d.id;
                return (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="tm-bg-card border tm-border rounded-xl overflow-hidden">
                    {/* Row */}
                    <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-white/5 transition" onClick={() => setExpandedDisk(isExpanded ? null : d.id)}>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${badge.color}`}>
                        <BadgeIcon size={12} />
                        {badge.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="tm-text text-sm font-medium truncate">{d.model || `Disco #${d.diskNumber}`}</p>
                        <p className="tm-text-muted text-xs">{d.mediaType} {d.busType ? `• ${d.busType}` : ''} • {formatBytes(d.sizeBytes)}</p>
                      </div>
                      <div className="hidden md:block text-center">
                        <p className="tm-text text-xs font-mono">{d.machine.hostname}</p>
                        <p className="tm-text-muted text-xs">{d.machine.company.name}</p>
                      </div>
                      {latestMetric && (
                        <div className="hidden lg:flex items-center gap-4">
                          {latestMetric.temperature !== null && (
                            <div className="text-center">
                              <p className={`text-sm font-mono ${latestMetric.temperature > 55 ? 'text-red-400' : latestMetric.temperature > 45 ? 'text-yellow-400' : 'text-green-400'}`}>
                                {latestMetric.temperature}°C
                              </p>
                              <p className="text-xs tm-text-muted">Temp</p>
                            </div>
                          )}
                          {latestMetric.healthScore !== null && (
                            <div className="text-center">
                              <p className={`text-sm font-bold ${getHealthScoreColor(latestMetric.healthScore)}`}>
                                {latestMetric.healthScore}%
                              </p>
                              <p className="text-xs tm-text-muted">Score</p>
                            </div>
                          )}
                          {latestMetric.wearLeveling !== null && (
                            <div className="text-center">
                              <p className={`text-sm font-mono ${latestMetric.wearLeveling > 80 ? 'text-red-400' : latestMetric.wearLeveling > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                                {latestMetric.wearLeveling}%
                              </p>
                              <p className="text-xs tm-text-muted">Desgaste</p>
                            </div>
                          )}
                        </div>
                      )}
                      {d.healthAlerts.length > 0 && (
                        <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">
                          {d.healthAlerts.length} alerta{d.healthAlerts.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp size={16} className="tm-text-muted" /> : <ChevronDown size={16} className="tm-text-muted" />}
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="border-t tm-border overflow-hidden">
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Info Card */}
                            <div className="space-y-2">
                              <h4 className="tm-text font-semibold text-sm flex items-center gap-1.5"><HardDrive size={14} /> Informações</h4>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between"><span className="tm-text-muted">Modelo:</span><span className="tm-text font-mono">{d.model || '—'}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">Serial:</span><span className="tm-text font-mono">{d.serialNumber || '—'}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">Firmware:</span><span className="tm-text font-mono">{d.firmwareRev || '—'}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">Tipo:</span><span className="tm-text">{d.mediaType}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">Barramento:</span><span className="tm-text">{d.busType || '—'}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">Tamanho:</span><span className="tm-text">{formatBytes(d.sizeBytes)}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">Partições:</span><span className="tm-text">{d.partitionCount ?? '—'}</span></div>
                                <div className="flex justify-between"><span className="tm-text-muted">SMART:</span><span className="tm-text">{d.smartEnabled ? 'Ativo' : d.smartEnabled === false ? 'Desativado' : '—'}</span></div>
                              </div>
                            </div>

                            {/* Metrics Card */}
                            {latestMetric && (
                              <div className="space-y-2">
                                <h4 className="tm-text font-semibold text-sm flex items-center gap-1.5"><Activity size={14} /> Métricas SMART</h4>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between"><span className="tm-text-muted">Temperatura:</span>
                                    <span className={latestMetric.temperature !== null && latestMetric.temperature > 55 ? 'text-red-400' : 'tm-text'}>
                                      {latestMetric.temperature !== null ? `${latestMetric.temperature}°C` : '—'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Tempo ligado:</span><span className="tm-text">{formatHours(latestMetric.powerOnHours)}</span></div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Ciclos on/off:</span><span className="tm-text">{latestMetric.powerCycleCount ?? '—'}</span></div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Setores realocados:</span>
                                    <span className={latestMetric.reallocatedSectors && latestMetric.reallocatedSectors > 0 ? 'text-yellow-400' : 'tm-text'}>
                                      {latestMetric.reallocatedSectors ?? '—'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Setores pendentes:</span>
                                    <span className={latestMetric.pendingSectors && latestMetric.pendingSectors > 0 ? 'text-yellow-400' : 'tm-text'}>
                                      {latestMetric.pendingSectors ?? '—'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Erros incorrigíveis:</span>
                                    <span className={latestMetric.uncorrectableErrors && latestMetric.uncorrectableErrors > 0 ? 'text-red-400' : 'tm-text'}>
                                      {latestMetric.uncorrectableErrors ?? '—'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Desgaste (SSD):</span>
                                    <span className={latestMetric.wearLeveling !== null && latestMetric.wearLeveling > 80 ? 'text-red-400' : 'tm-text'}>
                                      {latestMetric.wearLeveling !== null ? `${latestMetric.wearLeveling}%` : '—'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Throughput:</span><span className="tm-text">{latestMetric.throughputMbps ? `${latestMetric.throughputMbps.toFixed(1)} MB/s` : '—'}</span></div>
                                  <div className="flex justify-between"><span className="tm-text-muted">Health Score:</span>
                                    <span className={`font-bold ${getHealthScoreColor(latestMetric.healthScore)}`}>
                                      {latestMetric.healthScore !== null ? `${latestMetric.healthScore}/100` : '—'}
                                    </span>
                                  </div>
                                </div>
                                <p className="tm-text-muted text-xs mt-2">
                                  <Clock size={10} className="inline mr-1" />
                                  Coletado: {new Date(latestMetric.collectedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                </p>
                              </div>
                            )}

                            {/* Alerts for this disk */}
                            {d.healthAlerts.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="tm-text font-semibold text-sm flex items-center gap-1.5"><Bell size={14} /> Alertas Ativos</h4>
                                <div className="space-y-1.5">
                                  {d.healthAlerts.map(a => (
                                    <div key={a.id} className={`px-2.5 py-1.5 rounded-lg border text-xs ${getSeverityBadge(a.severity)}`}>
                                      <p className="font-medium">{a.title}</p>
                                      {a.description && <p className="opacity-80 mt-0.5">{a.description}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Partitions */}
                            {d.partitionsJson && (() => {
                              try {
                                const parts = JSON.parse(d.partitionsJson);
                                if (Array.isArray(parts) && parts.length > 0) {
                                  return (
                                    <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                      <h4 className="tm-text font-semibold text-sm flex items-center gap-1.5"><Database size={14} /> Partições</h4>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        {parts.map((p: { letter?: string; label?: string; sizeBytes?: number; freeBytes?: number; fileSystem?: string }, idx: number) => {
                                          const usedPct = p.sizeBytes && p.freeBytes ? Math.round(((p.sizeBytes - p.freeBytes) / p.sizeBytes) * 100) : null;
                                          return (
                                            <div key={idx} className="tm-bg-main border tm-border rounded-lg p-2 text-xs">
                                              <p className="tm-text font-mono font-bold">{p.letter || `P${idx}`}</p>
                                              <p className="tm-text-muted">{p.fileSystem || '—'}</p>
                                              {p.sizeBytes && <p className="tm-text">{formatBytes(p.sizeBytes.toString())}</p>}
                                              {usedPct !== null && (
                                                <div className="mt-1">
                                                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                                                    <div className={`h-1.5 rounded-full ${usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                                      style={{ width: `${usedPct}%` }} />
                                                  </div>
                                                  <p className="tm-text-muted mt-0.5">{usedPct}% usado</p>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }
                              } catch { /* ignore parse errors */ }
                              return null;
                            })()}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <>
          {alerts.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Bell className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhum alerta de disco registrado</p>
            </div>
          ) : (
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b tm-border text-left">
                      <th className="px-4 py-3 tm-text-secondary font-medium">SEVERIDADE</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">TIPO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">TÍTULO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DISCO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">VALOR</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">STATUS</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DATA</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a, i) => (
                      <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                        className="border-b tm-border hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${getSeverityBadge(a.severity)}`}>
                            {a.severity === 'critical' ? '🔴 Crítico' : a.severity === 'warning' ? '🟡 Atenção' : '🔵 Info'}
                          </span>
                        </td>
                        <td className="px-4 py-3 tm-text-secondary text-xs font-mono">{a.alertType}</td>
                        <td className="px-4 py-3 tm-text text-xs max-w-48 truncate">{a.title}</td>
                        <td className="px-4 py-3 tm-text-secondary text-xs">
                          {a.diskInventory?.model || `Disco #${a.diskInventory?.diskNumber}`}
                          <br /><span className="tm-text-muted">{a.diskInventory?.mediaType}</span>
                        </td>
                        <td className="px-4 py-3 font-mono tm-text text-xs">{a.machine?.hostname || '—'}</td>
                        <td className="px-4 py-3 tm-text text-xs">
                          {a.metricValue ? `${a.metricValue}` : '—'}
                          {a.thresholdValue && <span className="tm-text-muted"> / {a.thresholdValue}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            a.status === 'active' ? 'bg-red-500/20 text-red-400' :
                            a.status === 'acknowledged' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {a.status === 'active' ? 'Ativo' : a.status === 'acknowledged' ? 'Reconhecido' : 'Resolvido'}
                          </span>
                        </td>
                        <td className="px-4 py-3 tm-text-muted text-xs">{new Date(a.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                        <td className="px-4 py-3">
                          {a.status === 'active' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleAlertAction(a.id, 'acknowledge')} disabled={resolving === a.id}
                                className="px-2 py-1 text-xs bg-yellow-600/30 text-yellow-400 rounded hover:bg-yellow-600/50 transition disabled:opacity-50">
                                {resolving === a.id ? <Loader2 size={10} className="animate-spin" /> : 'Reconhecer'}
                              </button>
                              <button onClick={() => handleAlertAction(a.id, 'resolve')} disabled={resolving === a.id}
                                className="px-2 py-1 text-xs bg-green-600/30 text-green-400 rounded hover:bg-green-600/50 transition disabled:opacity-50">
                                Resolver
                              </button>
                            </div>
                          )}
                          {a.status === 'acknowledged' && (
                            <button onClick={() => handleAlertAction(a.id, 'resolve')} disabled={resolving === a.id}
                              className="px-2 py-1 text-xs bg-green-600/30 text-green-400 rounded hover:bg-green-600/50 transition disabled:opacity-50">
                              Resolver
                            </button>
                          )}
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
    </div>
  );
}
