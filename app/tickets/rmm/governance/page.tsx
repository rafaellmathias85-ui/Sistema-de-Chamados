'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Shield, Activity, Usb, Globe, HardDrive, Radio,
  Package, ClipboardList, ChevronRight, Loader2,
  Monitor, AlertTriangle, Eye, Users, Database,
} from 'lucide-react';

interface GovStats {
  activitySessions: number;
  usbEvents: number;
  webActivities: number;
  drivers: number;
  relayDiscovered: number;
  agentVersions: number;
  auditLogs: number;
  usbBlocked: number;
  webBlocked: number;
}

export default function GovernanceDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<GovStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    loadStats();
  }, [session]);

  const loadStats = async () => {
    try {
      const [actRes, usbRes, webRes, drvRes, relayRes, verRes, auditRes] = await Promise.all([
        fetch('/api/rmm/governance/activity?limit=1').then(r => r.json()).catch(() => []),
        fetch('/api/rmm/governance/usb-events?limit=1').then(r => r.json()).catch(() => []),
        fetch('/api/rmm/governance/web-activity?limit=1').then(r => r.json()).catch(() => []),
        fetch('/api/rmm/governance/drivers?limit=1').then(r => r.json()).catch(() => []),
        fetch('/api/rmm/relay/discovered').then(r => r.json()).catch(() => []),
        fetch('/api/rmm/agent-versions').then(r => r.json()).catch(() => []),
        fetch('/api/rmm/governance/audit-log?limit=1').then(r => r.json()).catch(() => []),
      ]);
      setStats({
        activitySessions: Array.isArray(actRes) ? actRes.length : 0,
        usbEvents: Array.isArray(usbRes) ? usbRes.length : 0,
        webActivities: Array.isArray(webRes) ? webRes.length : 0,
        drivers: Array.isArray(drvRes) ? drvRes.length : 0,
        relayDiscovered: Array.isArray(relayRes) ? relayRes.length : 0,
        agentVersions: Array.isArray(verRes) ? verRes.length : 0,
        auditLogs: Array.isArray(auditRes) ? auditRes.length : 0,
        usbBlocked: 0,
        webBlocked: 0,
      });
    } catch (e) {
      console.error('Error loading governance stats:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-400" size={32} />
      </div>
    );
  }

  const modules = [
    { href: '/tickets/rmm/governance/activity', icon: Activity, label: 'Atividade de Endpoints', desc: 'Sessões de uso, aplicativos, tempo ativo/ocioso', color: 'text-green-400', border: 'border-green-500/30', count: stats?.activitySessions },
    { href: '/tickets/rmm/governance/usb', icon: Usb, label: 'Controle USB', desc: 'Eventos de dispositivos USB e políticas de bloqueio', color: 'text-orange-400', border: 'border-orange-500/30', count: stats?.usbEvents },
    { href: '/tickets/rmm/governance/web', icon: Globe, label: 'Web Filter', desc: 'Navegação web, categorias bloqueadas e logs de acesso', color: 'text-blue-400', border: 'border-blue-500/30', count: stats?.webActivities },
    { href: '/tickets/rmm/governance/drivers', icon: HardDrive, label: 'Inventário de Drivers', desc: 'Drivers instalados, atualizações disponíveis', color: 'text-purple-400', border: 'border-purple-500/30', count: stats?.drivers },
    { href: '/tickets/rmm/governance/disks', icon: Database, label: 'Saúde dos Discos', desc: 'SMART, temperatura, desgaste, alertas de disco', color: 'text-teal-400', border: 'border-teal-500/30' },
    { href: '/tickets/rmm/governance/relay', icon: Radio, label: 'Relay & Discovery', desc: 'Descoberta de máquinas, deploy remoto via relay', color: 'text-cyan-400', border: 'border-cyan-500/30', count: stats?.relayDiscovered },
    { href: '/tickets/rmm/governance/versions', icon: Package, label: 'Versões do Agente', desc: 'Gerenciar versões, canais de atualização, deploy', color: 'text-yellow-400', border: 'border-yellow-500/30', count: stats?.agentVersions },
    { href: '/tickets/rmm/governance/audit', icon: ClipboardList, label: 'Audit Log', desc: 'Log completo de ações de governance', color: 'text-red-400', border: 'border-red-500/30', count: stats?.auditLogs },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Shield className="text-emerald-400" size={28} />
            Governance & Compliance
          </h1>
          <p className="tm-text-secondary mt-1">Controle, auditoria e conformidade de endpoints</p>
        </div>
        <Link
          href="/tickets/rmm"
          className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm"
        >
          <Monitor size={16} /> Dashboard RMM
        </Link>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Endpoints Monitorados', value: stats?.activitySessions || 0, icon: Monitor, color: 'text-blue-400' },
          { label: 'Eventos USB', value: stats?.usbEvents || 0, icon: Usb, color: 'text-orange-400' },
          { label: 'URLs Monitoradas', value: stats?.webActivities || 0, icon: Globe, color: 'text-cyan-400' },
          { label: 'Máq. Descobertas', value: stats?.relayDiscovered || 0, icon: Radio, color: 'text-purple-400' },
        ].map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="tm-bg-card border tm-border rounded-xl p-4"
          >
            <div className="flex items-center justify-between">
              <card.icon className={card.color} size={20} />
              <p className="text-2xl font-bold tm-text">{card.value}</p>
            </div>
            <p className="text-xs tm-text-secondary mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Module Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod, i) => (
          <Link key={mod.href} href={mod.href}>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className={`tm-bg-card border ${mod.border} rounded-xl p-5 hover:scale-[1.02] transition-all cursor-pointer group`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-white/5 ${mod.color}`}>
                    <mod.icon size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold tm-text group-hover:text-blue-400 transition-colors">{mod.label}</h3>
                    <p className="text-xs tm-text-secondary mt-0.5">{mod.desc}</p>
                  </div>
                </div>
                <ChevronRight className="tm-text-muted group-hover:text-blue-400 transition-colors mt-1" size={18} />
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}
