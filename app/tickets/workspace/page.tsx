'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Columns3,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  User,
  Building2,
  Send,
  Lock,
  ChevronDown,
  MessageSquare,
  Paperclip,
  File,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  ArrowUpRight,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import ResolveTicketModal from '@/components/resolve-ticket-modal';
import EmailHtmlViewer from '@/components/email-html-viewer';
import TicketReplyBlock from '@/components/ticket-reply-block';

interface TicketListItem {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  alertAssignee: boolean;
  company: { name: string };
  assignee?: { name: string } | null;
  creator: { name: string };
  _count?: { messages: number };
}

interface TicketDetail {
  id: string;
  number: number;
  subject: string;
  description: string;
  descriptionHtml?: string | null;
  source?: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  firstResponseAt: string | null;
  reopenCount: number;
  companyId: string;
  company: { name: string };
  creator: { name: string; email: string };
  assignee?: { id: string; name: string } | null;
  assigneeId: string | null;
  category?: { name: string; color: string } | null;
  messages: {
    id: string;
    content: string;
    contentHtml?: string | null;
    bodyClean?: string | null;
    bodyQuoted?: string | null;
    bodyParseMethod?: string | null;
    isInternal: boolean;
    createdAt: string;
    authorName: string;
    authorRole: string;
  }[];
  attachments?: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedByName: string;
    createdAt: string;
    downloadUrl?: string;
  }[];
}

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto', IN_PROGRESS: 'Em Andamento', IN_PARTNER: 'Parceiro',
  PAUSED: 'Pausado', AWAITING_CLIENT: 'Aguard. Cliente',
  RESOLVED: 'Resolvido', CLOSED: 'Fechado',
};
const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-500', IN_PROGRESS: 'bg-cyan-500', IN_PARTNER: 'bg-purple-500',
  PAUSED: 'bg-gray-400', AWAITING_CLIENT: 'bg-yellow-500',
  RESOLVED: 'bg-green-500', CLOSED: 'bg-gray-500',
};
const priorityLabels: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
const priorityColors: Record<string, string> = { LOW: 'text-green-400', MEDIUM: 'text-yellow-400', HIGH: 'text-orange-400', CRITICAL: 'text-red-400' };

type ViewType = 'all' | 'mine' | 'group' | 'awaiting_client' | 'unassigned' | 'sla_expiring' | 'recently_closed' | 'recently_reopened';

export default function WorkspacePageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /></div>}>
      <WorkspacePage />
    </Suspense>
  );
}

function WorkspacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolveTicketId, setResolveTicketId] = useState<string | null>(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partnerCompanies, setPartnerCompanies] = useState<{id:string;name:string}[]>([]);
  const [selectedPartner, setSelectedPartner] = useState('');
  const [partnerNote, setPartnerNote] = useState('');
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [view, setView] = useState<ViewType>('all');
  const [search, setSearch] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [updatingField, setUpdatingField] = useState('');
  const [uploading, setUploading] = useState(false);

  // Helper: format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    if (file.size > 100 * 1024 * 1024) {
      alert('Arquivo muito grande. Máximo 100MB.');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload para S3 via helper
      const { uploadFile } = await import('@/lib/upload-helper');
      const { cloudStoragePath } = await uploadFile(file, false);

      // 2. Registrar no banco
      const res = await fetch(`/api/tickets/${selectedId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          cloudStoragePath,
          isPublic: false,
        }),
      });
      if (res.ok) {
        loadDetail(selectedId);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Erro ao registrar anexo:', err);
        alert('Erro ao enviar anexo. Tente novamente.');
      }
    } catch (err) {
      console.error('Erro ao enviar anexo:', err);
      alert('Erro ao enviar anexo. Tente novamente.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!selectedId) return;
    if (!confirm('Excluir este anexo?')) return;
    try {
      const res = await fetch(`/api/tickets/${selectedId}/attachments?attachmentId=${attachmentId}`, {
        method: 'DELETE',
      });
      if (res.ok) loadDetail(selectedId);
    } catch (err) {
      console.error('Erro ao excluir anexo:', err);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    else if (status === 'authenticated' && !['ADMIN', 'SUPPORT'].includes(session?.user?.role || '')) {
      router.push('/tickets');
    }
  }, [status, session, router]);

  // Load staff list for assignee dropdown
  useEffect(() => {
    if (status === 'authenticated') {
      Promise.all([
        fetch('/api/users?role=SUPPORT&limit=100').then((r) => r.ok ? r.json() : { users: [] }),
        fetch('/api/users?role=ADMIN&limit=100').then((r) => r.ok ? r.json() : { users: [] }),
      ]).then(([sup, adm]) => {
        const all = [...(sup.users || sup || []), ...(adm.users || adm || [])];
        setStaffList(all.map((u: any) => ({ id: u.id, name: u.name })));
      })
        .catch(() => {});
    }
  }, [status]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('pageSize', '100');
      if (search) params.set('search', search);

      switch (view) {
        case 'mine':
          if (session?.user?.id) params.set('assigneeId', session.user.id);
          params.set('status', 'OPEN,IN_PROGRESS,AWAITING_CLIENT');
          break;
        case 'group':
          params.set('status', 'OPEN,IN_PROGRESS,AWAITING_CLIENT,PAUSED,IN_PARTNER');
          break;
        case 'awaiting_client':
          params.set('status', 'AWAITING_CLIENT');
          break;
        case 'unassigned':
          params.set('unassigned', 'true');
          params.set('status', 'OPEN');
          break;
        case 'sla_expiring':
          params.set('slaExpiring', 'true');
          break;
        case 'recently_closed':
          params.set('status', 'CLOSED,RESOLVED');
          params.set('sort', 'updatedAt');
          params.set('order', 'desc');
          break;
        case 'recently_reopened':
          params.set('reopened', 'true');
          break;
        default:
          params.set('status', 'OPEN,IN_PROGRESS,AWAITING_CLIENT');
      }

      const res = await fetch(`/api/tickets?${params}`);
      if (res.ok) {
        const json = await res.json();
        setTickets(json.tickets || json || []);
      }
    } catch (err) {
      console.error('Erro ao carregar chamados:', err);
    }
    setLoading(false);
  }, [view, search, session]);

  useEffect(() => {
    if (status === 'authenticated') loadTickets();
  }, [status, loadTickets]);

  // Load detail
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Carregar anexos em paralelo (com downloadUrl assinado)
        try {
          const attRes = await fetch(`/api/tickets/${id}/attachments`);
          if (attRes.ok) {
            const attData = await attRes.json();
            data.attachments = Array.isArray(attData) ? attData : (attData.attachments || []);
          }
        } catch { /* ignora */ }
        setDetail(data);
      }
    } catch (err) {
      console.error('Erro ao carregar detalhe:', err);
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages]);

  // Pre-select from URL
  useEffect(() => {
    const tid = searchParams.get('ticket');
    if (tid) setSelectedId(tid);
  }, [searchParams]);

  const handleSendReply = async () => {
    if (!replyContent.trim() || !selectedId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tickets/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent, isInternal }),
      });
      if (res.ok) {
        setReplyContent('');
        loadDetail(selectedId);
      }
    } catch (err) {
      console.error('Erro ao enviar:', err);
    }
    setSending(false);
  };

  const handleConfirmPartner = async () => {
    if (!selectedId || !selectedPartner) return;
    setLoadingPartners(true);
    try {
      const res = await fetch(`/api/tickets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PARTNER' }),
      });
      if (res.ok) {
        const partnerName = partnerCompanies.find(c => c.id === selectedPartner)?.name || 'Parceiro';
        const noteContent = `Chamado encaminhado para parceiro: ${partnerName}${partnerNote ? `\nObservação: ${partnerNote}` : ''}`;
        await fetch(`/api/tickets/${selectedId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: noteContent, isInternal: true }),
        });
        loadDetail(selectedId);
        loadTickets();
      }
    } catch (err) {
      console.error('Erro ao atualizar parceiro:', err);
    }
    setShowPartnerModal(false);
    setSelectedPartner('');
    setPartnerNote('');
    setLoadingPartners(false);
  };

  const updateTicketField = async (field: string, value: string) => {
    if (!selectedId) return;
    // Intercept: RESOLVED opens resolve modal, CLOSED blocked, IN_PARTNER opens partner modal
    if (field === 'status') {
      if (value === 'RESOLVED' && detail?.status !== 'RESOLVED' && detail?.status !== 'CLOSED') {
        setResolveTicketId(selectedId);
        return;
      }
      if (value === 'IN_PARTNER' && detail?.status !== 'IN_PARTNER') {
        setLoadingPartners(true);
        setShowPartnerModal(true);
        try {
          const res = await fetch('/api/companies?clientType=PARCEIRO');
          if (res.ok) {
            const data = await res.json();
            setPartnerCompanies(Array.isArray(data) ? data : (data.companies || []));
          }
        } catch (err) {
          console.error('Erro ao carregar parceiros:', err);
        }
        setLoadingPartners(false);
        return;
      }
      if (value === 'CLOSED') return;
    }
    setUpdatingField(field);
    try {
      const body: any = {};
      body[field] = value;
      const res = await fetch(`/api/tickets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        loadDetail(selectedId);
        loadTickets();
      }
    } catch (err) {
      console.error('Erro ao atualizar:', err);
    }
    setUpdatingField('');
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const formatDateShort = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const slaStatus = (dueAt: string | null) => {
    if (!dueAt) return null;
    const diff = new Date(dueAt).getTime() - Date.now();
    if (diff < 0) return 'breached';
    if (diff < 4 * 3600000) return 'at_risk';
    return 'ok';
  };

  if (status === 'loading' || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const views: { key: ViewType; label: string }[] = [
    { key: 'all', label: 'Ativos' },
    { key: 'mine', label: 'Meus' },
    { key: 'group', label: 'Do grupo' },
    { key: 'awaiting_client', label: 'Aguard. cliente' },
    { key: 'unassigned', label: 'Sem responsável' },
    { key: 'sla_expiring', label: 'Vencendo SLA' },
    { key: 'recently_closed', label: 'Fechados' },
    { key: 'recently_reopened', label: 'Reabertos' },
  ];

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6 -mt-2">
      {/* Column 1: Ticket List */}
      <div className="w-80 xl:w-96 flex-shrink-0 border-r tm-border flex flex-col tm-bg-main">
        {/* Views tabs */}
        <div className="flex gap-1 p-2 border-b tm-border overflow-x-auto">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setSelectedId(null); }}
              className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition ${
                view === v.key
                  ? 'bg-cyan-600 text-white'
                  : 'tm-text-secondary hover:tm-bg-card'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-2 border-b tm-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 tm-text-muted" />
            <input
              type="text"
              placeholder="Buscar chamados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadTickets()}
              className="w-full pl-9 pr-3 py-2 tm-bg-card border tm-border rounded-lg text-sm tm-text placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <p className="text-sm tm-text-muted text-center py-10">Nenhum chamado</p>
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`px-4 py-3 border-b tm-border cursor-pointer transition ${
                  selectedId === t.id
                    ? 'bg-cyan-900/20 border-l-2 border-l-cyan-400'
                    : t.status === 'OPEN' && !t.assignee
                    ? 'bg-yellow-500/5 border-l-2 border-l-yellow-400 hover:bg-yellow-500/10'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[t.status]}`} />
                    <span className="text-xs tm-text-muted">#{t.number}</span>
                    {t.alertAssignee && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                  <span className={`text-xs font-medium ${priorityColors[t.priority]}`}>
                    {priorityLabels[t.priority]}
                  </span>
                </div>
                <p className="text-sm text-gray-200 truncate">{t.subject}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs tm-text-muted truncate">{t.company.name}</span>
                  <span className="text-xs text-gray-600">{formatDateShort(t.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Column 2: Conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Columns3 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="tm-text-muted">Selecione um chamado</p>
              <p className="text-xs text-gray-600 mt-1">Clique em um item à esquerda para visualizar</p>
            </div>
          </div>
        ) : detailLoading && !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : detail ? (
          <>
            {/* Conversation header */}
            <div className="px-5 py-3 border-b tm-border flex items-center gap-3 tm-bg-main">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusColors[detail.status]}`} />
                  <h2 className="text-sm font-semibold tm-text truncate">#{detail.number} {detail.subject}</h2>
                </div>
                <p className="text-xs tm-text-muted mt-0.5">
                  {detail.creator.name} &bull; {detail.company.name} &bull; {formatDate(detail.createdAt)}
                </p>
              </div>
              <button
                onClick={() => router.push(`/tickets/${detail.id}`)}
                className="p-2 rounded-lg tm-bg-card tm-text-secondary hover:bg-white/10 transition"
                title="Abrir página completa"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            {/* Messages timeline */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Original description */}
              <div className="tm-bg-card border tm-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-cyan-400">{detail.creator.name}</span>
                  <span className="text-xs text-gray-600">{formatDate(detail.createdAt)}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">Abertura</span>
                </div>
                {detail.descriptionHtml ? (
                  <EmailHtmlViewer html={detail.descriptionHtml} plainText={detail.description} />
                ) : (
                  <div className="text-sm tm-text whitespace-pre-wrap">{detail.description}</div>
                )}
              </div>

              {/* Messages */}
              {detail.messages.map((msg) => {
                const authorRole = msg.authorRole || 'CLIENT';
                const authorName = msg.authorName || 'Usuário';
                return (
                <div
                  key={msg.id}
                  className={`rounded-xl p-4 border ${
                    msg.isInternal
                      ? 'bg-yellow-500/5 border-yellow-500/20'
                      : authorRole === 'CLIENT'
                      ? 'tm-bg-card tm-border'
                      : 'bg-cyan-500/5 border-cyan-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium ${
                      msg.isInternal ? 'text-yellow-400' : authorRole === 'CLIENT' ? 'tm-text' : 'text-cyan-400'
                    }`}>
                      {authorName}
                    </span>
                    <span className="text-xs text-gray-600">{formatDate(msg.createdAt)}</span>
                    {msg.isInternal && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Interno
                      </span>
                    )}
                    {!msg.isInternal && authorRole !== 'CLIENT' && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-400">Suporte</span>
                    )}
                  </div>
                  <TicketReplyBlock
                    content={msg.content}
                    contentHtml={msg.contentHtml}
                    bodyClean={msg.bodyClean}
                    bodyQuoted={msg.bodyQuoted}
                    bodyParseMethod={msg.bodyParseMethod}
                  />
                </div>
              );})}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            {!['CLOSED', 'RESOLVED'].includes(detail.status) && (
              <div className="border-t tm-border p-4 tm-bg-main">
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => setIsInternal(false)}
                    className={`px-3 py-1 text-xs rounded-md ${
                      !isInternal ? 'bg-cyan-600 tm-text' : 'text-white-secondary hover:tm-bg-card'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 inline mr-1" />Resposta
                  </button>
                  <button
                    onClick={() => setIsInternal(true)}
                    className={`px-3 py-1 text-xs rounded-md ${
                      isInternal ? 'bg-yellow-600 tm-text' : 'tm-text-secondary hover:tm-bg-card'
                    }`}
                  >
                    <Lock className="w-3 h-3 inline mr-1" />Nota Interna
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder={isInternal ? 'Escreva uma nota interna...' : 'Escreva sua resposta...'}
                    className={`flex-1 tm-bg-card border rounded-lg px-4 py-2.5 text-sm tm-text placeholder:text-gray-600 resize-none focus:outline-none focus:ring-1 ${
                      isInternal ? 'border-yellow-500/30 focus:ring-yellow-500' : 'tm-border focus:ring-cyan-500'
                    }`}
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendReply();
                    }}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyContent.trim()}
                    className="px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-40 transition flex items-center"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Column 3: Properties */}
      {detail && (
        <div className="w-72 xl:w-80 flex-shrink-0 border-l tm-border overflow-y-auto tm-bg-main">
          <div className="p-4 space-y-5">
            <h3 className="text-sm font-semibold tm-text">Propriedades</h3>

            {/* Status */}
            <PropertyField label="Status">
              <select
                value={detail.status}
                onChange={(e) => updateTicketField('status', e.target.value)}
                disabled={updatingField === 'status'}
                className="w-full tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k} disabled={k === 'CLOSED' && detail.status !== 'CLOSED'}>{v}</option>
                ))}
              </select>
            </PropertyField>

            {/* Priority */}
            <PropertyField label="Prioridade">
              <select
                value={detail.priority}
                onChange={(e) => updateTicketField('priority', e.target.value)}
                disabled={updatingField === 'priority'}
                className="w-full tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {Object.entries(priorityLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </PropertyField>

            {/* Assignee */}
            <PropertyField label="Responsável">
              <select
                value={detail.assigneeId || ''}
                onChange={(e) => updateTicketField('assigneeId', e.target.value)}
                disabled={updatingField === 'assigneeId'}
                className="w-full tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="">Sem responsável</option>
                {staffList.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </PropertyField>

            <hr className="tm-border" />

            {/* Info fields */}
            <PropertyField label="Empresa">
              <p className="text-sm tm-text flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 tm-text-muted" />{detail.company.name}
              </p>
            </PropertyField>

            <PropertyField label="Solicitante">
              <p className="text-sm tm-text flex items-center gap-1">
                <User className="w-3.5 h-3.5 tm-text-muted" />{detail.creator.name}
              </p>
            </PropertyField>

            {detail.category && (
              <PropertyField label="Categoria">
                <p className="text-sm tm-text flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 tm-text-muted" />{detail.category.name}
                </p>
              </PropertyField>
            )}

            <hr className="tm-border" />

            {/* SLA */}
            <PropertyField label="SLA Resposta">
              {detail.responseDueAt ? (
                <SlaIndicator dueAt={detail.responseDueAt} respondedAt={detail.firstResponseAt} />
              ) : (
                <span className="text-xs tm-text-muted">N/A</span>
              )}
            </PropertyField>

            <PropertyField label="SLA Resolução">
              {detail.resolutionDueAt ? (
                <SlaIndicator dueAt={detail.resolutionDueAt} respondedAt={detail.resolvedAt} />
              ) : (
                <span className="text-xs tm-text-muted">N/A</span>
              )}
            </PropertyField>

            {detail.reopenCount > 0 && (
              <PropertyField label="Reaberturas">
                <span className="text-sm text-orange-400">{detail.reopenCount}x</span>
              </PropertyField>
            )}

            <hr className="tm-border" />

            {/* Dates */}
            <PropertyField label="Criado em">
              <span className="text-xs tm-text-secondary">{formatDate(detail.createdAt)}</span>
            </PropertyField>
            <PropertyField label="Atualizado">
              <span className="text-xs tm-text-secondary">{formatDate(detail.updatedAt)}</span>
            </PropertyField>
            {detail.resolvedAt && (
              <PropertyField label="Resolvido">
                <span className="text-xs text-green-400">{formatDate(detail.resolvedAt)}</span>
              </PropertyField>
            )}

            <hr className="tm-border" />

            {/* Anexos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs tm-text-muted flex items-center gap-1.5">
                  <Paperclip size={12} />
                  Anexos ({detail.attachments?.length || 0})
                </label>
                {detail.status !== 'CLOSED' && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    <span className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
                      {uploading ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Upload size={11} />
                      )}
                      {uploading ? 'Enviando...' : 'Enviar'}
                    </span>
                  </label>
                )}
              </div>
              {detail.attachments && detail.attachments.length > 0 ? (
                <div className="space-y-1.5">
                  {detail.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 p-2 rounded-lg group tm-bg-card border tm-border"
                    >
                      <File size={14} className="tm-text-secondary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs tm-text truncate font-medium">{att.fileName}</p>
                        <p className="text-[10px] tm-text-muted">
                          {formatFileSize(att.fileSize)} • {att.uploadedByName}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        {att.downloadUrl && (
                          <a
                            href={att.downloadUrl}
                            download={att.fileName}
                            className="p-1 tm-text-secondary hover:text-blue-400 transition-colors"
                            title="Baixar"
                          >
                            <Download size={12} />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="p-1 tm-text-secondary hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs tm-text-muted text-center py-2">Nenhum anexo</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resolve Ticket Modal */}
      {resolveTicketId && detail && (
        <ResolveTicketModal
          ticketId={resolveTicketId}
          ticketNumber={detail.number}
          ticketSubject={detail.subject}
          onClose={() => setResolveTicketId(null)}
          onSuccess={() => { setResolveTicketId(null); loadDetail(selectedId!); loadTickets(); }}
        />
      )}

      {/* Partner Selection Modal */}
      {showPartnerModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="tm-bg-card rounded-xl border tm-border p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold tm-text mb-4">Selecionar Parceiro</h3>
            {loadingPartners ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
                <span className="ml-2 tm-text-muted">Carregando parceiros...</span>
              </div>
            ) : partnerCompanies.length === 0 ? (
              <div className="text-center py-6">
                <p className="tm-text-muted text-sm">Nenhuma empresa do tipo &quot;Parceiro&quot; cadastrada.</p>
                <p className="tm-text-muted text-xs mt-2">Cadastre empresas como Parceiro em Admin → Empresas.</p>
              </div>
            ) : (
              <>
                <label className="block text-sm font-medium tm-text mb-1">Empresa Parceira</label>
                <select
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="w-full tm-bg-main border tm-border rounded-lg px-3 py-2 text-sm tm-text mb-4"
                >
                  <option value="">Selecione...</option>
                  {partnerCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <label className="block text-sm font-medium tm-text mb-1">Observação (opcional)</label>
                <textarea
                  value={partnerNote}
                  onChange={(e) => setPartnerNote(e.target.value)}
                  rows={3}
                  className="w-full tm-bg-main border tm-border rounded-lg px-3 py-2 text-sm tm-text mb-4 resize-none"
                  placeholder="Motivo do encaminhamento..."
                />
              </>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowPartnerModal(false); setSelectedPartner(''); setPartnerNote(''); }}
                className="px-4 py-2 text-sm tm-text-muted hover:tm-text rounded-lg border tm-border"
              >
                Cancelar
              </button>
              {partnerCompanies.length > 0 && (
                <button
                  onClick={handleConfirmPartner}
                  disabled={!selectedPartner || loadingPartners}
                  className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-500 rounded-lg disabled:opacity-50"
                >
                  Confirmar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs tm-text-muted block mb-1">{label}</label>
      {children}
    </div>
  );
}

function SlaIndicator({ dueAt, respondedAt }: { dueAt: string; respondedAt: string | null }) {
  if (respondedAt) {
    const met = new Date(respondedAt) <= new Date(dueAt);
    return (
      <span className={`text-xs flex items-center gap-1 ${met ? 'text-green-400' : 'text-red-400'}`}>
        {met ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {met ? 'Dentro do prazo' : 'Fora do prazo'}
      </span>
    );
  }
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) {
    return <span className="text-xs text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Expirado</span>;
  }
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const isRisk = diff < 4 * 3600000;
  return (
    <span className={`text-xs flex items-center gap-1 ${isRisk ? 'text-yellow-400' : 'tm-text-secondary'}`}>
      {isRisk && <AlertTriangle className="w-3.5 h-3.5" />}
      <Clock className="w-3.5 h-3.5" />
      {hours}h {mins}min restantes
    </span>
  );
}
