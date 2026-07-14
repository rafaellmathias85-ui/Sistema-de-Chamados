'use client';

import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Monitor,
  Wifi,
  WifiOff,
  Terminal,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  HardDrive,
  Cpu,
  User,
  Building2,
  Globe,
  RefreshCw,
  Activity,
  Box,
  Settings,
  Layers,
  Network,
  FileCode2,
  Ban,
  Power,
  ArrowUpCircle,
  Package,
} from 'lucide-react';

interface RmmTask {
  id: string;
  command: string;
  status: string;
  result: string | null;
  createdByName: string | null;
  createdAt: string;
  executedAt: string | null;
}

interface MachineDetail {
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
  publicIp: string | null;
  upnUsers: string | null;
  gpuInfo: string | null;
  services: string | null;
  installedApps: string | null;
  cpuModel: string | null;
  cpuUsage: number | null;
  ramUsage: number | null;
  diskUsage: number | null;
  antivirusStatus: string | null;
  lastBootTime: string | null;
  teamviewerId: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  memorySlotsTotal: number | null;
  memorySlotsUsed: number | null;
  memoryModulesJson: string | null;
  agentVersion: string | null;
  agentType: string | null;
  macAddress: string | null;
  updateChannel: string | null;
  company: { id: string; name: string };
  tasks: RmmTask[];
}

interface Snapshot {
  id: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  processesJson: string | null;
  servicesJson: string | null;
  installedAppsJson: string | null;
  gpuJson: string | null;
  networkIoJson: string | null;
  createdAt: string;
}

type DetailTab = 'info' | 'processes' | 'services' | 'apps' | 'console';

// Tolerant JSON array parser: handles single-encoded, double-encoded (legacy snapshots), and non-array values.
const parseJsonArray = (raw: string | null | undefined): any[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') {
      const reparsed = JSON.parse(parsed);
      if (Array.isArray(reparsed)) return reparsed;
    }
  } catch { /* empty */ }
  return [];
};

export default function MachineDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [savedScripts, setSavedScripts] = useState<{id:string;name:string;content:string;scriptType:string}[]>([]);
  const [showScriptPicker, setShowScriptPicker] = useState(false);
  const [scriptType, setScriptType] = useState<'auto'|'powershell'|'cmd'|'vbscript'|'python'>('auto');

  const fetchMachine = async () => {
    try {
      const res = await fetch(`/api/rmm/machines/${params.id}`);
      if (res.ok) {
        setMachine(await res.json());
      } else {
        router.push('/tickets/rmm');
      }
    } catch (e) {
      console.error('Erro:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSnapshot = async () => {
    try {
      const res = await fetch(`/api/rmm/snapshots?machineId=${params.id}&latest=true`);
      if (res.ok) {
        const data = await res.json();
        if (data) setSnapshot(data);
      }
    } catch (e) { console.error('Snapshot error:', e); }
  };

  const fetchScripts = async () => {
    try {
      const res = await fetch('/api/rmm/scripts');
      if (res.ok) {
        const data = await res.json();
        setSavedScripts(data.filter((s: any) => s.approved).map((s: any) => ({ id: s.id, name: s.name, content: s.content, scriptType: s.scriptType })));
      }
    } catch (e) { console.error('Scripts error:', e); }
  };

  useEffect(() => {
    fetchMachine();
    fetchSnapshot();
    fetchScripts();
    const interval = setInterval(() => { fetchMachine(); fetchSnapshot(); }, 30000);
    return () => clearInterval(interval);
  }, [params.id]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [machine?.tasks]);

  const handleSendCommand = async () => {
    if (!command.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/rmm/machines/${params.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim(), scriptType }),
      });
      if (res.ok) {
        setCommand('');
        fetchMachine();
      }
    } catch (e) {
      console.error('Erro ao enviar:', e);
    } finally {
      setSending(false);
    }
  };

  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [updatingAgent, setUpdatingAgent] = useState(false);

  const handleForceUpdate = async () => {
    if (updatingAgent) return;
    setUpdatingAgent(true);
    try {
      const res = await fetch('/api/rmm/agent/push-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineIds: [params.id] }),
      });
      if (res.ok) {
        alert('✅ Atualização enviada! O agente será atualizado no próximo check-in.');
        fetchMachine();
      } else {
        alert('Erro ao enviar atualização.');
      }
    } catch (e) {
      console.error('Erro:', e);
      alert('Erro ao enviar atualização.');
    } finally {
      setUpdatingAgent(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (cancelling) return;
    setCancelling(taskId);
    try {
      const res = await fetch(`/api/rmm/machines/${params.id}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action: 'cancel' }),
      });
      if (res.ok) {
        fetchMachine();
      }
    } catch (e) {
      console.error('Erro ao cancelar:', e);
    } finally {
      setCancelling(null);
    }
  };

  const handleReactivateAgent = async () => {
    if (reactivating) return;
    setReactivating(true);
    try {
      const res = await fetch(`/api/rmm/machines/${params.id}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        fetchMachine();
        // Baixar script de recuperacao
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
        alert('Ping enviado! Se o agente responder, ficara online em 1-2 min.\n\nSe NAO responder, execute o script de recuperacao baixado (reativar-rmm-<host>.ps1) como Administrador na maquina.');
      } else {
        alert('Erro ao tentar reativar o agente. Verifique os logs.');
      }
    } catch (e) {
      console.error('Erro ao reativar:', e);
      alert('Erro ao tentar reativar o agente. Verifique sua conexao.');
    } finally {
      setReactivating(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const getStatusIcon = (s: string) => {
    if (s === 'PENDING') return <Loader2 size={14} className="animate-spin text-yellow-400" />;
    if (s === 'RUNNING') return <Loader2 size={14} className="animate-spin text-blue-400" />;
    if (s === 'EXECUTED') return <CheckCircle2 size={14} className="text-green-400" />;
    if (s === 'CANCELLED') return <Ban size={14} className="text-orange-400" />;
    return <XCircle size={14} className="text-red-400" />;
  };

  const getStatusLabel = (s: string) => {
    if (s === 'PENDING') return 'Pendente';
    if (s === 'RUNNING') return 'Executando';
    if (s === 'EXECUTED') return 'Executado';
    if (s === 'CANCELLED') return 'Cancelado';
    return 'Erro';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!machine) {
    return <div className="text-center py-12 tm-text-secondary">Máquina não encontrada</div>;
  }

  const isOnline = machine.status === 'Ligado';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/tickets/rmm"
          className="inline-flex items-center gap-2 tm-text-secondary hover:tm-text mb-4"
        >
          <ArrowLeft size={20} /> Voltar ao RMM
        </Link>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Monitor size={28} className="text-accent-blue" />
            <div>
              <h1 className="text-xl font-montserrat font-bold tm-text">{machine.hostname}</h1>
              <p className="tm-text-secondary text-sm">{machine.company.name}</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              isOnline
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex gap-2">
            {machine.teamviewerId && (
              <a
                href={`teamviewer10://control?device=${machine.teamviewerId}`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
                title={`Conectar TeamViewer (ID: ${machine.teamviewerId})`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.597 24H1.406A1.41 1.41 0 0 1 0 22.594V1.406A1.41 1.41 0 0 1 1.406 0h21.191A1.41 1.41 0 0 1 24 1.406v21.188A1.41 1.41 0 0 1 22.597 24zM4.95 11.953l6.036-6.037.967.968-5.069 5.069 5.069 5.069-.967.967-6.036-6.036zm7.1 0l6.036-6.037.967.968-5.069 5.069 5.069 5.069-.967.967-6.036-6.036z"/></svg>
                TeamViewer
              </a>
            )}
            {isOnline && (
              <button
                onClick={handleForceUpdate}
                disabled={updatingAgent}
                className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                title="Forçar atualização do agente"
              >
                {updatingAgent ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpCircle size={16} />}
                Atualizar Agente
              </button>
            )}
            {!isOnline && (
              <button
                onClick={handleReactivateAgent}
                disabled={reactivating}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                title="Enviar comando de reativação para o agente"
              >
                {reactivating ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                Reativar Agente
              </button>
            )}
            <button
              onClick={() => { fetchMachine(); fetchSnapshot(); fetchScripts(); }}
              className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm"
            >
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Resource Usage Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'CPU', value: machine.cpuUsage, color: 'blue' },
            { label: 'RAM', value: machine.ramUsage, color: 'green' },
            { label: 'Disco', value: machine.diskUsage, color: 'yellow' },
          ].map((item, i) => {
            const pct = item.value || 0;
            const colorMap: Record<string, string> = { blue: 'bg-blue-500', green: 'bg-green-500', yellow: 'bg-yellow-500' };
            const textMap: Record<string, string> = { blue: 'text-blue-400', green: 'text-green-400', yellow: 'text-yellow-400' };
            return (
              <div key={i} className="tm-bg-card border tm-border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm tm-text-secondary">{item.label}</span>
                  <span className={`text-sm font-semibold ${pct > 90 ? 'text-red-400' : textMap[item.color]}`}>{pct.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className={`h-2 rounded-full ${pct > 90 ? 'bg-red-500' : colorMap[item.color]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>

      {/* Detail Tabs */}
      <div className="flex space-x-1 border-b tm-border overflow-x-auto">
        {[
          { id: 'info' as DetailTab, label: 'Informações', icon: Monitor },
          { id: 'processes' as DetailTab, label: 'Processos', icon: Activity },
          { id: 'services' as DetailTab, label: 'Serviços', icon: Settings },
          { id: 'apps' as DetailTab, label: 'Apps Instalados', icon: Box },
          { id: 'console' as DetailTab, label: 'Console', icon: Terminal },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap text-sm ${activeTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent tm-text-secondary hover:text-gray-200'}`}>
            <tab.icon size={16} />{tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Sistema', value: machine.os ? machine.os.substring(0, 35) : '—', icon: Cpu },
            { label: 'CPU', value: machine.cpuModel || '—', icon: Cpu },
            { label: 'RAM', value: machine.ram || '—', icon: HardDrive },
            { label: 'Slots de Memória', value: (machine.memorySlotsTotal != null && machine.memorySlotsUsed != null) ? `${machine.memorySlotsUsed} usado(s) de ${machine.memorySlotsTotal} total` : '—', icon: HardDrive },
            { label: 'GPU', value: machine.gpuInfo || '—', icon: Monitor },
            { label: 'Disco', value: `${machine.diskModel || ''} ${machine.diskSize || ''}`.trim() || '—', icon: HardDrive },
            { label: 'Nº de Série', value: machine.serialNumber || '—', icon: Cpu },
            { label: 'Fabricante', value: machine.manufacturer || '—', icon: Building2 },
            { label: 'Modelo', value: machine.model || '—', icon: Cpu },
            { label: 'IP Local', value: machine.ipAddress || '—', icon: Globe },
            { label: 'MAC Address', value: machine.macAddress || '—', icon: Network },
            { label: 'IP Público', value: machine.publicIp || '—', icon: Globe },
            { label: 'Usuário', value: machine.username || '—', icon: User },
            { label: 'Empresa', value: machine.company.name, icon: Building2 },
            { label: 'Antivírus', value: machine.antivirusStatus || '—', icon: Monitor },
            { label: 'Versão do Agente', value: machine.agentVersion || 'Não informada', icon: Package },
            { label: 'TeamViewer ID', value: machine.teamviewerId || 'Não instalado', icon: Globe },
            { label: 'Último Boot', value: formatDate(machine.lastBootTime), icon: Clock },
            { label: 'Último Check-in', value: formatDate(machine.lastCheckin), icon: Clock },
          ].map((item, i) => (
            <div key={i} className="tm-bg-card border tm-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <item.icon size={14} className="tm-text-muted" />
                <span className="text-xs tm-text-muted uppercase">{item.label}</span>
              </div>
              <p className="text-sm tm-text truncate" title={item.value}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Memory Modules Detail (below info grid) */}
      {activeTab === 'info' && machine.memoryModulesJson && (() => {
        let modules: any[] = [];
        try { modules = JSON.parse(machine.memoryModulesJson); } catch { return null; }
        if (!Array.isArray(modules) || modules.length === 0) return null;
        return (
          <div className="mt-4 tm-bg-card border tm-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b tm-border">
              <h3 className="tm-text font-semibold text-sm flex items-center gap-2">
                <HardDrive size={14} className="text-blue-400" /> Módulos de Memória ({modules.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="tm-bg-main tm-text-muted uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Slot</th>
                    <th className="text-left px-3 py-2">Capacidade</th>
                    <th className="text-left px-3 py-2">Velocidade</th>
                    <th className="text-left px-3 py-2">Fabricante</th>
                    <th className="text-left px-3 py-2">Part Number</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((mod: any, idx: number) => (
                    <tr key={idx} className="border-t tm-border">
                      <td className="px-3 py-2 tm-text">{mod.slot || mod.deviceLocator || `#${idx + 1}`}</td>
                      <td className="px-3 py-2 tm-text">{mod.capacity || mod.capacityGB ? `${mod.capacity || mod.capacityGB} GB` : '—'}</td>
                      <td className="px-3 py-2 tm-text">{mod.speed ? `${mod.speed} MHz` : '—'}</td>
                      <td className="px-3 py-2 tm-text">{mod.manufacturer || '—'}</td>
                      <td className="px-3 py-2 tm-text-muted">{mod.partNumber || mod.serialNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Tab: Processes */}
      {activeTab === 'processes' && (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b tm-border">
            <h2 className="tm-text font-semibold flex items-center gap-2"><Activity size={16} className="text-blue-400" /> Processos em execução</h2>
            {snapshot?.createdAt && <span className="text-xs tm-text-muted">Último snapshot: {formatDate(snapshot.createdAt)}</span>}
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {(() => {
              const processes = parseJsonArray(snapshot?.processesJson);
              if (processes.length === 0) {
                // Try from machine.services field as fallback
                return <div className="text-center py-8 tm-text-muted">Nenhum snapshot de processos disponível. Aguardando dados do agente.</div>;
              }
              return (
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 tm-text-secondary">PID</th>
                      <th className="text-left px-3 py-2 tm-text-secondary">Nome</th>
                      <th className="text-right px-3 py-2 tm-text-secondary">CPU %</th>
                      <th className="text-right px-3 py-2 tm-text-secondary">Mem (MB)</th>
                      <th className="text-left px-3 py-2 tm-text-secondary">Usuário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.slice(0, 100).map((p: any, i: number) => (
                      <tr key={i} className="border-t tm-border hover:tm-bg-card">
                        <td className="px-3 py-1.5 tm-text-secondary font-mono text-xs">{p.pid || '-'}</td>
                        <td className="px-3 py-1.5 tm-text">{p.name || '-'}</td>
                        <td className="px-3 py-1.5 text-right tm-text">{typeof p.cpu === 'number' ? p.cpu.toFixed(1) : '-'}</td>
                        <td className="px-3 py-1.5 text-right tm-text">{typeof p.mem === 'number' ? (p.mem / 1024 / 1024).toFixed(1) : '-'}</td>
                        <td className="px-3 py-1.5 tm-text-secondary text-xs">{p.user || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tab: Services */}
      {activeTab === 'services' && (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b tm-border">
            <h2 className="tm-text font-semibold flex items-center gap-2"><Settings size={16} className="text-green-400" /> Serviços Windows</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {(() => {
              const services = parseJsonArray(snapshot?.servicesJson).length > 0
                ? parseJsonArray(snapshot?.servicesJson)
                : parseJsonArray(machine.services);
              if (services.length === 0) {
                return <div className="text-center py-8 tm-text-muted">Nenhum dado de serviços disponível.</div>;
              }
              return (
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 tm-text-secondary">Nome</th>
                      <th className="text-left px-3 py-2 tm-text-secondary">Nome de Exibição</th>
                      <th className="text-center px-3 py-2 tm-text-secondary">Status</th>
                      <th className="text-left px-3 py-2 tm-text-secondary">Tipo de Início</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s: any, i: number) => (
                      <tr key={i} className="border-t tm-border hover:tm-bg-card">
                        <td className="px-3 py-1.5 tm-text font-mono text-xs">{s.name || '-'}</td>
                        <td className="px-3 py-1.5 tm-text">{s.displayName || s.name || '-'}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${s.status === 'Running' || s.status === 'running' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {s.status || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 tm-text-secondary text-xs">{s.startType || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tab: Installed Apps */}
      {activeTab === 'apps' && (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b tm-border">
            <h2 className="tm-text font-semibold flex items-center gap-2"><Box size={16} className="text-purple-400" /> Programas Instalados</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {(() => {
              const apps = parseJsonArray(snapshot?.installedAppsJson).length > 0
                ? parseJsonArray(snapshot?.installedAppsJson)
                : parseJsonArray(machine.installedApps);
              if (apps.length === 0) {
                return <div className="text-center py-8 tm-text-muted">Nenhum dado de aplicativos disponível.</div>;
              }
              return (
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 tm-text-secondary">Nome</th>
                      <th className="text-left px-3 py-2 tm-text-secondary">Versão</th>
                      <th className="text-left px-3 py-2 tm-text-secondary">Publisher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((a: any, i: number) => (
                      <tr key={i} className="border-t tm-border hover:tm-bg-card">
                        <td className="px-3 py-1.5 tm-text">{a.name || '-'}</td>
                        <td className="px-3 py-1.5 tm-text-secondary text-xs">{a.version || '-'}</td>
                        <td className="px-3 py-1.5 tm-text-secondary text-xs">{a.publisher || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tab: Console de Scripts */}
      {activeTab === 'console' && (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b tm-border">
            <div className="flex items-center gap-3">
              <Terminal size={18} className="text-accent-blue" />
              <h2 className="tm-text font-semibold">Console de Scripts</h2>
              <select
                value={scriptType}
                onChange={(e) => setScriptType(e.target.value as any)}
                className="tm-bg-card border tm-border rounded-lg px-2 py-1 text-xs tm-text focus:outline-none focus:border-blue-500"
              >
                <option value="auto">🔍 Auto</option>
                <option value="powershell">⚡ PowerShell</option>
                <option value="cmd">📟 CMD/BAT</option>
                <option value="vbscript">📜 VBScript</option>
                <option value="python">🐍 Python</option>
              </select>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowScriptPicker(!showScriptPicker)}
                className="flex items-center gap-2 px-3 py-1.5 tm-bg-card border tm-border rounded-lg text-sm tm-text hover:bg-white/10 transition"
              >
                <FileCode2 size={14} /> Importar Script
              </button>
              {showScriptPicker && savedScripts.length > 0 && (
                <div className="absolute right-0 top-full mt-1 w-72 tm-bg-card border tm-border rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                  {savedScripts.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setCommand(s.content); setShowScriptPicker(false); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition border-b tm-border last:border-0"
                    >
                      <span className="tm-text text-sm block">{s.name}</span>
                      <span className="tm-text-muted text-xs">.{s.scriptType} · {s.content.length} caracteres</span>
                    </button>
                  ))}
                </div>
              )}
              {showScriptPicker && savedScripts.length === 0 && (
                <div className="absolute right-0 top-full mt-1 w-60 tm-bg-card border tm-border rounded-lg shadow-xl z-20 p-4 text-center tm-text-muted text-sm">
                  Nenhum script aprovado disponível
                </div>
              )}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-4 space-y-3 font-mono text-sm tm-bg-main">
            {machine.tasks.length === 0 ? (
              <p className="text-gray-600 text-center py-8">Nenhum comando executado ainda</p>
            ) : (
              [...machine.tasks].reverse().map((task) => (
                <div key={task.id} className="border-b tm-border pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(task.status)}
                    <span className="tm-text-muted text-xs">{formatDate(task.createdAt)}</span>
                    {task.createdByName && (
                      <span className="text-gray-600 text-xs">por {task.createdByName}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      task.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                      task.status === 'EXECUTED' ? 'bg-green-500/20 text-green-400' :
                      task.status === 'CANCELLED' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>{getStatusLabel(task.status)}</span>
                    {(task.status === 'PENDING' || task.status === 'RUNNING') && (
                      <button
                        onClick={() => handleCancelTask(task.id)}
                        disabled={cancelling === task.id}
                        className="ml-2 text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition flex items-center gap-1 disabled:opacity-50"
                        title="Cancelar tarefa"
                      >
                        {cancelling === task.id ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />}
                        Cancelar
                      </button>
                    )}
                  </div>
                  <div className="text-cyan-400 mb-1">
                    {(() => {
                      const typeLabels: Record<string, string> = { powershell: 'PS', cmd: 'CMD', vbscript: 'VBS', python: 'PY', auto: 'AUTO' };
                      const cmd = task.command ?? '';
                      const m = cmd.match(/^@@SCRIPTTYPE:(\w+)@@([\s\S]*)/);
                      const displayCmd = m ? m[2] : cmd;
                      const sType = (task as any).scriptType || (m ? m[1] : 'auto');
                      const label = typeLabels[sType] || sType?.toUpperCase() || 'AUTO';
                      return <><span className="tm-text-muted text-xs mr-1">[{label}]</span>$ {displayCmd}</>;
                    })()}
                  </div>
                  {task.result && (
                    <pre className="tm-text whitespace-pre-wrap text-xs bg-black/30 rounded p-2 max-h-40 overflow-y-auto">
                      {task.result}
                    </pre>
                  )}
                  {task.executedAt && (
                    <span className="text-gray-600 text-xs">Executado: {formatDate(task.executedAt)}</span>
                  )}
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>

          <div className="px-4 py-3 border-t tm-border tm-bg-main">
            <div className="flex items-start gap-2">
              <span className="text-green-400 font-mono text-sm mt-2">$</span>
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendCommand(); } }}
                placeholder={`Digite um comando ${scriptType === 'auto' ? 'PowerShell/CMD/VBS/Python' : scriptType.toUpperCase()}... (Shift+Enter para nova linha)`}
                rows={command.includes('\n') ? Math.min(command.split('\n').length + 1, 8) : 1}
                className="flex-1 bg-transparent tm-text font-mono text-sm placeholder-gray-600 focus:outline-none resize-none w-full"
                disabled={sending}
              />
              <button
                onClick={handleSendCommand}
                disabled={sending || !command.trim()}
                className="px-3 py-1.5 bg-accent-blue hover:bg-blue-600 text-white rounded-lg transition flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 mt-0.5"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
