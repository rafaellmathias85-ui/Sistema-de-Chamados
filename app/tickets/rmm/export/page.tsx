'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Download,
  ArrowLeft,
  FileSpreadsheet,
  Building2,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

const AVAILABLE_FIELDS = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'username', label: 'Usuário Logado' },
  { key: 'os', label: 'Sistema Operacional' },
  { key: 'ram', label: 'RAM' },
  { key: 'cpuModel', label: 'Processador' },
  { key: 'ipAddress', label: 'IP Local' },
  { key: 'publicIp', label: 'IP Público' },
  { key: 'diskSize', label: 'Disco' },
  { key: 'gpuInfo', label: 'GPU' },
  { key: 'status', label: 'Status' },
  { key: 'lastCheckin', label: 'Último Checkin' },
  { key: 'company', label: 'Empresa' },
];

export default function ExportPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(AVAILABLE_FIELDS.map(f => f.key)));
  const [format, setFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/companies?limit=500').then(r => r.json()).then(d => setCompanies(Array.isArray(d) ? d : d.companies || []));
  }, []);

  const toggleField = (key: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) { alert('Selecione ao menos um campo'); return; }
    setExporting(true);
    try {
      const fields = Array.from(selectedFields).join(',');
      const url = `/api/rmm/export?format=${format}&fields=${fields}${selectedCompany ? `&companyId=${selectedCompany}` : ''}`;
      
      if (format === 'csv') {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `rmm_machines_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
      } else {
        // For JSON format (could be used for PDF/XLS client-side generation)
        const res = await fetch(url);
        const data = await res.json();
        // Generate simple CSV from JSON data
        const header = data.fields.join(',');
        const rows = data.data.map((row: Record<string, string>) => data.fields.map((f: string) => `"${(row[f] || '').replace(/"/g, '""')}"`).join(','));
        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `rmm_machines_${new Date().toISOString().slice(0,10)}.${format}`;
        a.click();
      }
    } catch { alert('Erro ao exportar'); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets/rmm" className="p-2 tm-text-secondary hover:tm-text transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold tm-text">Exportar Máquinas</h1>
      </div>

      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-6">
        {/* Company filter */}
        <div>
          <label className="block text-sm font-medium tm-text-secondary mb-2">Filtrar por Empresa</label>
          <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="w-full max-w-md px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500">
            <option value="">Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Fields selection */}
        <div>
          <label className="block text-sm font-medium tm-text-secondary mb-2">Campos para exportar</label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {AVAILABLE_FIELDS.map(f => (
              <button key={f.key} onClick={() => toggleField(f.key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selectedFields.has(f.key) ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'bg-gray-900 text-white-muted border border-gray-700'}`}>
                {selectedFields.has(f.key) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setSelectedFields(new Set(AVAILABLE_FIELDS.map(f => f.key)))} className="text-xs text-blue-400 hover:underline">Selecionar todos</button>
            <button onClick={() => setSelectedFields(new Set())} className="text-xs tm-text-secondary hover:underline">Limpar</button>
          </div>
        </div>

        {/* Format */}
        <div>
          <label className="block text-sm font-medium tm-text-secondary mb-2">Formato</label>
          <div className="flex gap-2">
            {['csv', 'xls'].map(f => (
              <button key={f} onClick={() => setFormat(f)} className={`px-4 py-2 rounded-lg text-sm transition-colors ${format === f ? 'bg-blue-600 tm-text' : 'bg-gray-900 text-white-secondary border border-gray-700'}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Export button */}
        <button onClick={handleExport} disabled={exporting || selectedFields.size === 0} className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium">
          {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          Exportar {format.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
