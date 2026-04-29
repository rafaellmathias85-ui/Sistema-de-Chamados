'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Ticket,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  TrendingUp,
  Users,
  AlertCircle,
  Bell,
} from 'lucide-react';

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
}

interface RecentTicket {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  creator: { name: string };
  company: { name: string };
  assignee?: { id: string; name: string } | null;
  alertAssignee?: boolean;
}

export default function DashboardPage() {
  const { data: session } = useSession() || {};
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, ticketsRes] = await Promise.all([
        fetch('/api/tickets/stats'),
        fetch('/api/tickets?limit=5'),
      ]);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        setRecentTickets(ticketsData.tickets || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      name: 'Total de Chamados',
      value: stats?.total || 0,
      icon: Ticket,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-500/10',
    },
    {
      name: 'Abertos',
      value: stats?.open || 0,
      icon: AlertCircle,
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      name: 'Em Andamento',
      value: stats?.inProgress || 0,
      icon: Clock,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-500/10',
    },
    {
      name: 'Resolvidos',
      value: stats?.resolved || 0,
      icon: CheckCircle,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-500/10',
    },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      OPEN: 'bg-yellow-500/20 text-yellow-400',
      IN_PROGRESS: 'bg-purple-500/20 text-purple-400',
      RESOLVED: 'bg-green-500/20 text-green-400',
      CLOSED: 'bg-gray-500/20 tm-text-secondary',
    };
    const labels: Record<string, string> = {
      OPEN: 'Aberto',
      IN_PROGRESS: 'Em Andamento',
      RESOLVED: 'Resolvido',
      CLOSED: 'Fechado',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      LOW: 'bg-gray-500/20 tm-text-secondary',
      MEDIUM: 'bg-blue-500/20 text-blue-400',
      HIGH: 'bg-orange-500/20 text-orange-400',
      CRITICAL: 'bg-red-500/20 text-red-400',
    };
    const labels: Record<string, string> = {
      LOW: 'Baixa',
      MEDIUM: 'Média',
      HIGH: 'Alta',
      CRITICAL: 'Crítica',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[priority]}`}>
        {labels[priority]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text">
            Bem-vindo, {session?.user?.name}
          </h1>
          <p className="tm-text-secondary mt-1">
            Gerencie seus chamados de suporte
          </p>
        </div>
        <Link
          href="/tickets/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-blue to-accent-orange text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={20} />
          Novo Chamado
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="tm-bg-card border tm-border rounded-xl p-5"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`} style={{ color: stat.color.includes('blue') ? '#3B82F6' : stat.color.includes('yellow') ? '#EAB308' : stat.color.includes('purple') ? '#A855F7' : '#22C55E' }} />
              </div>
              <div>
                <p className="text-2xl font-bold tm-text">{stat.value}</p>
                <p className="text-sm tm-text-secondary">{stat.name}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent Tickets */}
      <div className="tm-bg-card border tm-border rounded-xl">
        <div className="p-5 border-b tm-border flex items-center justify-between">
          <h2 className="text-lg font-semibold tm-text">Chamados Recentes</h2>
          <Link
            href="/tickets/list"
            className="text-sm text-accent-blue hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <div className="divide-y divide-white/5">
          {recentTickets.length > 0 ? (
            recentTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className={`flex items-center gap-4 p-4 hover:tm-bg-card transition-colors ${ticket.alertAssignee && ticket.assignee?.id === session?.user?.id ? 'bg-orange-500/5 border-l-2 border-l-orange-400' : ''}`}
              >
                <div className="relative w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center text-accent-blue font-bold text-sm">
                  #{ticket.number}
                  {ticket.alertAssignee && ticket.assignee?.id === session?.user?.id && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 items-center justify-center">
                        <Bell className="h-2.5 w-2.5 tm-text" />
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="tm-text font-medium truncate">{ticket.subject}</p>
                  <p className="text-sm tm-text-secondary truncate">
                    {ticket.company.name} • {ticket.creator.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getPriorityBadge(ticket.priority)}
                  {getStatusBadge(ticket.status)}
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center tm-text-secondary">
              <Ticket className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum chamado encontrado</p>
              <Link
                href="/tickets/new"
                className="inline-flex items-center gap-2 mt-4 text-accent-blue hover:underline"
              >
                <Plus size={16} />
                Criar primeiro chamado
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
