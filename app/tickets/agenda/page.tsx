'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar as CalIcon,
  Clock,
  User,
  Trash2,
  AlertTriangle,
  Building2,
  Mail,
  Loader2,
} from 'lucide-react';

interface Appointment {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName: string;
  date: string;
  startTime: string;
  endTime: string;
  observation: string | null;
  ticket: {
    number: number;
    subject: string;
    company: { name: string };
  };
}

interface SupportUser {
  id: string;
  name: string;
}

export default function AgendaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [supportUsers, setSupportUsers] = useState<SupportUser[]>([]);
  const [techFilter, setTechFilter] = useState('');

  // New appointment modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({
    companyId: '', contactId: '', requesterName: '', requesterEmail: '',
    technicianId: '', date: '', startTime: '09:00', endTime: '10:00', observation: '',
  });
  const [newError, setNewError] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [autoTicketNumber, setAutoTicketNumber] = useState<string>('(auto)');

  const isAdmin = session?.user?.role === 'ADMIN';
  const isSupport = session?.user?.role === 'SUPPORT';

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    else if (status === 'authenticated') {
      if (!['ADMIN', 'SUPPORT'].includes(session?.user?.role || '')) router.push('/tickets');
      else {
        loadSupportUsers();
      }
    }
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated') loadAppointments();
  }, [currentDate, techFilter, status]);

  const loadSupportUsers = async () => {
    try {
      const res = await fetch('/api/users/support');
      if (res.ok) setSupportUsers(await res.json());
    } catch {}
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/companies?limit=500');
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : data.companies || []);
      }
    } catch {}
  };

  const loadContacts = async (companyId: string) => {
    if (!companyId) { setContacts([]); return; }
    setLoadingContacts(true);
    try {
      const [contactsRes, companyRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/contacts`),
        fetch(`/api/companies/${companyId}`),
      ]);
      let contactList: { id: string; name: string; email: string }[] = [];
      if (contactsRes.ok) contactList = await contactsRes.json();

      // Prioritize company main email contact
      if (companyRes.ok) {
        const company = await companyRes.json();
        if (company.email) {
          const mainIdx = contactList.findIndex(c => c.email?.toLowerCase() === company.email.toLowerCase());
          if (mainIdx > 0) {
            const [main] = contactList.splice(mainIdx, 1);
            contactList.unshift(main);
          }
        }
      }
      setContacts(contactList);
    } catch {}
    finally { setLoadingContacts(false); }
  };

  // Load companies when modal opens
  useEffect(() => {
    if (showNewModal && companies.length === 0) loadCompanies();
  }, [showNewModal]);

  // Load contacts when company changes + auto-select first
  useEffect(() => {
    if (newForm.companyId) {
      const loadAndAutoSelect = async () => {
        await loadContacts(newForm.companyId);
      };
      setNewForm(f => ({ ...f, contactId: '', requesterName: '', requesterEmail: '' }));
      loadAndAutoSelect();
    } else {
      setContacts([]);
    }
  }, [newForm.companyId]);

  // Auto-select first contact when contacts load
  useEffect(() => {
    if (contacts.length > 0 && !newForm.contactId) {
      handleContactSelect(contacts[0].id);
    }
  }, [contacts]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const from = new Date(year, month, 1).toISOString().slice(0, 10);
      const to = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      if (techFilter) params.append('technicianId', techFilter);
      const res = await fetch(`/api/appointments?${params}`);
      if (res.ok) setAppointments(await res.json());
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!confirm('Deseja excluir este agendamento?')) return;
    try {
      const res = await fetch(`/api/appointments?id=${id}`, { method: 'DELETE' });
      if (res.ok) loadAppointments();
    } catch {}
  };

  const createAppointment = async () => {
    setSavingNew(true);
    setNewError('');
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoCreateTicket: true,
          companyId: newForm.companyId,
          requesterName: newForm.requesterName,
          requesterEmail: newForm.requesterEmail,
          technicianId: newForm.technicianId || session?.user?.id,
          date: newForm.date,
          startTime: newForm.startTime,
          endTime: newForm.endTime,
          observation: newForm.observation || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setNewError(data.error || 'Erro ao criar agendamento');
        setSavingNew(false);
        return;
      }

      setShowNewModal(false);
      setNewForm({
        companyId: '', contactId: '', requesterName: '', requesterEmail: '',
        technicianId: '', date: '', startTime: '09:00', endTime: '10:00', observation: '',
      });
      loadAppointments();
    } catch (error: any) {
      setNewError(error.message || 'Erro ao criar agendamento');
    } finally {
      setSavingNew(false);
    }
  };

  const handleContactSelect = (contactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    setNewForm(f => ({
      ...f,
      contactId,
      requesterName: contact?.name || '',
      requesterEmail: contact?.email || '',
    }));
  };

  // Calendar helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [year, month]);

  const getAppointmentsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.filter(a => a.date.slice(0, 10) === dateStr);
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const todayStr = new Date().toISOString().slice(0, 10);

  const selectedAppts = selectedDate
    ? appointments.filter(a => a.date.slice(0, 10) === selectedDate)
    : [];

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tm-text flex items-center gap-2">
          <CalIcon className="w-7 h-7 text-blue-400" />
          Agenda de Visitas Técnicas
        </h1>
        <button onClick={() => { setShowNewModal(true); setNewForm(f => ({ ...f, date: selectedDate || todayStr })); }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
          <Plus size={18} /> Novo Agendamento
        </button>
      </div>

      {/* Technician filter (admin only) */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <User size={18} className="tm-text-secondary" />
          <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)} className="tm-bg-card border tm-border rounded-lg px-4 py-2 tm-text text-sm">
            <option value="">Todos os técnicos</option>
            {supportUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {/* Calendar */}
      <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between p-4 border-b tm-border">
          <button onClick={prevMonth} className="p-2 tm-text-secondary hover:tm-text hover:bg-white/10 rounded-lg transition-colors"><ChevronLeft size={20} /></button>
          <h2 className="text-lg font-bold tm-text">{monthNames[month]} {year}</h2>
          <button onClick={nextMonth} className="p-2 tm-text-secondary hover:tm-text hover:bg-white/10 rounded-lg transition-colors"><ChevronRight size={20} /></button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b tm-border">
          {dayNames.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold tm-text-muted uppercase">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="min-h-[80px] md:min-h-[100px] border-b border-r tm-border bg-white/[0.02]" />;
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayAppts = getAppointmentsForDay(day);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;

            return (
              <div
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`min-h-[80px] md:min-h-[100px] border-b border-r tm-border p-1 cursor-pointer transition-colors hover:tm-bg-card ${
                  isSelected ? 'bg-blue-500/10 border-blue-500/30' : ''
                }`}
              >
                <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-blue-500 tm-text' : 'text-white'
                }`}>{day}</div>
                <div className="space-y-0.5">
                  {dayAppts.slice(0, 3).map(a => (
                    <div key={a.id} className="text-[10px] px-1 py-0.5 bg-blue-500/20 text-blue-300 rounded truncate">
                      {a.startTime} #{a.ticket.number} {a.ticket.company.name}
                    </div>
                  ))}
                  {dayAppts.length > 3 && (
                    <div className="text-[10px] tm-text-muted px-1">+{dayAppts.length - 3} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day details */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="tm-bg-card border tm-border rounded-xl overflow-hidden"
          >
            <div className="p-4 border-b tm-border flex items-center justify-between">
              <h3 className="tm-text font-medium">
                Agendamentos - {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <button onClick={() => setSelectedDate(null)} className="tm-text-secondary hover:tm-text"><X size={18} /></button>
            </div>
            <div className="p-4">
              {selectedAppts.length === 0 ? (
                <p className="tm-text-muted text-sm text-center py-4">Nenhum agendamento nesta data</p>
              ) : (
                <div className="space-y-3">
                  {selectedAppts.map(a => (
                    <div key={a.id} className="tm-bg-card rounded-lg p-3 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock size={14} className="text-blue-400" />
                          <span className="tm-text font-medium text-sm">{a.startTime} - {a.endTime}</span>
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                            #{a.ticket.number}
                          </span>
                        </div>
                        <p className="tm-text text-sm">{a.ticket.subject}</p>
                        <p className="tm-text-muted text-xs mt-1">
                          <span className="tm-text-secondary">{a.ticket.company.name}</span>
                          {' • '}
                          Técnico: <span className="tm-text-secondary">{a.technicianName}</span>
                        </p>
                        {a.observation && <p className="tm-text-muted text-xs mt-1 italic">{a.observation}</p>}
                      </div>
                      <button onClick={() => deleteAppointment(a.id)} className="tm-text-muted hover:text-red-400 transition-colors p-1" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Appointment Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="tm-bg-main rounded-xl p-6 w-full max-w-lg border tm-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tm-text">Nova Visita Técnica</h2>
              <button onClick={() => { setShowNewModal(false); setNewError(''); }} className="tm-text-secondary hover:tm-text"><X size={20} /></button>
            </div>

            {newError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4 text-red-400 text-sm">
                <AlertTriangle size={16} /> {newError}
              </div>
            )}

            <div className="space-y-4">
              {/* Ticket auto-generated info */}
              <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <CalIcon size={16} className="text-blue-400" />
                <div className="text-sm">
                  <span className="tm-text-secondary">Chamado:</span>{' '}
                  <span className="tm-text font-medium">{autoTicketNumber}</span>
                  <span className="mx-2 tm-text-muted">•</span>
                  <span className="tm-text-secondary">Assunto:</span>{' '}
                  <span className="tm-text font-medium">Visita Técnica</span>
                </div>
              </div>

              {/* Company select */}
              <div>
                <label className="flex items-center gap-1.5 text-sm tm-text mb-1">
                  <Building2 size={14} className="text-blue-400" /> Empresa <span className="text-red-400">*</span>
                </label>
                <select
                  value={newForm.companyId}
                  onChange={(e) => setNewForm(f => ({ ...f, companyId: e.target.value }))}
                  className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text"
                >
                  <option value="">Selecione a empresa...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Contact select (only when company selected) */}
              {newForm.companyId && (
                <div>
                  <label className="flex items-center gap-1.5 text-sm tm-text mb-1">
                    <User size={14} className="text-blue-400" /> Solicitante
                  </label>
                  {loadingContacts ? (
                    <div className="flex items-center gap-2 px-3 py-2 tm-text-secondary text-sm">
                      <Loader2 size={14} className="animate-spin" /> Carregando contatos...
                    </div>
                  ) : (
                    <select
                      value={newForm.contactId}
                      onChange={(e) => handleContactSelect(e.target.value)}
                      className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text"
                    >
                      <option value="">Selecione o solicitante...</option>
                      {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Email preview */}
              {newForm.requesterEmail && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-sm">
                  <Mail size={14} className="text-green-400" />
                  <span className="tm-text-secondary">Email:</span>
                  <span className="tm-text">{newForm.requesterEmail}</span>
                  <span className="text-green-400 text-xs ml-auto">✓ Receberá confirmação</span>
                </div>
              )}

              {/* Technician select */}
              {isAdmin && (
                <div>
                  <label className="flex items-center gap-1.5 text-sm tm-text mb-1">
                    <User size={14} className="text-orange-400" /> Técnico <span className="text-red-400">*</span>
                  </label>
                  <select value={newForm.technicianId} onChange={(e) => setNewForm(f => ({ ...f, technicianId: e.target.value }))} className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text">
                    <option value="">Selecione o técnico...</option>
                    {supportUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="flex items-center gap-1.5 text-sm tm-text mb-1">
                  <CalIcon size={14} className="text-blue-400" /> Data <span className="text-red-400">*</span>
                </label>
                <input type="date" value={newForm.date} onChange={(e) => setNewForm(f => ({ ...f, date: e.target.value }))} className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text" />
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-sm tm-text mb-1">
                    <Clock size={14} className="text-blue-400" /> Início
                  </label>
                  <input type="time" value={newForm.startTime} onChange={(e) => setNewForm(f => ({ ...f, startTime: e.target.value }))} className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm tm-text mb-1">
                    <Clock size={14} className="text-blue-400" /> Fim
                  </label>
                  <input type="time" value={newForm.endTime} onChange={(e) => setNewForm(f => ({ ...f, endTime: e.target.value }))} className="w-full tm-bg-card border tm-border rounded-lg px-3 py-2 tm-text" />
                </div>
              </div>

              {/* Observation */}
              <div>
                <label className="block text-sm tm-text mb-1">Observação</label>
                <textarea value={newForm.observation} onChange={(e) => setNewForm(f => ({ ...f, observation: e.target.value }))} rows={2} placeholder="Opcional..." className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowNewModal(false); setNewError(''); }} className="px-4 py-2 tm-text-secondary hover:tm-text">Cancelar</button>
              <button
                onClick={createAppointment}
                disabled={savingNew || !newForm.companyId || !newForm.date || (isAdmin && !newForm.technicianId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {savingNew ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                Agendar Visita
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}