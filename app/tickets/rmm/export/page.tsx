'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  Download,
  ArrowLeft,
  CheckSquare,
  Square,
  Loader2,
  FileText,
  Printer,
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

interface TenantInfo { logoUrl: string | null; name: string; }

export default function ExportPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(AVAILABLE_FIELDS.map(f => f.key)));
  const [format, setFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [pdfData, setPdfData] = useState<{ fields: string[]; data: Record<string, string>[] } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/companies?limit=500').then(r => r.json()).then(d => setCompanies(Array.isArray(d) ? d : d.companies || []));
    fetch('/api/admin/tenant').then(r => r.ok ? r.json() : null).then(d => { if (d) setTenant(d); }).catch(() => {});
  }, []);

  const toggleField = (key: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handlePdfExport = async () => {
    if (selectedFields.size === 0) { alert('Selecione ao menos um campo'); return; }
    setExporting(true);
    try {
      const fields = Array.from(selectedFields).join(',');
      const url = `/api/rmm/export?format=json&fields=${fields}${selectedCompany ? `&companyId=${selectedCompany}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      setPdfData(json);
      // Wait for render then print
      setTimeout(() => {
        const printContent = printRef.current;
        if (!printContent) return;
        const win = window.open('', '_blank', 'width=1100,height=800');
        if (!win) { alert('Permita popups para gerar o PDF'); return; }
        const companyName = tenant?.name || 'Winner Tecnologia';
        const logoHtml = tenant?.logoUrl ? `<img src="${tenant.logoUrl}" alt="Logo" style="max-height:60px;max-width:200px;object-fit:contain;" />` : '';
        const selectedCompanyName = selectedCompany ? companies.find(c => c.id === selectedCompany)?.name || '' : 'Todas';
        const date = new Date().toLocaleDateString('pt-BR');
        const totalMachines = json.data?.length || 0;
        win.document.write(`<!DOCTYPE html><html><head><title>Inventário de Máquinas - ${companyName}</title><style>
          @page { size: landscape; margin: 15mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #3B82F6; padding-bottom: 12px; margin-bottom: 16px; }
          .header-left { display: flex; align-items: center; gap: 16px; }
          .header-right { text-align: right; font-size: 12px; color: #666; }
          h1 { font-size: 20px; margin: 0; color: #1e293b; }
          .meta { font-size: 11px; color: #64748b; margin-bottom: 12px; display: flex; gap: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #1e293b; color: #fff; padding: 8px 6px; text-align: left; font-weight: 600; white-space: nowrap; }
          td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          tr:hover { background: #e2e8f0; }
          .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #94a3b8; text-align: center; }
          .status-online { color: #16a34a; font-weight: 600; }
          .status-offline { color: #dc2626; font-weight: 600; }
          @media print { body { padding: 0; } }
        </style></head><body>
          <div class="header">
            <div class="header-left">${logoHtml}<div><h1>Inventário de Máquinas</h1><span style="font-size:13px;color:#475569;">${companyName}</span></div></div>
            <div class="header-right">Data: ${date}<br/>Total: ${totalMachines} máquina(s)<br/>Empresa: ${selectedCompanyName}</div>
          </div>
          <table><thead><tr>${(json.fields || []).map((f: string) => `<th>${f}</th>`).join('')}</tr></thead><tbody>${(json.data || []).map((row: Record<string, string>) => `<tr>${(json.fields || []).map((f: string) => {
            const val = row[f] || '';
            const cls = f === 'Status' ? (val.toLowerCase() === 'online' ? ' class="status-online"' : val.toLowerCase() === 'offline' ? ' class="status-offline"' : '') : '';
            return `<td${cls}>${val}</td>`;
          }).join('')}</tr>`).join('')}</tbody></table>
          <div class="footer">Relatório gerado por ${companyName} em ${date} — Sistema de Gestão de TI</div>
        </body></html>`);
        win.document.close();
        setTimeout(() => { win.print(); }, 500);
      }, 100);
    } catch { alert('Erro ao gerar PDF'); }
    finally { setExporting(false); }
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) { alert('Selecione ao menos um campo'); return; }
    if (format === 'pdf') { handlePdfExport(); return; }
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
        const res = await fetch(url);
        const data = await res.json();
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
            {[
              { key: 'csv', label: 'CSV', icon: Download },
              { key: 'xls', label: 'XLS', icon: Download },
              { key: 'pdf', label: 'PDF', icon: FileText },
            ].map(f => (
              <button key={f.key} onClick={() => setFormat(f.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${format === f.key ? 'bg-blue-600 text-white' : 'bg-gray-900 tm-text-secondary border border-gray-700'}`}>
                <f.icon className="w-4 h-4" />
                {f.label}
              </button>
            ))}
          </div>
          {format === 'pdf' && (
            <p className="text-xs tm-text-muted mt-2 flex items-center gap-1">
              <Printer className="w-3 h-3" /> O PDF será gerado com logo da empresa e layout profissional para impressão
            </p>
          )}
        </div>

        {/* Export button */}
        <button onClick={handleExport} disabled={exporting || selectedFields.size === 0} className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium">
          {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : format === 'pdf' ? <FileText className="w-5 h-5" /> : <Download className="w-5 h-5" />}
          {format === 'pdf' ? 'Gerar PDF' : `Exportar ${format.toUpperCase()}`}
        </button>
      </div>
      {/* Hidden ref for PDF data */}
      <div ref={printRef} className="hidden" />
    </div>
  );
}
