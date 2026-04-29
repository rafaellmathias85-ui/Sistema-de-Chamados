'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Filter,
  Calendar,
  Building2,
  Clock,
  Users,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

interface ReportData {
  total?: number;
  byStatus?: { status: string; _count: { id: number } }[];
  byPriority?: { priority: string; _count: { id: number } }[];
  byCategory?: { categoryId: string; _count: { id: number }; category?: { name: string; color: string } }[];
  recentTickets?: any[];
  timeline?: { date: string; created: number; resolved: number }[];
  summary?: { responseOnTime: number; responseLate: number; resolutionOnTime: number; resolutionLate: number; responseRate: number; resolutionRate: number };
  tickets?: any[];
  performance?: { id: string; name: string; totalTickets: number; resolvedTickets: number; avgResolutionTimeHrs: number; slaCompliance: number }[];
  companies?: { id: string; name: string; totalTickets: number; openTickets: number; resolvedTickets: number; criticalTickets: number }[];
}

// Componente de Gráfico Pizza usando Canvas
function PieChartCanvas({ data, colors, labels }: { data: number[]; colors: string[]; labels: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = data.reduce((a, b) => a + b, 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || total === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 240;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;
    let startAngle = -Math.PI / 2;

    data.forEach((value, i) => {
      if (value === 0) return;
      const sliceAngle = (value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Furo central (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(17, 24, 39, 1)';
    ctx.fill();

    // Texto central
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 8);
    ctx.font = '12px Montserrat, sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('chamados', cx, cy + 14);
  }, [data, colors, total]);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-60 tm-text-muted">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas ref={canvasRef} />
      <div className="flex flex-wrap justify-center gap-3">
        {labels.map((label, i) => (
          data[i] > 0 && (
            <div key={label} className="flex items-center gap-1.5 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[i] }} />
              <span className="tm-text">{label}</span>
              <span className="tm-text font-semibold">{data[i]}</span>
              <span className="tm-text-muted">({Math.round((data[i] / total) * 100)}%)</span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reportData, setReportData] = useState<ReportData>({});
  const [activeTab, setActiveTab] = useState('overview');

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    companyId: '',
    period: 'day'
  });

  useEffect(() => {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    setFilters(prev => ({
      ...prev,
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    }));
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user && ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      loadCompanies();
    }
  }, [session]);

  useEffect(() => {
    if (session?.user && filters.startDate && filters.endDate) {
      loadReport();
    }
  }, [session, activeTab, filters]);

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/companies?limit=1000');
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : (data.companies || []));
      }
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeTab,
        startDate: filters.startDate,
        endDate: filters.endDate,
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(activeTab === 'timeline' && { period: filters.period })
      });

      const res = await fetch(`/api/reports?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xls' | 'pdf') => {
    setExporting(format);
    try {
      const params = new URLSearchParams({
        format,
        type: activeTab,
        startDate: filters.startDate,
        endDate: filters.endDate,
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(activeTab === 'timeline' && { period: filters.period })
      });

      const res = await fetch(`/api/reports/export?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erro ao exportar');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      const extension = format === 'xls' ? 'xlsx' : format;
      a.download = `relatorio_${activeTab}_${dateStr}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar relatório. Tente novamente.');
    } finally {
      setExporting(null);
    }
  };

  const statusLabels: Record<string, string> = {
    OPEN: 'Aberto',
    IN_PROGRESS: 'Em Andamento',
    RESOLVED: 'Resolvido',
    CLOSED: 'Fechado',
    IN_PARTNER: 'Com Parceiro',
    PAUSED: 'Pausado',
    AWAITING_CLIENT: 'Aguardando Cliente'
  };

  const priorityLabels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica'
  };

  const statusColors: Record<string, string> = {
    OPEN: '#3B82F6',
    IN_PROGRESS: '#EAB308',
    RESOLVED: '#22C55E',
    CLOSED: '#6B7280',
    IN_PARTNER: '#A855F7',
    PAUSED: '#F97316',
    AWAITING_CLIENT: '#06B6D4'
  };

  const statusBgClasses: Record<string, string> = {
    OPEN: 'bg-blue-500',
    IN_PROGRESS: 'bg-yellow-500',
    RESOLVED: 'bg-green-500',
    CLOSED: 'bg-gray-500',
    IN_PARTNER: 'bg-purple-500',
    PAUSED: 'bg-orange-500',
    AWAITING_CLIENT: 'bg-cyan-500'
  };

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: PieChart },
    { id: 'timeline', label: 'Timeline', icon: BarChart3 },
    { id: 'sla', label: 'SLA', icon: Clock },
    { id: 'performance', label: 'Performance', icon: Users },
    { id: 'companies', label: 'Empresas', icon: Building2 }
  ];

  // Preparar dados para o gráfico pizza
  const pieData = (() => {
    if (!reportData.byStatus) return { data: [], colors: [], labels: [] };
    
    // Agrupar em 3 categorias: Finalizados (RESOLVED+CLOSED), Pendentes (OPEN+AWAITING_CLIENT+PAUSED), Em Atendimento (IN_PROGRESS+IN_PARTNER)
    const finalizados = reportData.byStatus
      .filter(s => s.status === 'RESOLVED' || s.status === 'CLOSED')
      .reduce((sum, s) => sum + s._count.id, 0);
    const pendentes = reportData.byStatus
      .filter(s => s.status === 'OPEN' || s.status === 'AWAITING_CLIENT' || s.status === 'PAUSED')
      .reduce((sum, s) => sum + s._count.id, 0);
    const emAtendimento = reportData.byStatus
      .filter(s => s.status === 'IN_PROGRESS' || s.status === 'IN_PARTNER')
      .reduce((sum, s) => sum + s._count.id, 0);

    return {
      data: [finalizados, pendentes, emAtendimento],
      colors: ['#22C55E', '#F97316', '#3B82F6'],
      labels: ['Finalizados', 'Pendentes', 'Em Atendimento']
    };
  })();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!session?.user || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-red-400">Acesso não autorizado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text">Relatórios</h1>
          <p className="tm-text-secondary mt-1">Análise detalhada dos chamados</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 disabled:opacity-50 transition-colors"
          >
            {exporting === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            CSV
          </button>
          <button
            onClick={() => handleExport('xls')}
            disabled={exporting !== null}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 disabled:opacity-50 transition-colors"
          >
            {exporting === 'xls' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 disabled:opacity-50 transition-colors"
          >
            {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            PDF
          </button>
        </div>
      </div>

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="tm-bg-card border tm-border rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 tm-text-secondary" />
          <span className="font-medium tm-text">Filtros</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1">Data Início</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 tm-text-muted" />
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:ring-2 focus:ring-blue-500 focus:border-transparent [color-scheme:dark]"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1">Data Fim</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 tm-text-muted" />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:ring-2 focus:ring-blue-500 focus:border-transparent [color-scheme:dark]"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium tm-text-secondary mb-1">Empresa</label>
            <select
              value={filters.companyId}
              onChange={(e) => setFilters(prev => ({ ...prev, companyId: e.target.value }))}
              className="w-full px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="" className="bg-gray-800">Todas as empresas</option>
              {companies.map(c => (
                <option key={c.id} value={c.id} className="bg-gray-800">{c.name}</option>
              ))}
            </select>
          </div>
          
          {activeTab === 'timeline' && (
            <div>
              <label className="block text-sm font-medium tm-text-secondary mb-1">Período</label>
              <select
                value={filters.period}
                onChange={(e) => setFilters(prev => ({ ...prev, period: e.target.value }))}
                className="w-full px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="day" className="bg-gray-800">Diário</option>
                <option value="week" className="bg-gray-800">Semanal</option>
                <option value="month" className="bg-gray-800">Mensal</option>
              </select>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="tm-bg-card border tm-border rounded-xl">
        <div className="border-b tm-border">
          <nav className="flex overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent tm-text-secondary hover:text-gray-200 hover:border-gray-600'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 rounded-xl p-4">
                      <p className="text-blue-300 text-sm">Total de Chamados</p>
                      <p className="text-3xl font-bold mt-1 tm-text">{reportData.total || 0}</p>
                    </div>
                    {reportData.byStatus?.slice(0, 3).map(s => (
                      <div key={s.status} className="tm-bg-card border tm-border rounded-xl p-4">
                        <p className="tm-text-secondary text-sm">{statusLabels[s.status]}</p>
                        <p className="text-2xl font-bold mt-1 tm-text">{s._count.id}</p>
                      </div>
                    ))}
                  </div>

                  {/* Gráfico Pizza - Atendimentos */}
                  <div className="tm-bg-card border tm-border rounded-xl p-6">
                    <h3 className="font-semibold tm-text mb-6 flex items-center gap-2">
                      <PieChart className="w-5 h-5 text-blue-400" />
                      Distribuição de Atendimentos
                    </h3>
                    <PieChartCanvas
                      data={pieData.data}
                      colors={pieData.colors}
                      labels={pieData.labels}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Por Status */}
                    <div className="tm-bg-card border tm-border rounded-xl p-4">
                      <h3 className="font-semibold tm-text mb-4">Por Status</h3>
                      <div className="space-y-3">
                        {reportData.byStatus?.map(s => (
                          <div key={s.status} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${statusBgClasses[s.status]}`} />
                              <span className="tm-text">{statusLabels[s.status]}</span>
                            </div>
                            <span className="font-medium tm-text">{s._count.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Por Prioridade */}
                    <div className="tm-bg-card border tm-border rounded-xl p-4">
                      <h3 className="font-semibold tm-text mb-4">Por Prioridade</h3>
                      <div className="space-y-3">
                        {reportData.byPriority?.map(p => (
                          <div key={p.priority} className="flex items-center justify-between">
                            <span className="tm-text">{priorityLabels[p.priority]}</span>
                            <span className="font-medium tm-text">{p._count.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Por Categoria */}
                  {reportData.byCategory && reportData.byCategory.length > 0 && (
                    <div className="tm-bg-card border tm-border rounded-xl p-4">
                      <h3 className="font-semibold tm-text mb-4">Por Categoria</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {reportData.byCategory.map(c => (
                          <div key={c.categoryId} className="tm-bg-card rounded-lg p-3 border tm-border">
                            <div className="flex items-center gap-2">
                              {c.category?.color && (
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.category.color }} />
                              )}
                              <span className="text-sm tm-text">{c.category?.name || 'Sem nome'}</span>
                            </div>
                            <p className="text-xl font-bold tm-text mt-1">{c._count.id}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Timeline Tab */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b tm-border">
                          <th className="text-left py-3 px-4 font-medium tm-text-secondary">Período</th>
                          <th className="text-right py-3 px-4 font-medium tm-text-secondary">Criados</th>
                          <th className="text-right py-3 px-4 font-medium tm-text-secondary">Resolvidos</th>
                          <th className="text-right py-3 px-4 font-medium tm-text-secondary">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.timeline?.map((t, i) => (
                          <tr key={i} className="border-b tm-border hover:tm-bg-card">
                            <td className="py-3 px-4 tm-text">{t.date}</td>
                            <td className="py-3 px-4 text-right text-blue-400 font-medium">{t.created}</td>
                            <td className="py-3 px-4 text-right text-green-400 font-medium">{t.resolved}</td>
                            <td className={`py-3 px-4 text-right font-medium ${t.created - t.resolved > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {t.created - t.resolved > 0 ? '+' : ''}{t.created - t.resolved}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SLA Tab */}
              {activeTab === 'sla' && reportData.summary && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-green-300 font-medium">Resposta no Prazo</span>
                      </div>
                      <p className="text-3xl font-bold text-green-400 mt-2">{reportData.summary.responseOnTime}</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-300 font-medium">Resposta Atrasada</span>
                      </div>
                      <p className="text-3xl font-bold text-red-400 mt-2">{reportData.summary.responseLate}</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-green-300 font-medium">Resolução no Prazo</span>
                      </div>
                      <p className="text-3xl font-bold text-green-400 mt-2">{reportData.summary.resolutionOnTime}</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-300 font-medium">Resolução Atrasada</span>
                      </div>
                      <p className="text-3xl font-bold text-red-400 mt-2">{reportData.summary.resolutionLate}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="tm-bg-card border tm-border rounded-xl p-6">
                      <h3 className="text-lg font-semibold tm-text mb-2">Taxa de Resposta no Prazo</h3>
                      <span className="text-4xl font-bold text-blue-400">{reportData.summary.responseRate}%</span>
                      <div className="mt-3 bg-white/10 rounded-full h-3">
                        <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${reportData.summary.responseRate}%` }} />
                      </div>
                    </div>
                    <div className="tm-bg-card border tm-border rounded-xl p-6">
                      <h3 className="text-lg font-semibold tm-text mb-2">Taxa de Resolução no Prazo</h3>
                      <span className="text-4xl font-bold text-green-400">{reportData.summary.resolutionRate}%</span>
                      <div className="mt-3 bg-white/10 rounded-full h-3">
                        <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${reportData.summary.resolutionRate}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Tab */}
              {activeTab === 'performance' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b tm-border">
                        <th className="text-left py-3 px-4 font-medium tm-text-secondary">Atendente</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Total</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Resolvidos</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Tempo Médio (h)</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.performance?.map(p => (
                        <tr key={p.id} className="border-b tm-border hover:tm-bg-card">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                                <span className="text-sm font-medium text-blue-400">{p.name.charAt(0)}</span>
                              </div>
                              <span className="font-medium tm-text">{p.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right tm-text">{p.totalTickets}</td>
                          <td className="py-3 px-4 text-right text-green-400 font-medium">{p.resolvedTickets}</td>
                          <td className="py-3 px-4 text-right tm-text">{p.avgResolutionTimeHrs}h</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                              p.slaCompliance >= 90 ? 'bg-green-500/20 text-green-400' :
                              p.slaCompliance >= 70 ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {p.slaCompliance}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Companies Tab */}
              {activeTab === 'companies' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b tm-border">
                        <th className="text-left py-3 px-4 font-medium tm-text-secondary">Empresa</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Total</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Abertos</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Em Andamento</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Resolvidos</th>
                        <th className="text-right py-3 px-4 font-medium tm-text-secondary">Críticos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.companies?.map(c => (
                        <tr key={c.id} className="border-b tm-border hover:tm-bg-card">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-5 h-5 tm-text-muted" />
                              <span className="font-medium tm-text">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-medium tm-text">{c.totalTickets}</td>
                          <td className="py-3 px-4 text-right text-blue-400">{c.openTickets}</td>
                          <td className="py-3 px-4 text-right text-yellow-400">
                            {c.totalTickets - c.openTickets - c.resolvedTickets}
                          </td>
                          <td className="py-3 px-4 text-right text-green-400">{c.resolvedTickets}</td>
                          <td className="py-3 px-4 text-right">
                            {c.criticalTickets > 0 && (
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">
                                {c.criticalTickets}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
