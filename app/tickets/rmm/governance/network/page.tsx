'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Wifi, ChevronLeft, RefreshCw, Search, Loader2,
  AlertTriangle, CheckCircle, XCircle, Thermometer,
  Activity, Clock, Shield, Filter, Eye, Plus,
  ChevronDown, ChevronUp, X, Network, Router,
  Signal, Zap, ArrowUpDown, Radio, Monitor,
  Globe, Server, Cable, Gauge,
} from 'lucide-react';

// ===== Interfaces =====
interface DeviceOverview {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
  vendor: string | null;
  model: string | null;
  macAddress: string | null;
  firmware: string | null;
  status: string;
  lastPoll: string | null;
  uptimeStr: string | null;
  latency: number | null;
  cpuPercent: number | null;
  memPercent: number | null;
  temperature: number | null;
  company: { id: string; name: string };
  _count: { networkDiagnostics: number };
}

interface DiagnosticRecord {
  id: string;
  severity: string;
  category: string;
  diagnosticType: string;
  title: string;
  description: string;
  recommendation: string;
  metricValue: string | null;
  thresholdValue: string | null;
  isOpen: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  device: { name: string; ipAddress: string; type: string; vendor: string | null; model: string | null };
}

interface WifiHistory {
  id: string;
  radioName: string;
  band: string | null;
  channel: number | null;
  channelWidth: number | null;
  txPower: number | null;
  clientCount: number | null;
  satisfaction: number | null;
  retryRate: number | null;
  noiseFloor: number | null;
  channelUtil: number | null;
  collectedAt: string;
}

interface WanHistory {
  id: string;
  interfaceName: string;
  wanType: string | null;
  rxBytesRate: number | null;
  txBytesRate: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
  packetLoss: number | null;
  isUp: boolean;
  collectedAt: string;
}

interface SwitchPort {
  id: string;
  portIdx: number;
  portName: string | null;
  speed: number | null;
  isUp: boolean;
  poeEnabled: boolean;
  poeWatts: number | null;
  rxBytes: string | null;
  txBytes: string | null;
  rxErrors: string | null;
  txErrors: string | null;
  stpState: string | null;
  vlanId: number | null;
  collectedAt: string;
}

interface DiagSummary {
  critical: number;
  warning: number;
  info: number;
}

// ===== Helpers =====
function getDeviceIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'ap': case 'uap': return Wifi;
    case 'switch': case 'usw': return Cable;
    case 'gateway': case 'ugw': case 'udm': return Router;
    case 'firewall': return Shield;
    default: return Server;
  }
}

function getDeviceTypeLabel(type: string) {
  switch (type?.toLowerCase()) {
    case 'ap': case 'uap': return 'Access Point';
    case 'switch': case 'usw': return 'Switch';
    case 'gateway': case 'ugw': case 'udm': return 'Gateway';
    case 'firewall': return 'Firewall';
    case 'router': return 'Roteador';
    default: return type || 'Dispositivo';
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'online': return { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Online' };
    case 'offline': return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Offline' };
    case 'warning': return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Atenção' };
    default: return { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: status || 'Desconhecido' };
  }
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'critical': return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Crítico', icon: XCircle };
    case 'warning': return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Atenção', icon: AlertTriangle };
    case 'info': return { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Info', icon: Eye };
    default: return { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: severity, icon: Activity };
  }
}

function formatPercent(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(1) + '%';
}

function formatTemp(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(0) + '°C';
}

function formatMs(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(1) + 'ms';
}

function formatBytes(bytes: string | null): string {
  if (!bytes) return '—';
  const b = parseFloat(bytes);
  if (isNaN(b)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let val = b;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatBps(bps: number | null): string {
  if (bps == null) return '—';
  if (bps >= 1_000_000_000) return (bps / 1_000_000_000).toFixed(1) + ' Gbps';
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(1) + ' Mbps';
  if (bps >= 1_000) return (bps / 1_000).toFixed(1) + ' Kbps';
  return bps.toFixed(0) + ' bps';
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function getPercentColor(v: number | null, warnAt = 70, critAt = 90): string {
  if (v == null) return 'text-gray-400';
  if (v >= critAt) return 'text-red-400';
  if (v >= warnAt) return 'text-yellow-400';
  return 'text-green-400';
}

// ===== Componente Principal =====
export default function NetworkDiagnosticsPage() {
  const { data: session } = useSession();

  // State
  const [devices, setDevices] = useState<DeviceOverview[]>([]);
  const [diagSummary, setDiagSummary] = useState<DiagSummary>({ critical: 0, warning: 0, info: 0 });
  const [diagnostics, setDiagnostics] = useState<DiagnosticRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'devices' | 'diagnostics'>('devices');
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', ipAddress: '', type: 'router', community: 'public', vendor: '' });
  const [addingSaving, setAddingSaving] = useState(false);

  // Detail data per device
  const [wifiHistory, setWifiHistory] = useState<WifiHistory[]>([]);
  const [wanHistory, setWanHistory] = useState<WanHistory[]>([]);
  const [switchPorts, setSwitchPorts] = useState<SwitchPort[]>([]);
  const [deviceDiags, setDeviceDiags] = useState<DiagnosticRecord[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'wifi' | 'wan' | 'ports' | 'diags'>('info');

  // Companies for filter
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [filterCompany, setFilterCompany] = useState('');

  // ===== Data Loading =====
  const handleAddDevice = async () => {
    if (!addForm.name || !addForm.ipAddress) return;
    setAddingSaving(true);
    try {
      const res = await fetch('/api/rmm/snmp/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        setShowAddDevice(false);
        setAddForm({ name: '', ipAddress: '', type: 'router', community: 'public', vendor: '' });
        loadOverview();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao adicionar dispositivo');
      }
    } catch {
      alert('Erro ao adicionar dispositivo');
    } finally {
      setAddingSaving(false);
    }
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: 'overview', limit: '500' });
      if (filterCompany) params.set('companyId', filterCompany);
      const res = await fetch(`/api/rmm/governance/network-diag?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setDiagSummary(data.diagnosticsSummary || { critical: 0, warning: 0, info: 0 });
        // Extract unique companies
        const compMap = new Map<string, string>();
        (data.devices || []).forEach((d: DeviceOverview) => {
          if (d.company) compMap.set(d.company.id, d.company.name);
        });
        setCompanies(Array.from(compMap.entries()).map(([id, name]) => ({ id, name })));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterCompany]);

  const loadDiagnostics = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: 'diagnostics', limit: '500' });
      if (filterCompany) params.set('companyId', filterCompany);
      const res = await fetch(`/api/rmm/governance/network-diag?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }
  }, [filterCompany]);

  const loadDeviceDetails = useCallback(async (deviceId: string, type: string) => {
    setLoadingDetail(true);
    try {
      const [wifiRes, wanRes, portsRes, diagRes] = await Promise.all([
        ['ap', 'uap'].includes(type.toLowerCase())
          ? fetch(`/api/rmm/governance/network-diag?view=wifi&deviceId=${deviceId}&limit=50`).then(r => r.json())
          : Promise.resolve([]),
        ['gateway', 'ugw', 'udm', 'router', 'firewall'].includes(type.toLowerCase())
          ? fetch(`/api/rmm/governance/network-diag?view=wan&deviceId=${deviceId}&limit=50`).then(r => r.json())
          : Promise.resolve([]),
        ['switch', 'usw'].includes(type.toLowerCase())
          ? fetch(`/api/rmm/governance/network-diag?view=ports&deviceId=${deviceId}&limit=100`).then(r => r.json())
          : Promise.resolve([]),
        fetch(`/api/rmm/governance/network-diag?view=diagnostics&deviceId=${deviceId}&limit=50`).then(r => r.json()),
      ]);
      setWifiHistory(Array.isArray(wifiRes) ? wifiRes : []);
      setWanHistory(Array.isArray(wanRes) ? wanRes : []);
      setSwitchPorts(Array.isArray(portsRes) ? portsRes : []);
      setDeviceDiags(Array.isArray(diagRes) ? diagRes : []);
    } catch (e) { console.error(e); }
    finally { setLoadingDetail(false); }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadOverview();
      loadDiagnostics();
    }
  }, [session, loadOverview, loadDiagnostics]);

  const handleExpand = async (device: DeviceOverview) => {
    if (expandedDevice === device.id) {
      setExpandedDevice(null);
      return;
    }
    setExpandedDevice(device.id);
    setDetailTab('info');
    await loadDeviceDetails(device.id, device.type);
  };

  const handleResolve = async (diagId: string) => {
    setResolving(diagId);
    try {
      const res = await fetch('/api/rmm/governance/network-diag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosticId: diagId, action: 'resolve', resolution: 'Resolvido manualmente via painel' }),
      });
      if (res.ok) {
        await loadOverview();
        await loadDiagnostics();
        if (expandedDevice) {
          const dev = devices.find(d => d.id === expandedDevice);
          if (dev) await loadDeviceDetails(dev.id, dev.type);
        }
      }
    } catch (e) { console.error(e); }
    finally { setResolving(null); }
  };

  // ===== Filters =====
  const filteredDevices = devices.filter(d => {
    const matchSearch = !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.ipAddress.toLowerCase().includes(search.toLowerCase()) ||
      (d.vendor || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.model || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.macAddress || '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || d.type?.toLowerCase() === filterType;
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  const deviceTypes = [...new Set(devices.map(d => d.type?.toLowerCase()).filter(Boolean))];
  const totalDiags = diagSummary.critical + diagSummary.warning + diagSummary.info;
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;

  // ===== Render =====
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Network className="text-cyan-400" size={28} />
            Diagnóstico de Rede
          </h1>
          <p className="tm-text-secondary mt-1">
            {devices.length} dispositivos monitorados
            {totalDiags > 0 && <span className="text-red-400 ml-2">({totalDiags} diagnósticos abertos)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddDevice(!showAddDevice)} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium">
            <Plus size={14} /> Dispositivo
          </button>
          <button onClick={() => { loadOverview(); loadDiagnostics(); }} className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> Atualizar
          </button>
          <Link href="/tickets/rmm/governance" className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
            <ChevronLeft size={14} /> Governance
          </Link>
        </div>
      </div>

      {/* Add Device Form */}
      <AnimatePresence>
        {showAddDevice && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="tm-bg-card border tm-border rounded-xl p-4 overflow-hidden">
            <h3 className="font-semibold tm-text mb-3">Adicionar Dispositivo de Rede</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs tm-text-secondary block mb-1">Nome</label>
                <input type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="Ex: Router Principal"
                  className="w-full px-3 py-2 tm-bg-main border tm-border rounded-lg tm-text text-sm" />
              </div>
              <div>
                <label className="text-xs tm-text-secondary block mb-1">IP</label>
                <input type="text" value={addForm.ipAddress} onChange={e => setAddForm({ ...addForm, ipAddress: e.target.value })} placeholder="192.168.1.1"
                  className="w-full px-3 py-2 tm-bg-main border tm-border rounded-lg tm-text text-sm" />
              </div>
              <div>
                <label className="text-xs tm-text-secondary block mb-1">Tipo</label>
                <select value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                  className="w-full px-3 py-2 tm-bg-main border tm-border rounded-lg tm-text text-sm">
                  <option value="router">Router</option>
                  <option value="switch">Switch</option>
                  <option value="firewall">Firewall</option>
                  <option value="ap">Access Point</option>
                  <option value="udm">UDM</option>
                  <option value="usw">USW</option>
                  <option value="uap">UAP</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-xs tm-text-secondary block mb-1">Community SNMP</label>
                <input type="text" value={addForm.community} onChange={e => setAddForm({ ...addForm, community: e.target.value })} placeholder="public"
                  className="w-full px-3 py-2 tm-bg-main border tm-border rounded-lg tm-text text-sm" />
              </div>
              <div className="flex items-end">
                <button onClick={handleAddDevice} disabled={addingSaving || !addForm.name || !addForm.ipAddress}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                  {addingSaving ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
          className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <Server className="mx-auto text-cyan-400 mb-1" size={20} />
          <p className="text-2xl font-bold tm-text">{devices.length}</p>
          <p className="text-xs tm-text-muted">Dispositivos</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <CheckCircle className="mx-auto text-green-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-green-400">{onlineCount}</p>
          <p className="text-xs tm-text-muted">Online</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <XCircle className="mx-auto text-red-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-red-400">{offlineCount}</p>
          <p className="text-xs tm-text-muted">Offline</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <XCircle className="mx-auto text-red-500 mb-1" size={20} />
          <p className="text-2xl font-bold text-red-500">{diagSummary.critical}</p>
          <p className="text-xs tm-text-muted">Críticos</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <AlertTriangle className="mx-auto text-yellow-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-yellow-400">{diagSummary.warning}</p>
          <p className="text-xs tm-text-muted">Avisos</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="tm-bg-card border tm-border rounded-xl p-4 text-center">
          <Eye className="mx-auto text-blue-400 mb-1" size={20} />
          <p className="text-2xl font-bold text-blue-400">{diagSummary.info}</p>
          <p className="text-xs tm-text-muted">Informativos</p>
        </motion.div>
      </div>

      {/* Company Filter */}
      {companies.length > 1 && (
        <div className="flex items-center gap-3">
          <Filter size={16} className="tm-text-muted" />
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
            className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm min-w-[200px]">
            <option value="">Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 tm-bg-card border tm-border rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('devices')}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'devices' ? 'bg-cyan-600 text-white' : 'tm-text hover:bg-white/10'}`}>
          <Server size={14} className="inline mr-1.5" /> Dispositivos ({devices.length})
        </button>
        <button onClick={() => setActiveTab('diagnostics')}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'diagnostics' ? 'bg-cyan-600 text-white' : 'tm-text hover:bg-white/10'}`}>
          <AlertTriangle size={14} className="inline mr-1.5" /> Diagnósticos ({totalDiags})
        </button>
      </div>

      {/* ========== DEVICES TAB ========== */}
      {activeTab === 'devices' && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
              <input type="text" placeholder="Buscar por nome, IP, vendor, modelo, MAC..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
                <option value="all">Todos os tipos</option>
                {deviceTypes.map(t => <option key={t} value={t}>{getDeviceTypeLabel(t || '')}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
                <option value="all">Todos os status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="warning">Atenção</option>
              </select>
            </div>
          </div>

          {/* Device List */}
          {filteredDevices.length === 0 ? (
            <div className="text-center py-16 tm-text-muted">
              <Network size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Nenhum dispositivo encontrado</p>
              <p className="text-sm mt-1">Configure o módulo SNMP/UniFi no agente para descobrir dispositivos de rede.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredDevices.map((device, idx) => {
                  const DevIcon = getDeviceIcon(device.type);
                  const stBadge = getStatusBadge(device.status);
                  const isExpanded = expandedDevice === device.id;
                  const openDiags = device._count?.networkDiagnostics || 0;

                  return (
                    <motion.div
                      key={device.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="tm-bg-card border tm-border rounded-xl overflow-hidden"
                    >
                      {/* Device Row */}
                      <div
                        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => handleExpand(device)}
                      >
                        <div className={`p-2 rounded-lg ${device.status === 'online' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                          <DevIcon size={22} className={device.status === 'online' ? 'text-green-400' : 'text-red-400'} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold tm-text truncate">{device.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${stBadge.color}`}>{stBadge.label}</span>
                            {openDiags > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                                {openDiags} diag{openDiags > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs tm-text-muted">
                            <span>{device.ipAddress}</span>
                            <span>•</span>
                            <span>{getDeviceTypeLabel(device.type)}</span>
                            {device.vendor && <><span>•</span><span>{device.vendor}</span></>}
                            {device.model && <><span>•</span><span className="truncate max-w-[150px]">{device.model}</span></>}
                          </div>
                        </div>

                        {/* Quick Metrics */}
                        <div className="hidden md:flex items-center gap-4 text-xs">
                          {device.cpuPercent != null && (
                            <div className="text-center">
                              <p className={`font-mono font-semibold ${getPercentColor(device.cpuPercent, 80, 95)}`}>{formatPercent(device.cpuPercent)}</p>
                              <p className="tm-text-muted">CPU</p>
                            </div>
                          )}
                          {device.memPercent != null && (
                            <div className="text-center">
                              <p className={`font-mono font-semibold ${getPercentColor(device.memPercent, 85, 95)}`}>{formatPercent(device.memPercent)}</p>
                              <p className="tm-text-muted">RAM</p>
                            </div>
                          )}
                          {device.temperature != null && (
                            <div className="text-center">
                              <p className={`font-mono font-semibold ${getPercentColor(device.temperature, 65, 80)}`}>{formatTemp(device.temperature)}</p>
                              <p className="tm-text-muted">Temp</p>
                            </div>
                          )}
                          {device.latency != null && (
                            <div className="text-center">
                              <p className="font-mono font-semibold tm-text">{formatMs(device.latency)}</p>
                              <p className="tm-text-muted">Latência</p>
                            </div>
                          )}
                        </div>

                        <div className="tm-text-muted text-xs hidden sm:block">
                          {device.company?.name}
                        </div>

                        <div className="tm-text-muted text-xs">
                          {timeAgo(device.lastPoll)}
                        </div>

                        {isExpanded ? <ChevronUp size={18} className="tm-text-muted" /> : <ChevronDown size={18} className="tm-text-muted" />}
                      </div>

                      {/* Expanded Detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t tm-border"
                          >
                            {loadingDetail ? (
                              <div className="flex justify-center py-8">
                                <Loader2 className="animate-spin text-blue-400" size={20} />
                              </div>
                            ) : (
                              <div className="p-4 space-y-4">
                                {/* Detail Tabs */}
                                <div className="flex gap-1 flex-wrap">
                                  {[
                                    { key: 'info' as const, label: 'Info', icon: Eye },
                                    ...(['ap', 'uap'].includes(device.type?.toLowerCase()) ? [{ key: 'wifi' as const, label: `WiFi (${wifiHistory.length})`, icon: Wifi }] : []),
                                    ...(['gateway', 'ugw', 'udm', 'router', 'firewall'].includes(device.type?.toLowerCase()) ? [{ key: 'wan' as const, label: `WAN (${wanHistory.length})`, icon: Globe }] : []),
                                    ...(['switch', 'usw'].includes(device.type?.toLowerCase()) ? [{ key: 'ports' as const, label: `Portas (${switchPorts.length})`, icon: Cable }] : []),
                                    { key: 'diags' as const, label: `Diagnósticos (${deviceDiags.filter(d => d.isOpen).length})`, icon: AlertTriangle },
                                  ].map(tab => (
                                    <button key={tab.key} onClick={(e) => { e.stopPropagation(); setDetailTab(tab.key); }}
                                      className={`px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${
                                        detailTab === tab.key ? 'bg-cyan-600 text-white' : 'tm-bg-card border tm-border tm-text hover:bg-white/10'
                                      }`}>
                                      <tab.icon size={12} /> {tab.label}
                                    </button>
                                  ))}
                                </div>

                                {/* Info Tab */}
                                {detailTab === 'info' && (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div><p className="tm-text-muted text-xs">IP</p><p className="tm-text font-mono">{device.ipAddress}</p></div>
                                    <div><p className="tm-text-muted text-xs">MAC</p><p className="tm-text font-mono">{device.macAddress || '—'}</p></div>
                                    <div><p className="tm-text-muted text-xs">Vendor</p><p className="tm-text">{device.vendor || '—'}</p></div>
                                    <div><p className="tm-text-muted text-xs">Modelo</p><p className="tm-text">{device.model || '—'}</p></div>
                                    <div><p className="tm-text-muted text-xs">Firmware</p><p className="tm-text font-mono text-xs">{device.firmware || '—'}</p></div>
                                    <div><p className="tm-text-muted text-xs">Uptime</p><p className="tm-text">{device.uptimeStr || '—'}</p></div>
                                    <div><p className="tm-text-muted text-xs">Empresa</p><p className="tm-text">{device.company?.name || '—'}</p></div>
                                    <div><p className="tm-text-muted text-xs">Último Poll</p><p className="tm-text">{timeAgo(device.lastPoll)}</p></div>
                                  </div>
                                )}

                                {/* WiFi Tab */}
                                {detailTab === 'wifi' && (
                                  <div className="space-y-3">
                                    {wifiHistory.length === 0 ? (
                                      <p className="tm-text-muted text-sm text-center py-4">Sem dados WiFi coletados ainda.</p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="border-b tm-border text-xs tm-text-muted">
                                              <th className="text-left py-2 px-2">Rádio</th>
                                              <th className="text-left py-2 px-2">Banda</th>
                                              <th className="text-center py-2 px-2">Canal</th>
                                              <th className="text-center py-2 px-2">Largura</th>
                                              <th className="text-center py-2 px-2">Clientes</th>
                                              <th className="text-center py-2 px-2">Satisfação</th>
                                              <th className="text-center py-2 px-2">Retry</th>
                                              <th className="text-center py-2 px-2">Utiliz.</th>
                                              <th className="text-center py-2 px-2">Noise</th>
                                              <th className="text-right py-2 px-2">Coleta</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {wifiHistory.slice(0, 20).map(w => (
                                              <tr key={w.id} className="border-b tm-border hover:bg-white/5">
                                                <td className="py-2 px-2 tm-text font-mono text-xs">{w.radioName}</td>
                                                <td className="py-2 px-2 tm-text">{w.band || '—'}</td>
                                                <td className="py-2 px-2 text-center tm-text">{w.channel ?? '—'}</td>
                                                <td className="py-2 px-2 text-center tm-text">{w.channelWidth ? `${w.channelWidth}MHz` : '—'}</td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${(w.clientCount || 0) > 25 ? 'text-yellow-400' : 'tm-text'}`}>{w.clientCount ?? '—'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${getPercentColor(w.satisfaction, 60, 40)}`}>{w.satisfaction != null ? w.satisfaction + '%' : '—'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${getPercentColor(w.retryRate, 15, 25)}`}>{w.retryRate != null ? w.retryRate.toFixed(1) + '%' : '—'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${getPercentColor(w.channelUtil, 70, 85)}`}>{w.channelUtil != null ? w.channelUtil.toFixed(0) + '%' : '—'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center tm-text font-mono">{w.noiseFloor != null ? w.noiseFloor + 'dBm' : '—'}</td>
                                                <td className="py-2 px-2 text-right tm-text-muted text-xs">{timeAgo(w.collectedAt)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* WAN Tab */}
                                {detailTab === 'wan' && (
                                  <div className="space-y-3">
                                    {wanHistory.length === 0 ? (
                                      <p className="tm-text-muted text-sm text-center py-4">Sem dados WAN coletados ainda.</p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="border-b tm-border text-xs tm-text-muted">
                                              <th className="text-left py-2 px-2">Interface</th>
                                              <th className="text-left py-2 px-2">Tipo</th>
                                              <th className="text-center py-2 px-2">Status</th>
                                              <th className="text-center py-2 px-2">↓ RX</th>
                                              <th className="text-center py-2 px-2">↑ TX</th>
                                              <th className="text-center py-2 px-2">Latência</th>
                                              <th className="text-center py-2 px-2">Jitter</th>
                                              <th className="text-center py-2 px-2">Perda</th>
                                              <th className="text-right py-2 px-2">Coleta</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {wanHistory.slice(0, 20).map(w => (
                                              <tr key={w.id} className="border-b tm-border hover:bg-white/5">
                                                <td className="py-2 px-2 tm-text font-mono text-xs">{w.interfaceName}</td>
                                                <td className="py-2 px-2 tm-text">{w.wanType || '—'}</td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${w.isUp ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                                                    {w.isUp ? 'UP' : 'DOWN'}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-2 text-center tm-text font-mono text-xs">{formatBps(w.rxBytesRate)}</td>
                                                <td className="py-2 px-2 text-center tm-text font-mono text-xs">{formatBps(w.txBytesRate)}</td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${getPercentColor(w.latencyMs, 80, 150)}`}>{formatMs(w.latencyMs)}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${getPercentColor(w.jitterMs, 15, 30)}`}>{formatMs(w.jitterMs)}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-semibold ${getPercentColor(w.packetLoss, 1, 3)}`}>{w.packetLoss != null ? w.packetLoss.toFixed(2) + '%' : '—'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-right tm-text-muted text-xs">{timeAgo(w.collectedAt)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Switch Ports Tab */}
                                {detailTab === 'ports' && (
                                  <div className="space-y-3">
                                    {switchPorts.length === 0 ? (
                                      <p className="tm-text-muted text-sm text-center py-4">Sem dados de portas coletados ainda.</p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="border-b tm-border text-xs tm-text-muted">
                                              <th className="text-center py-2 px-2">#</th>
                                              <th className="text-left py-2 px-2">Nome</th>
                                              <th className="text-center py-2 px-2">Status</th>
                                              <th className="text-center py-2 px-2">Speed</th>
                                              <th className="text-center py-2 px-2">PoE</th>
                                              <th className="text-center py-2 px-2">↓ RX</th>
                                              <th className="text-center py-2 px-2">↑ TX</th>
                                              <th className="text-center py-2 px-2">Erros RX</th>
                                              <th className="text-center py-2 px-2">Erros TX</th>
                                              <th className="text-center py-2 px-2">VLAN</th>
                                              <th className="text-center py-2 px-2">STP</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {switchPorts.sort((a, b) => a.portIdx - b.portIdx).map(p => (
                                              <tr key={p.id} className="border-b tm-border hover:bg-white/5">
                                                <td className="py-2 px-2 text-center tm-text font-mono">{p.portIdx}</td>
                                                <td className="py-2 px-2 tm-text text-xs">{p.portName || '—'}</td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`w-2 h-2 rounded-full inline-block ${p.isUp ? 'bg-green-400' : 'bg-gray-600'}`} />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`tm-text font-mono text-xs ${p.speed != null && p.speed <= 100 ? 'text-yellow-400' : ''}`}>
                                                    {p.speed ? (p.speed >= 1000 ? (p.speed / 1000) + 'G' : p.speed + 'M') : '—'}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  {p.poeEnabled ? (
                                                    <span className="text-green-400 text-xs">{p.poeWatts != null ? p.poeWatts.toFixed(1) + 'W' : 'Sim'}</span>
                                                  ) : <span className="tm-text-muted text-xs">—</span>}
                                                </td>
                                                <td className="py-2 px-2 text-center tm-text font-mono text-xs">{formatBytes(p.rxBytes)}</td>
                                                <td className="py-2 px-2 text-center tm-text font-mono text-xs">{formatBytes(p.txBytes)}</td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-mono text-xs ${parseInt(p.rxErrors || '0') > 50 ? 'text-red-400' : 'tm-text'}`}>{p.rxErrors || '0'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                  <span className={`font-mono text-xs ${parseInt(p.txErrors || '0') > 50 ? 'text-red-400' : 'tm-text'}`}>{p.txErrors || '0'}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center tm-text text-xs">{p.vlanId ?? '—'}</td>
                                                <td className="py-2 px-2 text-center tm-text text-xs">{p.stpState || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Device Diagnostics Tab */}
                                {detailTab === 'diags' && (
                                  <div className="space-y-2">
                                    {deviceDiags.filter(d => d.isOpen).length === 0 ? (
                                      <div className="text-center py-6">
                                        <CheckCircle className="mx-auto text-green-400 mb-2" size={24} />
                                        <p className="tm-text-muted text-sm">Nenhum diagnóstico aberto para este dispositivo.</p>
                                      </div>
                                    ) : (
                                      deviceDiags.filter(d => d.isOpen).map(diag => {
                                        const badge = getSeverityBadge(diag.severity);
                                        return (
                                          <div key={diag.id} className={`p-3 rounded-lg border ${badge.color} bg-opacity-10`}>
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <badge.icon size={14} />
                                                  <span className="font-semibold text-sm">{diag.title}</span>
                                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.color}`}>{badge.label}</span>
                                                </div>
                                                <p className="text-xs tm-text-secondary">{diag.description}</p>
                                                {diag.recommendation && (
                                                  <p className="text-xs text-cyan-400 mt-1">💡 {diag.recommendation}</p>
                                                )}
                                                <div className="flex gap-4 mt-1 text-[10px] tm-text-muted">
                                                  {diag.metricValue && <span>Valor: {diag.metricValue}</span>}
                                                  {diag.thresholdValue && <span>Limite: {diag.thresholdValue}</span>}
                                                  <span>Desde: {timeAgo(diag.firstSeenAt)}</span>
                                                </div>
                                              </div>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleResolve(diag.id); }}
                                                disabled={resolving === diag.id}
                                                className="px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-600/30 transition disabled:opacity-50"
                                              >
                                                {resolving === diag.id ? <Loader2 size={12} className="animate-spin" /> : 'Resolver'}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {/* ========== DIAGNOSTICS TAB ========== */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-2">
          {diagnostics.length === 0 ? (
            <div className="text-center py-16 tm-text-muted">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-400 opacity-30" />
              <p className="text-lg">Nenhum diagnóstico aberto</p>
              <p className="text-sm mt-1">Todos os dispositivos estão operando dentro dos parâmetros normais.</p>
            </div>
          ) : (
            diagnostics.map((diag, idx) => {
              const badge = getSeverityBadge(diag.severity);
              return (
                <motion.div
                  key={diag.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="tm-bg-card border tm-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <badge.icon size={16} className={badge.color.includes('red') ? 'text-red-400' : badge.color.includes('yellow') ? 'text-yellow-400' : 'text-blue-400'} />
                        <span className="font-semibold tm-text">{diag.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.color}`}>{badge.label}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border tm-border tm-text-secondary">{diag.category}</span>
                      </div>
                      <p className="text-sm tm-text-secondary">{diag.description}</p>
                      {diag.recommendation && (
                        <p className="text-xs text-cyan-400 mt-1.5">💡 {diag.recommendation}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs tm-text-muted flex-wrap">
                        <span className="flex items-center gap-1">
                          <Server size={11} /> {diag.device?.name} ({diag.device?.ipAddress})
                        </span>
                        {diag.device?.vendor && <span>{diag.device.vendor} {diag.device.model || ''}</span>}
                        {diag.metricValue && <span>Valor: <span className="font-mono">{diag.metricValue}</span></span>}
                        {diag.thresholdValue && <span>Limite: <span className="font-mono">{diag.thresholdValue}</span></span>}
                        <span>Visto: {timeAgo(diag.lastSeenAt)}</span>
                        <span>Desde: {timeAgo(diag.firstSeenAt)}</span>
                      </div>
                    </div>
                    {diag.isOpen && (
                      <button
                        onClick={() => handleResolve(diag.id)}
                        disabled={resolving === diag.id}
                        className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg text-sm hover:bg-green-600/30 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {resolving === diag.id ? <Loader2 size={14} className="animate-spin" /> : '✓ Resolver'}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
