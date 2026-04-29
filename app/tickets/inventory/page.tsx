'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Search, Monitor, Download, FileText, HardDrive } from 'lucide-react';

interface Machine {
  id: string;
  hostname: string | null;
  username: string | null;
  os: string | null;
  ram: string | null;
  diskModel: string | null;
  diskSize: string | null;
  status: string | null;
  cpuUsage: number | null;
  ramUsage: number | null;
  diskUsage: number | null;
  company: { name: string } | null;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchMachines();
  }, []);

  const fetchMachines = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/inventory?${params.toString()}`);
      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    }
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMachines();
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    if (search) params.set('search', search);
    const a = document.createElement('a');
    a.href = `/api/inventory?${params.toString()}`;
    a.download = 'inventario.csv';
    a.click();
  };

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const a = document.createElement('a');
      a.href = `/api/inventory/export-pdf?${params.toString()}`;
      a.download = 'inventario.pdf';
      a.click();
    } catch (err) {
      console.error('Error exporting PDF:', err);
    }
    // Give time for the download to start
    setTimeout(() => setExportingPdf(false), 3000);
  };

  const getUsageColor = (val: number | null) => {
    if (val == null) return 'tm-text-muted';
    if (val >= 90) return 'text-red-400';
    if (val >= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getUsageBar = (val: number | null) => {
    if (val == null) return null;
    const color = val >= 90 ? 'bg-red-500' : val >= 70 ? 'bg-yellow-500' : 'bg-green-500';
    return (
      <div className="w-full h-1.5 rounded-full bg-white/10 mt-1">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(val, 100)}%` }} />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text">Inventário de Máquinas</h1>
          <p className="tm-text-secondary text-sm mt-1">{machines.length} máquinas encontradas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
          >
            <FileText size={18} />
            {exportingPdf ? 'Gerando...' : 'Exportar PDF'}
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors"
          >
            <Download size={18} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="tm-bg-card border tm-border rounded-xl p-4 flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-blue-500/20"><HardDrive className="w-5 h-5 text-blue-400" /></div>
        <div>
          <p className="text-xl font-bold tm-text">{machines.length}</p>
          <p className="text-xs tm-text-muted">Total de máquinas da sua empresa</p>
        </div>
      </div>

      {/* Filters */}
      <div className="tm-bg-card border tm-border rounded-xl p-4">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-muted" />
            <input
              type="text"
              placeholder="Buscar por hostname, usuário ou SO..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 tm-bg-main border tm-border rounded-lg tm-text text-sm placeholder:tm-text-muted focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : machines.length === 0 ? (
        <div className="tm-bg-card border tm-border rounded-xl p-12 text-center">
          <Monitor className="w-12 h-12 tm-text-muted mx-auto mb-3" />
          <p className="tm-text font-medium">Nenhuma máquina encontrada</p>
          <p className="tm-text-secondary text-sm mt-1">Ajuste os filtros ou aguarde o cadastro de máquinas.</p>
        </div>
      ) : (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b tm-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase">Hostname</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden md:table-cell">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden lg:table-cell">SO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden md:table-cell">RAM</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden lg:table-cell">Disco</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden md:table-cell">CPU %</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden md:table-cell">RAM %</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tm-text-muted uppercase hidden lg:table-cell">Disco %</th>
                </tr>
              </thead>
              <tbody>
                {machines.map(m => (
                  <tr key={m.id} className="border-b tm-border hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 tm-text-secondary flex-shrink-0" />
                        <span className="tm-text font-medium text-sm">{m.hostname || '\u2014'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="tm-text text-sm">{m.username || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="tm-text-secondary text-sm">{m.os || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="tm-text text-sm">{m.ram || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="tm-text-secondary text-sm">{m.diskSize || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-sm font-mono ${getUsageColor(m.cpuUsage)}`}>
                        {m.cpuUsage != null ? `${m.cpuUsage.toFixed(1)}%` : '\u2014'}
                      </span>
                      {getUsageBar(m.cpuUsage)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-sm font-mono ${getUsageColor(m.ramUsage)}`}>
                        {m.ramUsage != null ? `${m.ramUsage.toFixed(1)}%` : '\u2014'}
                      </span>
                      {getUsageBar(m.ramUsage)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-sm font-mono ${getUsageColor(m.diskUsage)}`}>
                        {m.diskUsage != null ? `${m.diskUsage.toFixed(1)}%` : '\u2014'}
                      </span>
                      {getUsageBar(m.diskUsage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
