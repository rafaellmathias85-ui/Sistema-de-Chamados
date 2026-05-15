'use client';

import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';

interface MachineOption {
  id: string;
  hostname: string;
  company: { id: string; name: string };
}

interface MachineFilterProps {
  value: string;
  onChange: (machineId: string) => void;
  className?: string;
}

export default function MachineFilter({ value, onChange, className }: MachineFilterProps) {
  const [machines, setMachines] = useState<MachineOption[]>([]);

  useEffect(() => {
    fetch('/api/rmm/machines')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.machines || [];
        setMachines(list.sort((a: MachineOption, b: MachineOption) => a.hostname.localeCompare(b.hostname)));
      })
      .catch(() => {});
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Monitor size={16} className="tm-text-muted flex-shrink-0" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm min-w-[200px]"
      >
        <option value="">⬅ Selecione uma máquina</option>
        {machines.map(m => (
          <option key={m.id} value={m.id}>
            {m.hostname} ({m.company?.name || '—'})
          </option>
        ))}
      </select>
    </div>
  );
}
