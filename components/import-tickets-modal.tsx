'use client';

import { useState } from 'react';
import { X, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportTicketsModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

interface ImportResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export default function ImportTicketsModal({ onClose, onSuccess }: ImportTicketsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/tickets/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao importar');
      } else {
        setResult(data);
        onSuccess?.();
      }
    } catch (e: any) {
      setError(e.message || 'Erro de rede');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border overflow-hidden"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Importar Chamados</h2>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Formatos suportados: <strong>CSV</strong>, <strong>XLSX</strong> e <strong>JSON</strong>.
            <br />
            Colunas esperadas (pt/en): <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>numero</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>assunto</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>descricao</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>status</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>prioridade</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>empresa</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>empresaDominio</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>solicitante</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>solicitanteEmail</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>responsavel</code>,{' '}
            <code style={{ background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 4 }}>responsavelEmail</code>
            <br />
            <span className="text-xs opacity-70">Empresa e usuários são criados automaticamente se não existirem.</span>
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Arquivo</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {result && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.08)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }}>
              <div className="flex items-center gap-2 font-medium mb-1">
                <CheckCircle size={16} /> Importação concluída
              </div>
              <div className="text-xs space-y-0.5">
                <div>Criados: <strong>{result.created}</strong></div>
                <div>Atualizados: <strong>{result.updated}</strong></div>
                <div>Ignorados: <strong>{result.skipped}</strong></div>
                {result.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-orange-300">Ver {result.errors.length} aviso(s)</summary>
                    <ul className="mt-1 list-disc ml-4 max-h-32 overflow-y-auto text-xs opacity-90">
                      {result.errors.slice(0, 50).map((e, i) => (<li key={i}>{e}</li>))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
            Fechar
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || importing}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importing ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
