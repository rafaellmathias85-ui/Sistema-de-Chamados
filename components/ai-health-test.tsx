'use client';

import { useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2, KeyRound, Clock } from 'lucide-react';

type HealthResult = {
  name: string;
  model: string;
  status: 'ok' | 'credit_error' | 'error' | 'timeout' | 'no_key';
  httpStatus?: number;
  latencyMs: number;
  error?: string;
};

type HealthResponse = {
  overall: 'all_ok' | 'partial' | 'all_down';
  okCount: number;
  totalProviders: number;
  results: HealthResult[];
  timestamp: string;
};

const statusConfig: Record<HealthResult['status'], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  ok: { label: 'Operacional', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 },
  credit_error: { label: 'Crédito/Auth', color: 'text-orange-700 bg-orange-50 border-orange-300', icon: KeyRound },
  error: { label: 'Erro', color: 'text-red-700 bg-red-50 border-red-300', icon: XCircle },
  timeout: { label: 'Timeout', color: 'text-yellow-700 bg-yellow-50 border-yellow-300', icon: Clock },
  no_key: { label: 'Sem chave', color: 'text-gray-600 bg-gray-50 border-gray-300', icon: AlertTriangle },
};

export default function AIHealthTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/ai-health', { method: 'POST' });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${r.status}`);
      }
      const data: HealthResponse = await r.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  const overallStyle: Record<HealthResponse['overall'], string> = {
    all_ok: 'text-green-700 bg-green-50 border-green-300',
    partial: 'text-orange-700 bg-orange-50 border-orange-300',
    all_down: 'text-red-700 bg-red-50 border-red-300',
  };

  const overallLabel: Record<HealthResponse['overall'], string> = {
    all_ok: 'Todos os provedores OK',
    partial: 'Funcionamento parcial',
    all_down: 'Todos os provedores offline',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6 border border-gray-200">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-semibold text-gray-900">Teste de Conectividade dos Provedores</h3>
        </div>
        <button
          onClick={runTest}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Testando...
            </>
          ) : (
            <>
              <Activity className="w-4 h-4" />
              Testar Conectividade
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Envia uma mensagem mínima para cada provedor (Abacus, OpenAI, Gemini) em paralelo, com timeout de 10s. Útil para validar a conectividade e o saldo de créditos antes de uma janela crítica.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm mb-4">
          <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className={`p-3 rounded-lg border text-sm font-medium ${overallStyle[result.overall]}`}>
            {overallLabel[result.overall]} ({result.okCount}/{result.totalProviders} provedores OK)
            <span className="text-xs font-normal opacity-75 ml-2">
              {new Date(result.timestamp).toLocaleString('pt-BR')}
            </span>
          </div>

          <div className="grid gap-2">
            {result.results.map(r => {
              const cfg = statusConfig[r.status];
              const Icon = cfg.icon;
              return (
                <div
                  key={r.name}
                  className={`p-3 rounded-lg border ${cfg.color}`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-semibold text-sm">{r.name}</span>
                      <span className="text-xs opacity-75">({r.model})</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold uppercase">{cfg.label}</span>
                      {r.httpStatus !== undefined && (
                        <span className="opacity-75">HTTP {r.httpStatus}</span>
                      )}
                      <span className="opacity-75">{r.latencyMs}ms</span>
                    </div>
                  </div>
                  {r.error && (
                    <p className="mt-2 text-xs opacity-80 break-words font-mono">
                      {r.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {result.overall === 'partial' && (
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs">
              ℹ️ O sistema continuará funcionando normalmente: as requisições serão roteadas automaticamente para os provedores OK via failover.
            </div>
          )}
          {result.overall === 'all_down' && (
            <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs">
              ⚠️ Todos os provedores estão indisponíveis. Verifique créditos/chaves.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
