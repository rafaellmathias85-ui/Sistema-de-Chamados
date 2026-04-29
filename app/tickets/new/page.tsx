'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertTriangle,
  Paperclip,
  X,
  FileIcon,
  Upload,
  Calendar,
  Clock,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Company {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface PendingAttachment {
  fileName: string;
  fileSize: number;
  fileType: string;
  cloudStoragePath: string;
  isPublic: boolean;
  uploading?: boolean;
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function NewTicketPage() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);

  // Admin/Support extra fields
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedCreatorId, setSelectedCreatorId] = useState('');
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newExtraEmail, setNewExtraEmail] = useState('');

  // Attachments
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Visita Técnica fields
  const [supportUsers, setSupportUsers] = useState<{id:string;name:string}[]>([]);
  const [visitTechId, setVisitTechId] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitStartTime, setVisitStartTime] = useState('09:00');
  const [visitEndTime, setVisitEndTime] = useState('10:00');

  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'MEDIUM',
    categoryId: '',
  });

  const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPPORT' || session?.user?.role === 'FINANCE';

  // Detect if selected category is Visita Técnica
  const selectedCategory = categories.find(c => c.id === formData.categoryId);
  const isVisitaTecnica = selectedCategory?.name?.toLowerCase().includes('visita');

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await fetch('/api/categories?activeOnly=true');
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch (err) {
        console.error('Erro ao carregar categorias:', err);
      }
    };
    loadCategories();
  }, []);

  // Load support users for Visita Técnica
  useEffect(() => {
    if (isStaff || isVisitaTecnica) {
      fetch('/api/users/support')
        .then(r => r.json())
        .then(data => setSupportUsers(data || []))
        .catch(console.error);
    }
  }, [isStaff, isVisitaTecnica]);

  // Load companies for ADMIN/SUPPORT
  useEffect(() => {
    if (!isStaff) return;
    const loadCompanies = async () => {
      try {
        const res = await fetch('/api/companies?limit=500');
        if (res.ok) {
          const data = await res.json();
          setCompanies(data.companies || []);
        }
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
      }
    };
    loadCompanies();
  }, [isStaff]);

  // Load users/contacts when company changes
  useEffect(() => {
    if (!isStaff || !selectedCompanyId) {
      setUsers([]);
      setSelectedCreatorId('');
      return;
    }
    const loadContacts = async () => {
      setLoadingUsers(true);
      setSelectedCreatorId('');
      try {
        // Load contacts (CLIENT role users) + company main email
        const [contactsRes, companyRes] = await Promise.all([
          fetch(`/api/companies/${selectedCompanyId}/contacts`),
          fetch(`/api/companies/${selectedCompanyId}`),
        ]);
        
        let contactList: User[] = [];
        
        if (contactsRes.ok) {
          const contacts = await contactsRes.json();
          contactList = contacts.map((c: any) => ({ id: c.id, name: c.name, email: c.email }));
        }

        // Also load staff/support users of this company
        const usersRes = await fetch(`/api/users?companyId=${selectedCompanyId}&limit=500`);
        if (usersRes.ok) {
          const data = await usersRes.json();
          const allUsers = (data.users || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email }));
          // Merge without duplicates
          const existingIds = new Set(contactList.map((c: User) => c.id));
          for (const u of allUsers) {
            if (!existingIds.has(u.id)) {
              contactList.push(u);
            }
          }
        }

        // If company has a main email, check if a contact matches; if not, add as virtual entry
        if (companyRes.ok) {
          const company = await companyRes.json();
          if (company.email) {
            const mainEmailContact = contactList.find((c: User) => c.email?.toLowerCase() === company.email.toLowerCase());
            if (mainEmailContact) {
              // Move this contact to the top
              contactList = [mainEmailContact, ...contactList.filter((c: User) => c.id !== mainEmailContact.id)];
            }
          }
        }

        setUsers(contactList);
        // Auto-select first contact
        if (contactList.length > 0) {
          setSelectedCreatorId(contactList[0].id);
        }
      } catch (err) {
        console.error('Erro ao carregar contatos:', err);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadContacts();
  }, [isStaff, selectedCompanyId]);

  // File upload handler
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 100 * 1024 * 1024) {
        setError(`Arquivo "${file.name}" excede o limite de 100MB`);
        continue;
      }

      const tempAttachment: PendingAttachment = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        cloudStoragePath: '',
        isPublic: false,
        uploading: true,
      };

      setAttachments(prev => [...prev, tempAttachment]);
      setUploadingFile(true);

      try {
        // 1. Get presigned URL
        const presignedRes = await fetch('/api/upload/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            isPublic: false,
          }),
        });

        if (!presignedRes.ok) {
          const errData = await presignedRes.json();
          throw new Error(errData.error || 'Erro ao obter URL de upload');
        }

        const { uploadUrl, cloudStoragePath } = await presignedRes.json();

        // 2. Upload to S3
        const headers: Record<string, string> = {
          'Content-Type': file.type || 'application/octet-stream',
        };
        // Check if content-disposition is in signed headers
        try {
          const urlObj = new URL(uploadUrl);
          const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') || '';
          if (signedHeaders.includes('content-disposition')) {
            headers['Content-Disposition'] = 'attachment';
          }
        } catch { /* ignore URL parse errors */ }

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers,
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error('Erro ao fazer upload do arquivo');
        }

        // 3. Update attachment state with cloudStoragePath
        setAttachments(prev =>
          prev.map(a =>
            a.fileName === file.name && a.uploading
              ? { ...a, cloudStoragePath, uploading: false }
              : a
          )
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Erro no upload';
        setAttachments(prev =>
          prev.map(a =>
            a.fileName === file.name && a.uploading
              ? { ...a, uploading: false, error: errorMsg }
              : a
          )
        );
      } finally {
        setUploadingFile(false);
      }
    }
  }, []);

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate staff fields
    if (isStaff && selectedCompanyId && !selectedCreatorId) {
      setError('Selecione o solicitante do chamado');
      setLoading(false);
      return;
    }

    // Validate Visita Técnica fields
    if (isVisitaTecnica) {
      if (!visitTechId) {
        setError('Selecione o técnico para a visita');
        setLoading(false);
        return;
      }
      if (!visitDate) {
        setError('Selecione a data da visita');
        setLoading(false);
        return;
      }
    }

    // Check for uploading attachments
    if (attachments.some(a => a.uploading)) {
      setError('Aguarde o upload dos anexos finalizar');
      setLoading(false);
      return;
    }

    // Remove failed attachments
    const validAttachments = attachments.filter(a => a.cloudStoragePath && !a.error);

    try {
      const body: Record<string, unknown> = { ...formData };
      if (isStaff && selectedCreatorId && selectedCompanyId) {
        body.creatorId = selectedCreatorId;
        body.companyId = selectedCompanyId;
        if (extraEmails.length > 0) {
          body.ccEmails = extraEmails;
        }
      }

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erro ao criar chamado');
        return;
      }

      const data = await res.json();
      const ticketId = data.ticket.id;

      // Create appointment for Visita Técnica
      if (isVisitaTecnica && visitTechId && visitDate) {
        try {
          await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId,
              technicianId: visitTechId,
              date: visitDate,
              startTime: visitStartTime,
              endTime: visitEndTime,
              observation: `Visita técnica agendada via chamado #${data.ticket.number}`,
            }),
          });
        } catch (e) {
          console.error('Erro ao criar agendamento:', e);
        }
      }

      // Register attachments
      if (validAttachments.length > 0) {
        await Promise.all(
          validAttachments.map(att =>
            fetch(`/api/tickets/${ticketId}/attachments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: att.fileName,
                fileSize: att.fileSize,
                fileType: att.fileType,
                cloudStoragePath: att.cloudStoragePath,
                isPublic: att.isPublic,
              }),
            })
          )
        );
      }

      router.push(`/tickets/${ticketId}`);
    } catch {
      setError('Erro ao criar chamado');
    } finally {
      setLoading(false);
    }
  };

  const selectClass = 'w-full tm-bg-card border tm-border rounded-lg py-3 px-4 tm-text focus:outline-none focus:border-accent-blue/50 [&>option]:tm-bg-card [&>option]:tm-text';
  const inputClass = 'w-full tm-bg-card border tm-border rounded-lg py-3 px-4 tm-text placeholder-gray-500 focus:outline-none focus:border-accent-blue/50';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-2 tm-text-secondary hover:tm-text mb-4"
        >
          <ArrowLeft size={20} />
          Voltar
        </Link>
        <h1 className="text-2xl font-montserrat font-bold tm-text">
          Novo Chamado
        </h1>
        <p className="tm-text-secondary mt-1">
          Preencha os dados abaixo para abrir um novo chamado de suporte
        </p>
      </div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="tm-bg-card border tm-border rounded-xl p-6"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-lg flex items-center gap-3">
              <AlertTriangle size={20} />
              {error}
            </div>
          )}

          {/* ADMIN/SUPPORT: Company & Requester */}
          {isStaff && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Empresa *
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className={selectClass}
                  required
                >
                  <option value="">Selecione a empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Solicitante *
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCreatorId}
                    onChange={(e) => setSelectedCreatorId(e.target.value)}
                    className={`${selectClass} flex-1`}
                    disabled={!selectedCompanyId || loadingUsers}
                    required
                  >
                    <option value="">
                      {loadingUsers
                        ? 'Carregando...'
                        : !selectedCompanyId
                        ? 'Selecione a empresa primeiro'
                        : 'Selecione o solicitante'}
                    </option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowAddEmail(!showAddEmail)}
                    className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex-shrink-0"
                    title="Adicionar e-mail extra (CC)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
                {/* Extra email input */}
                {showAddEmail && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="email"
                      value={newExtraEmail}
                      onChange={(e) => setNewExtraEmail(e.target.value)}
                      className={`${inputClass} flex-1`}
                      placeholder="Email adicional (CC)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const email = newExtraEmail.trim();
                          if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !extraEmails.includes(email)) {
                            setExtraEmails([...extraEmails, email]);
                            setNewExtraEmail('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const email = newExtraEmail.trim();
                        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !extraEmails.includes(email)) {
                          setExtraEmails([...extraEmails, email]);
                          setNewExtraEmail('');
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm transition-colors flex-shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>
                )}
                {/* Extra emails list */}
                {extraEmails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {extraEmails.map((email, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs">
                        {email}
                        <button
                          type="button"
                          onClick={() => setExtraEmails(extraEmails.filter((_, i) => i !== idx))}
                          className="hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium tm-text mb-2">
              Assunto *
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className={inputClass}
              placeholder="Descreva brevemente o problema"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium tm-text mb-2">
                Categoria
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className={selectClass}
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium tm-text mb-2">
                Criticidade *
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className={selectClass}
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Crítica</option>
                <option value="NONE">Sem SLA</option>
              </select>
            </div>
          </div>

          {/* Visita Técnica fields */}
          {isVisitaTecnica && (
            <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-lg space-y-4">
              <h3 className="text-sm font-semibold text-orange-300 flex items-center gap-2">
                <Calendar size={16} /> Agendamento da Visita Técnica
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    <UserCheck size={14} className="inline mr-1" /> Técnico *
                  </label>
                  <select
                    value={visitTechId}
                    onChange={(e) => setVisitTechId(e.target.value)}
                    className={selectClass}
                    required
                  >
                    <option value="">Selecione o técnico</option>
                    {supportUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium tm-text mb-2">
                    <Calendar size={14} className="inline mr-1" /> Data *
                  </label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      <Clock size={14} className="inline mr-1" /> Início
                    </label>
                    <input
                      type="time"
                      value={visitStartTime}
                      onChange={(e) => setVisitStartTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-2">
                      <Clock size={14} className="inline mr-1" /> Fim
                    </label>
                    <input
                      type="time"
                      value={visitEndTime}
                      onChange={(e) => setVisitEndTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium tm-text mb-2">
              Descrição do Problema *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className={`${inputClass} resize-none`}
              placeholder="Descreva o problema com o máximo de detalhes possível. Inclua mensagens de erro, quando o problema começou, e quais ações você já tentou."
              required
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium tm-text mb-2">
              <Paperclip size={16} className="inline mr-1" />
              Anexos
            </label>

            {/* Upload area */}
            <label className="flex items-center justify-center gap-3 p-4 border-2 border-dashed tm-border rounded-lg cursor-pointer hover:border-accent-blue/40 transition-colors">
              <Upload size={20} className="tm-text-secondary" />
              <span className="tm-text-secondary text-sm">
                {uploadingFile ? 'Enviando...' : 'Clique para selecionar arquivos'}
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
                disabled={uploadingFile}
              />
            </label>
            <p className="text-xs tm-text-muted mt-1">
              Máx. 100MB por arquivo. Formatos: imagens, PDF, Word, Excel, texto, CSV, ZIP.
            </p>

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((att, index) => (
                  <div
                    key={`${att.fileName}-${index}`}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      att.error
                        ? 'bg-red-500/10 border-red-500/30'
                        : att.uploading
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'tm-bg-card tm-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileIcon size={18} className={att.error ? 'text-red-400' : 'tm-text-secondary'} />
                      <div className="min-w-0">
                        <p className="text-sm tm-text truncate">{att.fileName}</p>
                        <p className="text-xs tm-text-muted">
                          {formatFileSize(att.fileSize)}
                          {att.uploading && ' — Enviando...'}
                          {att.error && ` — ${att.error}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1 tm-text-secondary hover:text-red-400 flex-shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Link
              href="/tickets"
              className="px-6 py-3 tm-text-secondary hover:tm-text transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading || uploadingFile}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-blue to-accent-orange text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Criar Chamado
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
