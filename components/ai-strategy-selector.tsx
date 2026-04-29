'use client';
import { useEffect, useState } from 'react';
import { Settings2, Loader2 } from 'lucide-react';

type Strategy = 'failover' | 'round_robin' | 'weighted' | 'task_based' | 'least_latency';

const LABELS: Record<Strategy, string> = {
  failover: 'Failover (P1 → P2 → P3)',
  round_robin: 'Round Robin (alternar)',
  weighted: 'Weighted (por peso)',
  task_based: 'Task Based (por tipo)',
  least_latency: 'Least Latency (mais rápido)',
};

const DESCRIPTIONS: Record<Strategy, string> = {
  failover: 'Sempre tenta o primeiro; demais são backup. Mais conservador.',
  round_robin: 'Distribui as requisições uniformemente entre os provedores ativos.',
  weighted: 'Seleção probabilística usando os pesos AI_WEIGHT_* do .env.',
  task_based: 'Escolhe o melhor provedor para cada tipo (fast/creative/complex).',
  least_latency: 'Sempre escolhe o provedor com menor latência média recente.',
};

export default function AIStrategySelector() {
  const [current, setCurrent] = useState<Strategy>('failover');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/admin/ai-strategy')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.strategy) setCurrent(d.strategy);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (newStrategy: Strategy) => {
    if (newStrategy === current || saving) return;
    setSaving(true);
    setSuccess(false);
    try {
      const r = await fetch('/api/admin/ai-strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: newStrategy }),
      });
      if (r.ok) {
        setCurrent(newStrategy);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await r.json().catch(() => ({}));
        alert(`Erro ao alterar estratégia: ${data.error || r.statusText}`);
      }
    } catch (err: any) {
      alert(`Erro de rede: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs tm-text-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        Carregando estratégia...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Settings2 className="w-4 h-4 text-blue-400" />
      <label className="text-xs tm-text-secondary">Estratégia:</label>
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value as Strategy)}
        disabled={saving}
        className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs tm-text focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
        title={DESCRIPTIONS[current]}
      >
        {(Object.keys(LABELS) as Strategy[]).map((s) => (
          <option key={s} value={s}>{LABELS[s]}</option>
        ))}
      </select>
      {saving && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
      {success && <span className="text-xs text-green-400">✓ Salvo</span>}
    </div>
  );
}
