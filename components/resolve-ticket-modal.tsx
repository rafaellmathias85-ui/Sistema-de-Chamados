'use client';

import { useState } from 'react';
import { DollarSign, Lock, ArrowLeft, X, AlertTriangle, Clock } from 'lucide-react';

interface ResolveTicketModalProps {
  ticketId: string;
  ticketNumber?: number;
  ticketSubject?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'decision' | 'time_edit' | 'finance_form' | 'confirm_close';

function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export default function ResolveTicketModal({
  ticketId,
  ticketNumber,
  ticketSubject,
  onClose,
  onSuccess,
}: ResolveTicketModalProps) {
  const [step, setStep] = useState<Step>('decision');
  const [valor, setValor] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Time editing state
  const [wantEditTime, setWantEditTime] = useState(false);
  const [serviceStart, setServiceStart] = useState(formatDateTimeLocal(new Date()));
  const [serviceEnd, setServiceEnd] = useState(formatDateTimeLocal(new Date()));
  // Where to go after time edit (finance or close)
  const [nextAfterTime, setNextAfterTime] = useState<'finance_form' | 'confirm_close'>('confirm_close');

  const resolveAndClose = async (forwardFinance: boolean) => {
    setLoading(true);
    setError('');
    try {
      const body: any = {
        status: 'CLOSED',
        resolveFlow: true,
      };
      if (forwardFinance) {
        body.forwardToFinance = true;
        body.financialValue = parseFloat(valor.replace(',', '.')) || 0;
        body.financialNotes = observacoes;
      }
      // Send service times if edited
      if (wantEditTime && serviceStart && serviceEnd) {
        body.serviceStartedAt = new Date(serviceStart).toISOString();
        body.serviceEndedAt = new Date(serviceEnd).toISOString();
      }
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erro ao fechar chamado');
        return;
      }
      onSuccess();
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = (target: 'finance_form' | 'confirm_close') => {
    setNextAfterTime(target);
    setStep('time_edit');
  };

  const handleTimeNext = () => {
    if (wantEditTime) {
      if (!serviceStart || !serviceEnd) {
        setError('Preencha as datas de início e término');
        return;
      }
      if (new Date(serviceEnd) <= new Date(serviceStart)) {
        setError('A data de término deve ser posterior ao início');
        return;
      }
    }
    setError('');
    setStep(nextAfterTime);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--modal-overlay)' }}>
      <div
        className="w-full max-w-md rounded-xl border shadow-xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              ✅ Chamado Resolvido
            </h2>
            {ticketNumber && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                #{ticketNumber} {ticketSubject ? `— ${ticketSubject}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }} className="hover:opacity-80">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {/* Step 1: Decision */}
          {step === 'decision' && (
            <div className="space-y-3">
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Deseja encaminhar para o Financeiro antes de fechar?
              </p>

              <button
                onClick={() => handleDecision('finance_form')}
                className="w-full p-4 rounded-lg border text-left transition-all hover:border-green-500/50"
                style={{ background: 'var(--hover-bg)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center text-green-400">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      💰 Sim, enviar ao Financeiro
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Definir valor e observações antes de fechar
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDecision('confirm_close')}
                className="w-full p-4 rounded-lg border text-left transition-all hover:border-gray-500/50"
                style={{ background: 'var(--hover-bg)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-500/15 flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                    <Lock size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      🔒 Não, apenas fechar
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Fechar o chamado sem envio financeiro
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={onClose}
                className="w-full text-center text-sm py-2 mt-2" style={{ color: 'var(--text-muted)' }}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Step 2: Time Edit */}
          {step === 'time_edit' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Horário do Atendimento
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Deseja editar a hora de início e término do chamado?
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setWantEditTime(true); }}
                  className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                    wantEditTime
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : ''
                  }`}
                  style={!wantEditTime ? { background: 'var(--hover-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } : {}}
                >
                  ✅ Sim, editar
                </button>
                <button
                  onClick={() => { setWantEditTime(false); }}
                  className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                    !wantEditTime
                      ? 'border-gray-500 bg-gray-500/10 text-gray-300'
                      : ''
                  }`}
                  style={wantEditTime ? { background: 'var(--hover-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } : {}}
                >
                  ❌ Não, manter automático
                </button>
              </div>

              {wantEditTime && (
                <div className="space-y-3 p-4 rounded-lg border" style={{ background: 'var(--hover-bg)', borderColor: 'var(--border-color)' }}>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Início do Atendimento
                    </label>
                    <input
                      type="datetime-local"
                      value={serviceStart}
                      onChange={(e) => setServiceStart(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Término do Atendimento
                    </label>
                    <input
                      type="datetime-local"
                      value={serviceEnd}
                      onChange={(e) => setServiceEnd(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setStep('decision'); setError(''); }}
                  className="flex items-center gap-1 px-4 py-2 text-sm rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
                <button
                  onClick={handleTimeNext}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 3a: Finance Form */}
          {step === 'finance_form' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Valor (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Observações (visível apenas internamente)
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  placeholder="Notas sobre o serviço prestado..."
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('time_edit')}
                  className="flex items-center gap-1 px-4 py-2 text-sm rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
                <button
                  onClick={() => resolveAndClose(true)}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : '💰 Enviar ao Financeiro e Fechar'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3b: Confirm Close */}
          {step === 'confirm_close' && (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400 font-medium">
                  ⚠️ O chamado será fechado sem envio ao Financeiro. Esta ação não poderá ser desfeita.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('time_edit')}
                  className="flex items-center gap-1 px-4 py-2 text-sm rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
                <button
                  onClick={() => resolveAndClose(false)}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Fechando...' : '🔒 Confirmar Fechamento'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
