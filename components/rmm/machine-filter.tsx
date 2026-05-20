'use client';

import { useEffect, useState, useMemo } from 'react';
import { Monitor, Building2, Search, Wifi } from 'lucide-react';

interface MachineOption {
  id: string;
  hostname: string;
  ipAddress?: string | null;
  agentVersion?: string | null;
  status?: string | null;
  company: { id: string; name: string };
}

interface MachineFilterProps {
  value: string;
  onChange: (machineId: string) => void;
  className?: string;
}

export default function MachineFilter({ value, onChange, className }: MachineFilterProps) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/api/rmm/machines')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.machines || [];
        setMachines(list.sort((a: MachineOption, b: MachineOption) => a.hostname.localeCompare(b.hostname)));
      })
      .catch(() => {});
  }, []);

  // Extrair empresas únicas
  const companies = useMemo(() => {
    const map = new Map<string, string>();
    machines.forEach(m => {
      if (m.company?.id && m.company?.name) {
        map.set(m.company.id, m.company.name);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [machines]);

  // Filtrar máquinas por empresa selecionada e busca
  const filteredMachines = useMemo(() => {
    let list = machines;
    if (selectedCompany) {
      list = list.filter(m => m.company?.id === selectedCompany);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(m =>
        m.hostname.toLowerCase().includes(term) ||
        (m.ipAddress || '').toLowerCase().includes(term) ||
        (m.company?.name || '').toLowerCase().includes(term)
      );
    }
    return list;
  }, [machines, selectedCompany, searchTerm]);

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompany(companyId);
    onChange('');
  };

  const handleMachineChange = (machineId: string) => {
    onChange(machineId);
  };

  // Helper: indicador de versão do agente
  // V3+ = verde, V2 = azul, V1/sem versão = cinza
  const getVersionIndicator = (m: MachineOption) => {
    if (!m.agentVersion) return '⚪'; // sem agente
    if (m.agentVersion.startsWith('3')) return '🟢'; // V3
    if (m.agentVersion.startsWith('2')) return '🔵'; // V2
    return '⚫'; // V1 ou outro
  };

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Filtro por empresa */}
        <div className="flex items-center gap-2 flex-1">
          <Building2 size={16} className="tm-text-muted flex-shrink-0" />
          <select
            value={selectedCompany}
            onChange={e => handleCompanyChange(e.target.value)}
            className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm"
          >
            <option value="">Todas as empresas ({companies.length})</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Filtro por máquina — indicador: ⚫ V1 | 🔵 V2 | 🟢 V3 | ⚪ sem agente */}
        <div className="flex items-center gap-2 flex-1">
          <Monitor size={16} className="tm-text-muted flex-shrink-0" />
          <select
            value={value}
            onChange={e => handleMachineChange(e.target.value)}
            className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm"
          >
            <option value="">Selecione uma máquina ({filteredMachines.length})</option>
            {filteredMachines.map(m => (
              <option key={m.id} value={m.id}>
                {getVersionIndicator(m)} {m.hostname}{m.ipAddress ? ` (${m.ipAddress})` : ''}
                {!selectedCompany && m.company?.name ? ` — ${m.company.name}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Campo de busca direta */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={14} />
        <input
          type="text"
          placeholder="Buscar por hostname, IP ou empresa..."
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            if (e.target.value.trim()) onChange('');
          }}
          className="w-full pl-9 pr-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-xs"
        />
      </div>
    </div>
  );
}
