'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  MessageSquare,
  X,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import Sidebar from '@/components/sidebar';
import ThemeToggle from '@/components/theme-toggle';

export default function TicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifTickets, setNotifTickets] = useState<any[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([]);
  const [rmmAlerts, setRmmAlerts] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  // Toast de alerta de nova interacao
  const [toasts, setToasts] = useState<Array<{ id: string; number: number; subject: string; company: string }>>([]);
  // IDs de alertas ja exibidos (para nao repetir toast enquanto alerta persiste)
  const shownAlertIdsRef = useRef<Set<string>>(new Set());
  // IDs dispensados manualmente (sessao atual)
  const dismissedAlertIdsRef = useRef<Set<string>>(new Set());

  const playAlertBeep = () => {
    try {
      // Tenta um som mais audivel via oscillator
      const AudioCtx = (typeof window !== 'undefined' && ((window as any).AudioContext || (window as any).webkitAudioContext)) as any;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
        setTimeout(() => { try { ctx.close(); } catch {} }, 500);
        return;
      }
    } catch {}
    // Fallback: beep via audio element
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
      audio.volume = 0.4;
      audio.play().catch(() => {});
    } catch {}
  };

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifCount(data.count || 0);
        const newTickets: any[] = data.tickets || [];
        setNotifTickets(newTickets);
        setPendingTransfers(data.pendingTransfers || []);
        setRmmAlerts(data.rmmAlerts || []);

        // Filtrar tickets que:
        // - ainda nao tiveram toast exibido nesta sessao
        // - nao foram dispensados manualmente
        const pendingAlerts = newTickets.filter(
          (t: any) => !shownAlertIdsRef.current.has(t.id) && !dismissedAlertIdsRef.current.has(t.id)
        );

        if (pendingAlerts.length > 0) {
          playAlertBeep();
          pendingAlerts.forEach((t: any) => {
            shownAlertIdsRef.current.add(t.id);
            setToasts((prev) => {
              // Evita duplicatas
              if (prev.some((x) => x.id === t.id)) return prev;
              return [
                ...prev,
                { id: t.id, number: t.number, subject: t.subject, company: t.company?.name || '' },
              ];
            });
            // Auto-dismiss em 20s
            setTimeout(() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }, 20000);
          });
        }

        // Limpar de shownAlertIds aqueles que nao estao mais ativos (alerta foi limpo no backend)
        const activeIds = new Set<string>(newTickets.map((t: any) => t.id));
        shownAlertIdsRef.current.forEach((id) => {
          if (!activeIds.has(id)) {
            shownAlertIdsRef.current.delete(id);
            dismissedAlertIdsRef.current.delete(id);
            // Tambem remove o toast da tela se ainda estiver visivel
            setToasts((prev) => prev.filter((x) => x.id !== id));
          }
        });
      }
    } catch {}
  }, []);

  const dismissToast = (id: string) => {
    dismissedAlertIdsRef.current.add(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'CLIENT') {
      loadNotifications();
      const interval = setInterval(loadNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [status, session, loadNotifications]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen tm-bg-main flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-main)' }}>
      {/* Sidebar */}
      <Sidebar user={session.user} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 border-b border-white/10"
          style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)' }}
        >
          <div className="flex items-center justify-end px-4 py-3">
            <div className="flex items-center gap-4">
              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Notifications - hidden for CLIENT */}
              {session.user.role !== 'CLIENT' && (
                <div className="relative">
                  <button
                    onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false); }}
                    className={`relative p-2 rounded-full transition-all ${
                      notifCount > 0
                        ? 'text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 animate-bell-shake'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title={notifCount > 0 ? `${notifCount} alerta(s) pendente(s)` : 'Notificações'}
                  >
                    <Bell size={20} className={notifCount > 0 ? 'drop-shadow-[0_0_6px_rgba(249,115,22,0.8)]' : ''} />
                    {notifCount > 0 && (
                      <>
                        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-orange-300/40 animate-pulse-badge">
                          {notifCount > 9 ? '9+' : notifCount}
                        </span>
                        <span className="absolute inset-0 rounded-full animate-ping-slow bg-orange-500/20 pointer-events-none" />
                      </>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 tm-bg-card border tm-border rounded-lg shadow-xl z-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">Notificações</span>
                        {notifCount > 0 && (
                          <span className="text-xs text-cyan-400">{notifCount} pendente(s)</span>
                        )}
                      </div>
                      {notifTickets.length === 0 && pendingTransfers.length === 0 && rmmAlerts.length === 0 ? (
                        <div className="px-4 py-8 text-center tm-text-muted text-sm">
                          Nenhuma notificação
                        </div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                          {/* Alertas RMM */}
                          {rmmAlerts.map((alert: any) => (
                            <button
                              key={alert.id}
                              onClick={() => { router.push('/tickets/rmm/alerts'); setNotifOpen(false); }}
                              className="w-full px-4 py-3 text-left hover:bg-white/5 transition border-l-2 border-red-500"
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-semibold text-red-400">⚠️ Alerta RMM</span>
                                <span className="text-[10px] tm-text-muted">{alert.machine?.company?.name}</span>
                              </div>
                              <p className="text-xs tm-text truncate">{alert.message}</p>
                              <p className="text-[10px] tm-text-muted mt-0.5">{alert.machine?.hostname} • {alert.severity}</p>
                            </button>
                          ))}
                          {/* Transferências pendentes */}
                          {pendingTransfers.map((tr: any) => (
                            <div key={tr.id} className="px-4 py-3 border-l-2 border-orange-500">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-orange-400">🔄 Transferência</span>
                                <span className="text-xs tm-text-muted">#{tr.ticket?.number}</span>
                              </div>
                              <p className="text-xs tm-text-secondary truncate">{tr.ticket?.subject}</p>
                              <p className="text-xs tm-text-muted mt-0.5">De: {tr.currentResponsible?.name}</p>
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={async () => {
                                    await fetch('/api/tickets/transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transferId: tr.id, action: 'confirm' }) });
                                    loadNotifications();
                                  }}
                                  className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                >Aceitar</button>
                                <button
                                  onClick={async () => {
                                    await fetch('/api/tickets/transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transferId: tr.id, action: 'reject' }) });
                                    loadNotifications();
                                  }}
                                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                >Recusar</button>
                                <button
                                  onClick={() => { router.push(`/tickets/${tr.ticket?.id}`); setNotifOpen(false); }}
                                  className="px-2 py-1 text-xs tm-bg-card border tm-border tm-text rounded hover:opacity-80 transition-colors"
                                >Ver</button>
                              </div>
                            </div>
                          ))}
                          {/* Alertas de tickets */}
                          {notifTickets.map((t: any) => (
                            <button
                              key={t.id}
                              onClick={() => { router.push(`/tickets/${t.id}`); setNotifOpen(false); }}
                              className="w-full px-4 py-3 text-left hover:bg-white/5 transition"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm tm-text font-medium">#{t.number}</span>
                                <span className="text-xs tm-text-muted">{t.company?.name}</span>
                              </div>
                              <p className="text-xs tm-text-secondary truncate mt-0.5">{t.subject}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false); }}
                  className="flex items-center gap-2 text-gray-400 hover:text-white"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-orange-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {session.user.name?.charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown size={16} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 tm-bg-card border tm-border rounded-lg shadow-xl py-1 z-50">
                    <div className="px-4 py-2 border-b border-white/10">
                      <p className="text-sm font-medium text-white truncate">
                        {session.user.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {session.user.email}
                      </p>
                    </div>
                    {session.user.role === 'ADMIN' && (
                      <button
                        onClick={() => { router.push('/tickets/admin/company'); setUserMenuOpen(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5"
                      >
                        <Settings size={16} />
                        Configurações da Empresa
                      </button>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5"
                    >
                      <LogOut size={16} />
                      Sair
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Toast container - Alertas de nova interacao do cliente */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="tm-bg-card border border-orange-500/60 rounded-xl shadow-2xl p-4 animate-slide-in-right cursor-pointer hover:border-orange-400 transition-all"
              style={{ boxShadow: '0 10px 40px rgba(249,115,22,0.25)' }}
              onClick={() => {
                router.push(`/tickets/${t.id}`);
                dismissToast(t.id);
              }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={18} className="text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold tm-text">
                      Nova interação do cliente
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissToast(t.id);
                      }}
                      className="tm-text-muted hover:tm-text"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-cyan-400 font-mono">#{t.number}</p>
                  <p className="text-xs tm-text-secondary truncate mt-0.5">{t.subject}</p>
                  {t.company && <p className="text-[10px] tm-text-muted mt-0.5">{t.company}</p>}
                  <p className="text-[10px] text-orange-300 mt-1.5 font-medium">Clique para abrir →</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right { animation: slide-in-right 0.35s ease-out; }

        @keyframes bell-shake {
          0%, 100% { transform: rotate(0deg); }
          10%, 30%, 50%, 70%, 90% { transform: rotate(-10deg); }
          20%, 40%, 60%, 80% { transform: rotate(10deg); }
        }
        .animate-bell-shake { animation: bell-shake 1.4s ease-in-out infinite; transform-origin: top center; }

        @keyframes pulse-badge {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.7); }
          50% { transform: scale(1.18); box-shadow: 0 0 0 6px rgba(249,115,22,0); }
        }
        .animate-pulse-badge { animation: pulse-badge 1.2s ease-in-out infinite; }

        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.6; }
          75%, 100% { transform: scale(1.9); opacity: 0; }
        }
        .animate-ping-slow { animation: ping-slow 1.8s cubic-bezier(0,0,0.2,1) infinite; }
      `}</style>
    </div>
  );
}
