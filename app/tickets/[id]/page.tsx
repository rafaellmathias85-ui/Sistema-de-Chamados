'use client';

import { useSession } from 'next-auth/react';
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Loader2,
  User,
  Clock,
  Building2,
  AlertTriangle,
  Lock,
  MessageSquare,
  Tag,
  Timer,
  Paperclip,
  Upload,
  File,
  Trash2,
  Download,
  DollarSign,
  XCircle,
  Bell,
  ArrowLeftRight,
} from 'lucide-react';
import Link from 'next/link';
import ResolveTicketModal from '@/components/resolve-ticket-modal';
import EmailHtmlViewer from '@/components/email-html-viewer';
import TicketReplyBlock from '@/components/ticket-reply-block';

interface PartnerCompany {
  id: string;
  name: string;
}

interface TicketMessage {
  id: string;
  content: string;
  contentHtml?: string | null;
  bodyClean?: string | null;
  bodyQuoted?: string | null;
  bodyParseMethod?: string | null;
  isInternal: boolean;
  authorName: string;
  authorRole: string;
  createdAt: string;
}

interface TicketAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  cloudStoragePath: string;
  isPublic: boolean;
  uploadedByName: string;
  createdAt: string;
  downloadUrl?: string;
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
  resolvedAt: string | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  firstResponseAt: string | null;
  forwardedToFinance: boolean;
  financialValue: number | null;
  financialNotes: string | null;
  creator: { id: string; name: string; email: string };
  assignee: { id: string; name: string } | null;
  company: { name: string };
  category: { id: string; name: string; color: string } | null;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
  alertAssignee?: boolean;
}

export default function TicketDetailPage() {
  const { data: session } = useSession() || {};
  const params = useParams();
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferComment, setTransferComment] = useState('');
  const [transferForce, setTransferForce] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [supportUsers, setSupportUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Partner modal state
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partnerCompanies, setPartnerCompanies] = useState<PartnerCompany[]>([]);
  const [selectedPartner, setSelectedPartner] = useState('');
  const [partnerNote, setPartnerNote] = useState('');
  const [loadingPartners, setLoadingPartners] = useState(false);

  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPPORT' || session?.user?.role === 'FINANCE';
  const isAdmin = session?.user?.role === 'ADMIN';
  const isFinanceUser = session?.user?.role === 'ADMIN' || session?.user?.role === 'FINANCE';
  const alertClearedRef = useRef(false);

  useEffect(() => {
    fetchTicket();
    fetchAttachments();
  }, [params.id]);

  // Limpar alerta no banco após exibir o banner (apenas uma vez)
  useEffect(() => {
    if (ticket?.alertAssignee && session?.user?.id && ticket.assignee?.id === session.user.id && !alertClearedRef.current) {
      alertClearedRef.current = true;
      fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAlert: true }),
      }).catch(() => {});
    }
  }, [ticket?.alertAssignee, session?.user?.id, ticket?.assignee?.id, params.id]);

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/tickets/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data);
      } else {
        router.push('/tickets');
      }
    } catch (error) {
      console.error('Error fetching ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttachments = async () => {
    try {
      const res = await fetch(`/api/tickets/${params.id}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data);
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Verificar tamanho (máx 100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('Arquivo muito grande. Máximo 100MB.');
      return;
    }

    setUploading(true);
    try {
      // 1-3. Upload do arquivo (S3 presigned ou local direct)
      const { uploadFile } = await import('@/lib/upload-helper');
      const contentType = file.type || 'application/octet-stream';
      const { cloudStoragePath } = await uploadFile(file, false);

      // 4. Registrar anexo no ticket
      const attachBody = {
        fileName: file.name,
        fileSize: Number(file.size) || 0,
        fileType: contentType,
        cloudStoragePath,
        isPublic: false,
      };
      const attachRes = await fetch(`/api/tickets/${params.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attachBody),
      });

      if (!attachRes.ok) {
        const errData = await attachRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao registrar anexo');
      }

      fetchAttachments();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert(error.message || 'Erro ao fazer upload do arquivo');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Tem certeza que deseja excluir este anexo?')) return;

    try {
      const res = await fetch(`/api/tickets/${params.id}/attachments?attachmentId=${attachmentId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchAttachments();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao excluir anexo');
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getSLAStatus = (dueDate: string | null) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const hoursLeft = diff / (1000 * 60 * 60);

    if (hoursLeft < 0) return { status: 'overdue', label: 'Atrasado', color: 'text-red-400' };
    if (hoursLeft < 2) return { status: 'critical', label: 'Crítico', color: 'text-orange-400' };
    if (hoursLeft < 8) return { status: 'warning', label: 'Atenção', color: 'text-yellow-400' };
    return { status: 'ok', label: 'No prazo', color: 'text-green-400' };
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, isInternal }),
      });

      if (res.ok) {
        setMessage('');
        setIsInternal(false);
        fetchTicket();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    // If changing to IN_PARTNER, open partner selection modal
    if (newStatus === 'IN_PARTNER') {
      setLoadingPartners(true);
      setShowPartnerModal(true);
      setSelectedPartner('');
      setPartnerNote('');
      try {
        const res = await fetch('/api/companies?limit=500&clientType=PARCEIRO');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.companies || [];
          setPartnerCompanies(list);
        }
      } catch { setPartnerCompanies([]); }
      finally { setLoadingPartners(false); }
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchTicket();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmPartner = async () => {
    if (!selectedPartner) return;
    const partnerName = partnerCompanies.find(c => c.id === selectedPartner)?.name || '';
    setUpdating(true);
    try {
      // 1. Update status to IN_PARTNER
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PARTNER' }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar status');

      // 2. Add internal note about partner
      const noteContent = `🤝 Chamado encaminhado para parceiro: **${partnerName}**${partnerNote ? `\n\nObservação: ${partnerNote}` : ''}`;
      await fetch(`/api/tickets/${params.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteContent, isInternal: true }),
      });

      setShowPartnerModal(false);
      fetchTicket();
    } catch (error) {
      console.error('Error setting partner:', error);
      alert('Erro ao encaminhar para parceiro');
    } finally {
      setUpdating(false);
    }
  };

  const handleResolveSuccess = () => {
    setShowResolveDialog(false);
    fetchTicket();
  };

  const handleAssignToMe = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId: session?.user?.id }),
      });

      if (res.ok) {
        fetchTicket();
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteTicket = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/tickets/list');
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir chamado');
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      alert('Erro ao excluir chamado');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      OPEN: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      IN_PROGRESS: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      IN_PARTNER: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
      PAUSED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      AWAITING_CLIENT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
      CLOSED: 'bg-gray-500/20 tm-text-secondary border-gray-500/30',
    };
    const labels: Record<string, string> = {
      OPEN: 'Aberto',
      IN_PROGRESS: 'Em Andamento',
      IN_PARTNER: 'Parceiro',
      PAUSED: 'Pausado',
      AWAITING_CLIENT: 'Aguardando Cliente',
      RESOLVED: 'Resolvido',
      CLOSED: 'Fechado',
    };
    return (
      <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${styles[status] || styles.OPEN}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      LOW: 'bg-gray-500/20 tm-text-secondary border-gray-500/30',
      MEDIUM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const labels: Record<string, string> = {
      LOW: 'Baixa',
      MEDIUM: 'Média',
      HIGH: 'Alta',
      CRITICAL: 'Crítica',
    };
    return (
      <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${styles[priority]}`}>
        {labels[priority]}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="tm-text-secondary">Chamado não encontrado</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/tickets/list"
          className="inline-flex items-center gap-2 tm-text-secondary hover:tm-text mb-4"
        >
          <ArrowLeft size={20} />
          Voltar
        </Link>
        {ticket.alertAssignee && ticket.assignee?.id === session?.user?.id && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 mb-4 bg-orange-500/15 border border-orange-400/30 rounded-xl"
          >
            <span className="relative flex h-5 w-5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <Bell className="relative inline-flex h-5 w-5 text-orange-400" />
            </span>
            <span className="text-orange-300 text-sm font-medium">
              Nova interação neste chamado — verifique as atualizações abaixo.
            </span>
          </motion.div>
        )}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-accent-blue font-bold text-lg">#{ticket.number}</span>
              {getPriorityBadge(ticket.priority)}
              {getStatusBadge(ticket.status)}
              {ticket.forwardedToFinance && (
                <span className="px-3 py-1.5 rounded-full text-sm font-medium border bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
                  <DollarSign size={14} />
                  Financeiro
                </span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-montserrat font-bold tm-text">
              {ticket.subject}
            </h1>
          </div>
          {isStaff && (
            <div className="flex flex-wrap gap-2">
              {!ticket.assignee && (
                <button
                  onClick={handleAssignToMe}
                  disabled={updating}
                  className="px-4 py-2 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-colors text-sm font-medium"
                >
                  Assumir Chamado
                </button>
              )}
              {ticket.status === 'OPEN' && (
                <button
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  disabled={updating}
                  className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-medium"
                >
                  Iniciar Atendimento
                </button>
              )}
              {(ticket.status === 'IN_PROGRESS' || ticket.status === 'RESOLVED') && (
                <button
                  onClick={() => setShowResolveDialog(true)}
                  disabled={updating}
                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium"
                >
                  {ticket.status === 'IN_PROGRESS' ? 'Resolver Chamado' : 'Fechar Chamado'}
                </button>
              )}
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = `/api/tickets/${ticket.id}/report`;
                  a.download = `chamado-${ticket.number}.pdf`;
                  a.click();
                }}
                className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors text-sm font-medium flex items-center gap-1.5"
              >
                <Download size={15} />
                Gerar PDF
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  <Trash2 size={15} />
                  Excluir
                </button>
              )}
            </div>
          )}
          {!isStaff && (
            <button
              onClick={() => {
                const a = document.createElement('a');
                a.href = `/api/tickets/${ticket.id}/report`;
                a.download = `chamado-${ticket.number}.pdf`;
                a.click();
              }}
              className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors text-sm font-medium flex items-center gap-1.5"
            >
              <Download size={15} />
              Gerar PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content — 3/4 da tela para descrição e mensagens */}
        <div className="lg:col-span-3 space-y-6">
          {/* Description */}
          <div className="tm-bg-card border tm-border rounded-xl p-5">
            <h2 className="text-sm font-semibold tm-text-secondary uppercase mb-3">Descrição</h2>
            {ticket.descriptionHtml ? (
              <EmailHtmlViewer html={ticket.descriptionHtml} plainText={ticket.description} />
            ) : (
              <p className="tm-text whitespace-pre-wrap">{ticket.description}</p>
            )}
          </div>

          {/* Messages */}
          <div className="tm-bg-card border tm-border rounded-xl">
            <div className="p-5 border-b tm-border">
              <h2 className="text-sm font-semibold tm-text-secondary uppercase flex items-center gap-2">
                <MessageSquare size={16} />
                Interações ({ticket.messages.length})
              </h2>
            </div>
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
              {ticket.messages.length > 0 ? (
                ticket.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-4 ${msg.isInternal ? 'bg-yellow-500/5' : ''}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        msg.authorRole === 'CLIENT' ? 'bg-blue-500/20 text-blue-400' : 'bg-accent-orange/20 text-accent-orange'
                      }`}>
                        {msg.authorName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium tm-text">
                          {msg.authorName}
                          {msg.isInternal && (
                            <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                              <Lock size={10} className="inline mr-1" />
                              Nota Interna
                            </span>
                          )}
                        </p>
                        <p className="text-xs tm-text-muted">{formatDate(msg.createdAt)}</p>
                      </div>
                    </div>
                    <div className="pl-11">
                      <TicketReplyBlock
                        content={msg.content}
                        contentHtml={msg.contentHtml}
                        bodyClean={msg.bodyClean}
                        bodyQuoted={msg.bodyQuoted}
                        bodyParseMethod={msg.bodyParseMethod}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center tm-text-secondary">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma interação ainda</p>
                </div>
              )}
            </div>

            {/* New message form */}
            {ticket.status !== 'CLOSED' && (
              <form onSubmit={handleSendMessage} className="p-4 border-t tm-border">
                {isStaff && (
                  <label className="flex items-center gap-2 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 tm-bg-card text-accent-orange focus:ring-accent-orange"
                    />
                    <span className="text-sm tm-text-secondary flex items-center gap-1">
                      <Lock size={14} />
                      Nota interna (não visível para o cliente)
                    </span>
                  </label>
                )}
                <div className="flex gap-3">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    rows={2}
                    className="flex-1 tm-bg-card border tm-border rounded-lg py-2.5 px-4 tm-text placeholder-gray-500 focus:outline-none focus:border-accent-blue/50 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !message.trim()}
                    className="px-4 bg-gradient-to-r from-accent-blue to-accent-orange text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={20} />}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Detalhes */}
          <div className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold tm-text-secondary uppercase">Detalhes</h2>
            
            {ticket.category && (
              <div>
                <p className="text-xs tm-text-muted mb-1">Categoria</p>
                <p className="tm-text flex items-center gap-2">
                  <Tag size={16} style={{ color: ticket.category.color }} />
                  <span style={{ color: ticket.category.color }}>{ticket.category.name}</span>
                </p>
              </div>
            )}

            <div>
              <p className="text-xs tm-text-muted mb-1">Empresa</p>
              <p className="tm-text flex items-center gap-2">
                <Building2 size={16} className="tm-text-secondary" />
                {ticket.company.name}
              </p>
            </div>

            <div>
              <p className="text-xs tm-text-muted mb-1">Solicitante</p>
              <p className="tm-text flex items-center gap-2">
                <User size={16} className="tm-text-secondary" />
                {ticket.creator.name}
              </p>
              <p className="text-xs tm-text-secondary pl-6">{ticket.creator.email}</p>
            </div>

            <div>
              <p className="text-xs tm-text-muted mb-1">Responsável</p>
              <div className="flex items-center gap-2">
                <p className="tm-text flex items-center gap-2">
                  <User size={16} className="tm-text-secondary" />
                  {ticket.assignee?.name || 'Não atribuído'}
                </p>
                {isStaff && ticket.assignee && ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
                  <button
                    onClick={async () => {
                      if (supportUsers.length === 0) {
                        try {
                          const res = await fetch('/api/users/support');
                          if (res.ok) setSupportUsers(await res.json());
                        } catch {}
                      }
                      setShowTransferModal(true);
                    }}
                    className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                    title="Transferir responsabilidade"
                  >
                    <ArrowLeftRight size={12} className="inline mr-1" />Transferir
                  </button>
                )}
              </div>
            </div>

            {/* Status change dropdown - staff only */}
            {isStaff && ticket.status !== 'CLOSED' && (
              <div>
                <p className="text-xs tm-text-muted mb-1">Alterar Status</p>
                <select
                  value={ticket.status}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  disabled={updating}
                  className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-blue-500 outline-none"
                >
                  <option value="OPEN">Aberto</option>
                  <option value="IN_PROGRESS">Em Andamento</option>
                  <option value="IN_PARTNER">Parceiro</option>
                  <option value="PAUSED">Pausado</option>
                  <option value="AWAITING_CLIENT">Aguardando Cliente</option>
                  <option value="RESOLVED">Resolvido</option>
                </select>
              </div>
            )}

            <div>
              <p className="text-xs tm-text-muted mb-1">Criado em</p>
              <p className="tm-text flex items-center gap-2">
                <Clock size={16} className="tm-text-secondary" />
                {formatDate(ticket.createdAt)}
              </p>
            </div>

            {ticket.resolvedAt && (
              <div>
                <p className="text-xs tm-text-muted mb-1">Resolvido em</p>
                <p className="tm-text flex items-center gap-2">
                  <Clock size={16} className="text-green-400" />
                  {formatDate(ticket.resolvedAt)}
                </p>
              </div>
            )}
          </div>

          {/* SLA */}
          {isStaff && (ticket.responseDueAt || ticket.resolutionDueAt) && ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
            <div className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold tm-text-secondary uppercase flex items-center gap-2">
                <Timer size={16} />
                SLA
              </h2>
              
              {ticket.responseDueAt && !ticket.firstResponseAt && (
                <div>
                  <p className="text-xs tm-text-muted mb-1">Resposta até</p>
                  <div className="flex items-center justify-between">
                    <p className="tm-text text-sm">{formatDate(ticket.responseDueAt)}</p>
                    {getSLAStatus(ticket.responseDueAt) && (
                      <span className={`text-xs ${getSLAStatus(ticket.responseDueAt)?.color}`}>
                        {getSLAStatus(ticket.responseDueAt)?.label}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {ticket.resolutionDueAt && (
                <div>
                  <p className="text-xs tm-text-muted mb-1">Resolução até</p>
                  <div className="flex items-center justify-between">
                    <p className="tm-text text-sm">{formatDate(ticket.resolutionDueAt)}</p>
                    {getSLAStatus(ticket.resolutionDueAt) && (
                      <span className={`text-xs ${getSLAStatus(ticket.resolutionDueAt)?.color}`}>
                        {getSLAStatus(ticket.resolutionDueAt)?.label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Financeiro */}
          {isFinanceUser && ticket.forwardedToFinance && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-green-400 uppercase flex items-center gap-2 mb-3">
                <DollarSign size={16} />
                Financeiro
              </h2>
              <div className="space-y-2">
                <div>
                  <p className="text-xs tm-text-muted">Valor</p>
                  <p className="tm-text font-medium">
                    {ticket.financialValue
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(ticket.financialValue))
                      : 'Pendente de definição'}
                  </p>
                </div>
                {ticket.financialNotes && (
                  <div>
                    <p className="text-xs tm-text-muted">Observações</p>
                    <p className="tm-text text-sm whitespace-pre-wrap">{ticket.financialNotes}</p>
                  </div>
                )}
                <div className="pt-2">
                  <Link
                    href="/tickets/finance"
                    className="text-green-400 hover:text-green-300 text-sm font-medium transition-colors"
                  >
                    Ir para Financeiro →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Anexos */}
          <div className="tm-bg-card border tm-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tm-text-secondary uppercase flex items-center gap-2">
                <Paperclip size={16} />
                Anexos ({attachments.length})
              </h2>
              {ticket.status !== 'CLOSED' && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <span className="flex items-center gap-1 text-xs text-accent-blue hover:text-blue-300 transition-colors">
                    {uploading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    {uploading ? 'Enviando...' : 'Enviar'}
                  </span>
                </label>
              )}
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 p-2 tm-bg-card rounded-lg group"
                  >
                    <File size={18} className="tm-text-secondary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm tm-text truncate">{att.fileName}</p>
                      <p className="text-xs tm-text-muted">
                        {formatFileSize(att.fileSize)} • {att.uploadedByName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {att.downloadUrl && (
                        <a
                          href={att.downloadUrl}
                          download={att.fileName}
                          className="p-1.5 tm-text-secondary hover:text-blue-400 transition-colors"
                          title="Baixar"
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="p-1.5 tm-text-secondary hover:text-red-400 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm tm-text-muted text-center py-4">Nenhum anexo</p>
            )}
          </div>
        </div>
      </div>

      {/* Resolve Dialog */}
      {showResolveDialog && (
        <ResolveTicketModal
          ticketId={ticket.id}
          ticketNumber={ticket.number}
          ticketSubject={ticket.subject}
          onClose={() => setShowResolveDialog(false)}
          onSuccess={handleResolveSuccess}
        />
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'var(--modal-overlay)' }}>
          <div className="tm-bg-card rounded-2xl border tm-border shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold tm-text mb-1">Transferir Chamado #{ticket.number}</h3>
            <p className="text-sm tm-text-secondary mb-4">Selecione o novo responsável</p>
            <select
              value={transferTarget}
              onChange={e => setTransferTarget(e.target.value)}
              className="w-full tm-input rounded-lg py-2.5 px-3 text-sm mb-3"
            >
              <option value="">Selecione um técnico...</option>
              {supportUsers.filter(u => u.id !== ticket.assignee?.id).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <textarea
              value={transferComment}
              onChange={e => setTransferComment(e.target.value)}
              placeholder="Motivo da transferência (opcional)"
              className="w-full tm-input rounded-lg py-2.5 px-3 text-sm mb-3 resize-none h-20"
            />
            {session?.user?.role === 'ADMIN' && (
              <label className="flex items-center gap-2 text-sm tm-text-secondary mb-4 cursor-pointer">
                <input type="checkbox" checked={transferForce} onChange={e => setTransferForce(e.target.checked)} className="rounded" />
                Forçar transferência (sem necessidade de confirmação)
              </label>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!transferTarget) return;
                  setTransferLoading(true);
                  try {
                    const res = await fetch('/api/tickets/transfers', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ticketId: ticket.id,
                        newResponsibleUserId: transferTarget,
                        comment: transferComment || undefined,
                        forceTransfer: transferForce,
                      }),
                    });
                    if (res.ok) {
                      setShowTransferModal(false);
                      setTransferTarget('');
                      setTransferComment('');
                      setTransferForce(false);
                      // Reload ticket data
                      const tRes = await fetch(`/api/tickets/${ticket.id}`);
                      if (tRes.ok) setTicket(await tRes.json());
                    } else {
                      const err = await res.json();
                      alert(err.error || 'Erro ao transferir');
                    }
                  } catch { alert('Erro ao transferir'); }
                  finally { setTransferLoading(false); }
                }}
                disabled={!transferTarget || transferLoading}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {transferLoading ? 'Enviando...' : transferForce ? 'Forçar Transferência' : 'Solicitar Transferência'}
              </button>
              <button
                onClick={() => { setShowTransferModal(false); setTransferTarget(''); setTransferComment(''); setTransferForce(false); }}
                className="px-4 py-2.5 tm-bg-card border tm-border tm-text rounded-lg text-sm transition-colors hover:opacity-80"
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="tm-bg-card rounded-2xl border border-red-500/30 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-full"><Trash2 className="text-red-400" size={22} /></div>
              <h3 className="text-lg font-semibold tm-text">Excluir Chamado #{ticket?.number}</h3>
            </div>
            <p className="tm-text-secondary text-sm mb-1">Esta ação é <strong className="text-red-400">irreversível</strong>.</p>
            <p className="tm-text-secondary text-sm mb-5">Todas as mensagens, anexos e histórico deste chamado serão permanentemente removidos.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteTicket}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >{deleting ? 'Excluindo...' : 'Confirmar Exclusão'}</button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2.5 tm-bg-card border tm-border tm-text rounded-lg text-sm transition-colors hover:opacity-80"
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de seleção de parceiro */}
      {showPartnerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="tm-bg-card rounded-2xl border border-violet-500/30 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-violet-500/20 rounded-full"><Building2 className="text-violet-400" size={22} /></div>
              <h3 className="text-lg font-semibold tm-text">Encaminhar para Parceiro</h3>
            </div>
            <p className="tm-text-secondary text-sm mb-4">
              Selecione o parceiro para o qual este chamado será encaminhado. Uma nota interna será registrada automaticamente.
            </p>
            {loadingPartners ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
            ) : partnerCompanies.length === 0 ? (
              <div className="py-4 text-center">
                <p className="tm-text-muted text-sm">Nenhuma empresa cadastrada como &quot;Parceiro&quot;.</p>
                <p className="tm-text-muted text-xs mt-1">Cadastre empresas com tipo &quot;Parceiro&quot; na seção de Empresas.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium tm-text-secondary mb-1">Empresa Parceira *</label>
                  <select
                    value={selectedPartner}
                    onChange={(e) => setSelectedPartner(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-violet-500 outline-none"
                  >
                    <option value="">Selecione um parceiro...</option>
                    {partnerCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium tm-text-secondary mb-1">Observação (opcional)</label>
                  <textarea
                    value={partnerNote}
                    onChange={(e) => setPartnerNote(e.target.value)}
                    placeholder="Motivo do encaminhamento, instruções, etc."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-violet-500 outline-none resize-none"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleConfirmPartner}
                disabled={updating || !selectedPartner}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >{updating ? 'Encaminhando...' : 'Confirmar Parceiro'}</button>
              <button
                onClick={() => setShowPartnerModal(false)}
                className="px-4 py-2.5 tm-bg-card border tm-border tm-text rounded-lg text-sm transition-colors hover:opacity-80"
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
