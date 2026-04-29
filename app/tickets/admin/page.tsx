'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Building2,
  Users,
  Tags,
  Clock,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Shield,
  ShieldOff,
  RotateCcw,
  Loader2,
  Download,
  Filter,
} from 'lucide-react';

type Tab = 'companies' | 'users' | 'categories' | 'sla';

interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  domain: string | null;
  needsAttention: boolean;
  _count: { users: number; tickets: number };
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  mfaEnabled?: boolean;
  mfaEnforced?: boolean;
  company: { id: string; name: string } | null;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isActive: boolean;
  parentId: string | null;
  parent?: { id: string; name: string; color: string } | null;
  children?: Category[];
  _count: { tickets: number; children: number };
}

interface SLAConfig {
  id: string;
  priority: string;
  responseTimeHrs: number;
  resolutionHrs: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('companies');
  const [loading, setLoading] = useState(true);

  // Estados para dados
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slaConfigs, setSlaConfigs] = useState<SLAConfig[]>([]);

  // Estados para modal
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'company' | 'user' | 'category' | 'sla'>('company');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  // Bulk delete state
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState<string | null>(null);

  const handleMfaAction = async (userId: string, action: 'enforce' | 'unenforce' | 'reset' | 'disable') => {
    const labels: Record<string, string> = {
      enforce: 'Obrigar MFA para este usuário?',
      unenforce: 'Remover obrigatoriedade de MFA?',
      reset: 'Resetar MFA deste usuário? Ele precisará configurar novamente.',
      disable: 'Desativar e remover MFA deste usuário completamente?',
    };
    if (!confirm(labels[action])) return;
    setMfaLoading(userId);
    try {
      const res = await fetch('/api/admin/mfa/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) {
        // Reload users with MFA data
        const usersRes = await fetch('/api/admin/mfa/users');
        if (usersRes.ok) {
          const mfaUsers = await usersRes.json();
          setUsers(mfaUsers);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Erro');
      }
    } catch { alert('Erro ao atualizar MFA'); }
    finally { setMfaLoading(null); }
  };

  const toggleSelectCompany = (id: string) => {
    setSelectedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllCompanies = () => {
    if (selectedCompanies.size === filteredCompanies.length) {
      setSelectedCompanies(new Set());
    } else {
      setSelectedCompanies(new Set(filteredCompanies.map(c => c.id)));
    }
  };

  const toggleSelectAllUsers = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleBulkDelete = async (type: 'companies' | 'users') => {
    const ids = type === 'companies' ? Array.from(selectedCompanies) : Array.from(selectedUsers);
    if (ids.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${ids.length} ${type === 'companies' ? 'empresa(s)' : 'usuário(s)'}?\n\nEsta ação não pode ser desfeita.`)) return;

    setBulkDeleting(true);
    setBulkDeleteResult(null);
    try {
      const res = await fetch('/api/admin/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ids }),
      });
      const data = await res.json();
      if (res.ok) {
        const msg = `${data.deleted} de ${data.total} excluído(s)${data.errors ? '. Erros: ' + data.errors.join('; ') : ''}`;
        setBulkDeleteResult(msg);
        loadData();
        if (type === 'companies') setSelectedCompanies(new Set());
        else setSelectedUsers(new Set());
        setTimeout(() => setBulkDeleteResult(null), 8000);
      } else {
        alert(data.error || 'Erro');
      }
    } catch {
      alert('Erro ao excluir');
    } finally {
      setBulkDeleting(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'ADMIN') {
        router.push('/tickets');
      } else {
        loadData();
      }
    }
  }, [status, session, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar dados sequencialmente para evitar excesso de conexões simultâneas
      const companiesRes = await fetch('/api/companies?limit=100');
      if (companiesRes.ok) {
        const data = await companiesRes.json();
        setCompanies(data.companies || []);
      }

      // Fetch users with MFA status from admin endpoint
      const usersRes = await fetch('/api/admin/mfa/users');
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data || []);
      } else {
        // Fallback to regular users endpoint
        const usersResFallback = await fetch('/api/users?limit=100');
        if (usersResFallback.ok) {
          const data = await usersResFallback.json();
          setUsers(data.users || []);
        }
      }

      const categoriesRes = await fetch('/api/categories');
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data || []);
      }

      const slaRes = await fetch('/api/sla');
      if (slaRes.ok) {
        const data = await slaRes.json();
        setSlaConfigs(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
    setLoading(false);
  };

  const openModal = (type: typeof modalType, item?: any) => {
    setModalType(type);
    setEditingItem(item || null);
    setError('');
    setSuccess('');

    if (item) {
      setFormData({ ...item });
    } else {
      switch (type) {
        case 'company':
          setFormData({ name: '', cnpj: '', phone: '', email: '', domain: '' });
          break;
        case 'user':
          setFormData({ name: '', email: '', password: '', role: 'CLIENT', companyId: '', allowedMenus: [] });
          break;
        case 'category':
          setFormData({ name: '', description: '', color: '#3B82F6', isActive: true, parentId: '' });
          break;
        case 'sla':
          setFormData({ priority: 'MEDIUM', responseTimeHrs: 8, resolutionHrs: 48 });
          break;
      }
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({});
    setError('');
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    try {
      let url = '';
      let method = 'POST';

      // Preparar dados do formulário
      let dataToSend = { ...formData };

      switch (modalType) {
        case 'company':
          url = editingItem ? `/api/companies/${editingItem.id}` : '/api/companies';
          method = editingItem ? 'PATCH' : 'POST';
          // Se estiver editando uma empresa que precisava de atenção, remover o alerta
          if (editingItem?.needsAttention) {
            dataToSend.needsAttention = false;
          }
          break;
        case 'user':
          url = editingItem ? `/api/users/${editingItem.id}` : '/api/users';
          method = editingItem ? 'PATCH' : 'POST';
          // Serializar allowedMenus como JSON string para SPECIAL
          if (dataToSend.role === 'SPECIAL' && Array.isArray(dataToSend.allowedMenus)) {
            dataToSend.allowedMenus = JSON.stringify(dataToSend.allowedMenus);
          }
          if (dataToSend.role !== 'SPECIAL') {
            dataToSend.allowedMenus = null;
          }
          break;
        case 'category':
          url = editingItem ? `/api/categories/${editingItem.id}` : '/api/categories';
          method = editingItem ? 'PATCH' : 'POST';
          break;
        case 'sla':
          url = '/api/sla';
          method = 'POST';
          break;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar');
      }

      setSuccess('Salvo com sucesso!');
      loadData();
      setTimeout(closeModal, 1000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('Tem certeza que deseja excluir?')) return;

    try {
      const url = type === 'company' ? `/api/companies/${id}` :
                  type === 'user' ? `/api/users/${id}` :
                  `/api/categories/${id}`;

      const res = await fetch(url, { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao excluir');
      }

      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const tabs = [
    { id: 'companies' as Tab, label: 'Empresas', icon: Building2 },
    { id: 'users' as Tab, label: 'Usuários', icon: Users },
    { id: 'categories' as Tab, label: 'Categorias', icon: Tags },
    { id: 'sla' as Tab, label: 'SLA', icon: Clock },
  ];

  const filteredCompanies = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.cnpj?.toLowerCase().includes(search.toLowerCase())
  );

  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userCompanyFilter, setUserCompanyFilter] = useState('');

  const filteredUsers = users.filter((u) => {
    const s = search.toLowerCase();
    const matchesSearch = !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || (u.company?.name || '').toLowerCase().includes(s);
    const matchesRole = !userRoleFilter || u.role === userRoleFilter;
    const matchesCompany = !userCompanyFilter || u.company?.name === userCompanyFilter;
    return matchesSearch && matchesRole && matchesCompany;
  });

  const priorityLabels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
    NONE: 'Sem SLA',
  };

  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrador',
    SUPPORT: 'Suporte',
    FINANCE: 'Financeiro',
    SPECIAL: 'Especial',
    CLIENT: 'Cliente',
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tm-text">Administração</h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSearch('');
            }}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent tm-text-secondary hover:text-gray-200'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk delete result */}
      {bulkDeleteResult && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-lg text-sm">
          {bulkDeleteResult}
        </div>
      )}

      {/* Barra de ações */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {activeTab !== 'sla' && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 tm-text-secondary" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Bulk delete button */}
          {activeTab === 'companies' && selectedCompanies.size > 0 && (
            <button
              onClick={() => handleBulkDelete('companies')}
              disabled={bulkDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Excluir {selectedCompanies.size} selecionada(s)
            </button>
          )}
          {activeTab === 'users' && selectedUsers.size > 0 && (
            <button
              onClick={() => handleBulkDelete('users')}
              disabled={bulkDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Excluir {selectedUsers.size} selecionado(s)
            </button>
          )}
          <button
            onClick={() =>
              openModal(
                activeTab === 'companies' ? 'company' :
                activeTab === 'users' ? 'user' :
                activeTab === 'categories' ? 'category' : 'sla'
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            {activeTab === 'sla' ? 'Configurar SLA' : 'Adicionar'}
          </button>
        </div>
      </div>

      {/* Conteúdo das Tabs */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Empresas */}
        {activeTab === 'companies' && (
          <div className="bg-gray-800/50 rounded-xl overflow-x-auto">
            {/* Alerta de empresas que precisam de atenção */}
            {companies.filter(c => c.needsAttention).length > 0 && (
              <div className="bg-yellow-500/10 border-b border-yellow-500/30 p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div className="text-yellow-200 text-sm">
                  <strong>{companies.filter(c => c.needsAttention).length} empresa(s)</strong> criada(s) automaticamente por email precisam ter o cadastro completado.
                </div>
              </div>
            )}
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={selectedCompanies.size === filteredCompanies.length && filteredCompanies.length > 0} onChange={toggleSelectAllCompanies} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Empresa</th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Domínio</th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">CPF/CNPJ</th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Contato</th>
                  <th className="text-center px-4 py-3 tm-text-secondary font-medium">Usuários</th>
                  <th className="text-center px-4 py-3 tm-text-secondary font-medium">Chamados</th>
                  <th className="text-right px-4 py-3 tm-text-secondary font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className={`border-t border-gray-700 hover:bg-gray-800/50 ${company.needsAttention ? 'bg-yellow-500/5' : ''} ${selectedCompanies.has(company.id) ? 'bg-blue-500/10' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedCompanies.has(company.id)} onChange={() => toggleSelectCompany(company.id)} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="tm-text font-medium">{company.name}</span>
                        {company.needsAttention && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Completar cadastro
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {company.domain ? (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-sm rounded">
                          @{company.domain}
                        </span>
                      ) : (
                        <span className="tm-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tm-text">{company.cnpj || '-'}</td>
                    <td className="px-4 py-3 tm-text">
                      <div>{company.email || '-'}</div>
                      <div className="text-sm tm-text-muted">{company.phone || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-center tm-text">{company._count.users}</td>
                    <td className="px-4 py-3 text-center tm-text">{company._count.tickets}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal('company', company)}
                        className="p-2 tm-text-secondary hover:text-blue-400 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete('company', company.id)}
                        className="p-2 tm-text-secondary hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCompanies.length === 0 && (
              <div className="text-center py-8 tm-text-secondary">Nenhuma empresa encontrada</div>
            )}
          </div>
        )}

        {/* Usuários */}
        {activeTab === 'users' && (
          <div>
            {/* Filtros avançados de usuários */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm tm-text-secondary">
                <Filter size={14} />
                Filtros:
              </div>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm tm-text focus:outline-none focus:border-blue-500"
              >
                <option value="">Todos os perfis</option>
                <option value="ADMIN">Administrador</option>
                <option value="SUPPORT">Suporte</option>
                <option value="FINANCE">Financeiro</option>
                <option value="SPECIAL">Especial</option>
                <option value="CLIENT">Cliente</option>
              </select>
              <select
                value={userCompanyFilter}
                onChange={(e) => setUserCompanyFilter(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm tm-text focus:outline-none focus:border-blue-500 max-w-[250px]"
              >
                <option value="">Todas as empresas</option>
                {[...new Set(users.map(u => u.company?.name).filter(Boolean))].sort().map(name => (
                  <option key={name} value={name!}>{name}</option>
                ))}
              </select>
              <span className="text-xs tm-text-muted">{filteredUsers.length} de {users.length} usuário(s)</span>
              <button
                onClick={async () => {
                  try {
                    const XLSX = await import('xlsx');
                    const data = filteredUsers.map(u => ({
                      'Nome': u.name,
                      'Email': u.email,
                      'Perfil': roleLabels[u.role] || u.role,
                      'Empresa': u.company?.name || '-',
                      'MFA': u.mfaEnabled ? 'Ativo' : u.mfaEnforced ? 'Obrigatório' : 'Inativo',
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 15 }, { wch: 30 }, { wch: 12 }];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Usuários');
                    XLSX.writeFile(wb, `usuarios_${new Date().toISOString().slice(0,10)}.xlsx`);
                  } catch (err) { console.error('Export error:', err); alert('Erro ao exportar'); }
                }}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
              >
                <Download size={14} />
                Exportar XLSX
              </button>
            </div>
          <div className="bg-gray-800/50 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onChange={toggleSelectAllUsers} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Nome</th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Email</th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Perfil</th>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Empresa</th>
                  <th className="text-center px-4 py-3 tm-text-secondary font-medium">MFA</th>
                  <th className="text-right px-4 py-3 tm-text-secondary font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={`border-t border-gray-700 hover:bg-gray-800/50 ${selectedUsers.has(user.id) ? 'bg-blue-500/10' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleSelectUser(user.id)} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 tm-text font-medium">{user.name}</td>
                    <td className="px-4 py-3 tm-text">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'ADMIN'
                            ? 'bg-purple-500/20 text-purple-400'
                            : user.role === 'SUPPORT'
                            ? 'bg-blue-500/20 text-blue-400'
                            : user.role === 'FINANCE'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 tm-text-secondary'
                        }`}
                      >
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tm-text">{user.company?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {mfaLoading === user.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        ) : (
                          <>
                            {/* MFA Status badge */}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              user.mfaEnabled ? 'bg-green-500/20 text-green-400' :
                              user.mfaEnforced ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-gray-500/20 tm-text-muted'
                            }`}>
                              {user.mfaEnabled ? 'Ativo' : user.mfaEnforced ? 'Obrigatório' : 'Inativo'}
                            </span>
                            {/* MFA Action buttons */}
                            <div className="flex items-center gap-0.5 ml-1">
                              {!user.mfaEnforced ? (
                                <button
                                  onClick={() => handleMfaAction(user.id, 'enforce')}
                                  title="Obrigar MFA"
                                  className="p-1 tm-text-muted hover:text-yellow-400 transition-colors"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleMfaAction(user.id, 'unenforce')}
                                  title="Remover obrigatoriedade"
                                  className="p-1 text-yellow-400 hover:tm-text-secondary transition-colors"
                                >
                                  <ShieldOff className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {user.mfaEnabled && (
                                <>
                                  <button
                                    onClick={() => handleMfaAction(user.id, 'reset')}
                                    title="Resetar MFA"
                                    className="p-1 tm-text-muted hover:text-orange-400 transition-colors"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMfaAction(user.id, 'disable')}
                                    title="Desativar MFA"
                                    className="p-1 tm-text-muted hover:text-red-400 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal('user', user)}
                        className="p-2 tm-text-secondary hover:text-blue-400 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {user.role !== 'ADMIN' && (
                        <button
                          onClick={() => handleDelete('user', user.id)}
                          className="p-2 tm-text-secondary hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="text-center py-8 tm-text-secondary">Nenhum usuário encontrado</div>
            )}
          </div>
          </div>
        )}

        {/* Categorias */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            {/* Categorias principais (sem pai) */}
            {categories.filter(c => !c.parentId).map((category) => (
              <div key={category.id} className="space-y-2">
                {/* Categoria Principal */}
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                      <div>
                        <h3 className="font-medium tm-text text-lg">{category.name}</h3>
                        <p className="text-sm tm-text-secondary">{category.description || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          category.isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {category.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                      <span className="text-xs tm-text-muted">
                        {category._count.tickets} chamados
                      </span>
                      <button
                        onClick={() => openModal('category', { ...category, parentId: '' })}
                        className="p-1.5 tm-text-secondary hover:text-blue-400 transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setFormData({ name: '', description: '', color: category.color, isActive: true, parentId: category.id });
                          setModalType('category');
                          setEditingItem(null);
                          setError('');
                          setShowModal(true);
                        }}
                        className="p-1.5 tm-text-secondary hover:text-green-400 transition-colors"
                        title="Adicionar subcategoria"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete('category', category.id)}
                        className="p-1.5 tm-text-secondary hover:text-red-400 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Subcategorias */}
                  {category.children && category.children.length > 0 && (
                    <div className="mt-4 ml-6 space-y-2 border-l-2 border-gray-700 pl-4">
                      {category.children.map((sub) => (
                        <div
                          key={sub.id}
                          className="bg-gray-900/50 rounded-lg p-3 flex items-center justify-between hover:bg-gray-900/70 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: sub.color }}
                            />
                            <span className="text-gray-200">{sub.name}</span>
                            {sub.description && (
                              <span className="text-xs tm-text-muted">- {sub.description}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                sub.isActive
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {sub.isActive ? 'Ativa' : 'Inativa'}
                            </span>
                            <span className="text-xs tm-text-muted">
                              {sub._count.tickets} chamados
                            </span>
                            <button
                              onClick={() => openModal('category', sub)}
                              className="p-1 tm-text-secondary hover:text-blue-400 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete('category', sub.id)}
                              className="p-1 tm-text-secondary hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {categories.filter(c => !c.parentId).length === 0 && (
              <div className="text-center py-8 tm-text-secondary">Nenhuma categoria encontrada</div>
            )}
          </div>
        )}

        {/* SLA */}
        {activeTab === 'sla' && (
          <div className="bg-gray-800/50 rounded-xl overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 tm-text-secondary font-medium">Prioridade</th>
                  <th className="text-center px-4 py-3 tm-text-secondary font-medium">Tempo de Resposta</th>
                  <th className="text-center px-4 py-3 tm-text-secondary font-medium">Tempo de Resolução</th>
                  <th className="text-right px-4 py-3 tm-text-secondary font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {slaConfigs.map((sla) => (
                  <tr key={sla.id} className="border-t border-gray-700 hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          sla.priority === 'CRITICAL'
                            ? 'bg-red-500/20 text-red-400'
                            : sla.priority === 'HIGH'
                            ? 'bg-orange-500/20 text-orange-400'
                            : sla.priority === 'MEDIUM'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : sla.priority === 'NONE'
                            ? 'bg-gray-500/20 tm-text-secondary'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {priorityLabels[sla.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center tm-text">{sla.responseTimeHrs > 0 ? `${sla.responseTimeHrs}h` : <span className="tm-text-muted">Sem prazo</span>}</td>
                    <td className="px-4 py-3 text-center tm-text">{sla.resolutionHrs > 0 ? `${sla.resolutionHrs}h` : <span className="tm-text-muted">Sem prazo</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal('sla', sla)}
                        className="p-2 tm-text-secondary hover:text-blue-400 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tm-text">
                {editingItem ? 'Editar' : 'Adicionar'}{' '}
                {modalType === 'company' ? 'Empresa' :
                 modalType === 'user' ? 'Usuário' :
                 modalType === 'category' ? (formData.parentId ? 'Subcategoria' : 'Categoria') : 'SLA'}
              </h2>
              <button onClick={closeModal} className="tm-text-secondary hover:tm-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-2 text-green-400">
                <Check className="w-5 h-5" />
                {success}
              </div>
            )}

            <div className="space-y-4">
              {/* Formulário de Empresa */}
              {modalType === 'company' && (
                <>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Nome *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome da empresa ou cliente"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">CPF/CNPJ</label>
                    <input
                      type="text"
                      value={formData.cnpj || ''}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      placeholder="Digite CPF (11 dígitos) ou CNPJ (14 dígitos)"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs tm-text-muted mt-1">Aceita pessoa física (CPF) ou jurídica (CNPJ)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@empresa.com.br"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Telefone</label>
                    <input
                      type="text"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Domínio de Email</label>
                    <div className="flex items-center">
                      <span className="px-3 py-2 bg-gray-700 border border-r-0 border-gray-600 rounded-l-lg tm-text-secondary">@</span>
                      <input
                        type="text"
                        value={formData.domain || ''}
                        onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                        placeholder="empresa.com.br"
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-r-lg tm-text focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <p className="text-xs tm-text-muted mt-1">Emails deste domínio serão vinculados automaticamente a esta empresa</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Tipo de Cliente</label>
                    <select
                      value={formData.clientType || 'CONTRATO'}
                      onChange={(e) => setFormData({ ...formData, clientType: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    >
                      <option value="CONTRATO">Contrato</option>
                      <option value="AVULSO">Avulso</option>
                      <option value="PROJETO">Projeto</option>
                      <option value="PARCEIRO">Parceiro</option>
                    </select>
                    <p className="text-xs tm-text-muted mt-1">Classificação do cliente para relatórios e faturamento</p>
                  </div>
                  {editingItem?.needsAttention && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="text-yellow-200 font-medium">Empresa criada automaticamente</p>
                        <p className="text-yellow-200/70">Complete o cadastro com as informações pendentes. Ao salvar, o alerta será removido.</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Formulário de Usuário */}
              {modalType === 'user' && (
                <>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Nome *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">
                      Senha {editingItem ? '(deixe em branco para manter)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Perfil</label>
                    <select
                      value={formData.role || 'CLIENT'}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        if (['ADMIN', 'SUPPORT', 'FINANCE', 'SPECIAL'].includes(newRole)) {
                          setFormData({ ...formData, role: newRole, companyId: '' });
                        } else {
                          setFormData({ ...formData, role: newRole });
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    >
                      <option value="CLIENT">Cliente</option>
                      <option value="SUPPORT">Suporte</option>
                      <option value="FINANCE">Financeiro</option>
                      <option value="ADMIN">Administrador</option>
                      <option value="SPECIAL">Especial</option>
                    </select>
                  </div>

                  {/* Seleção de menus para SPECIAL */}
                  {formData.role === 'SPECIAL' && (
                    <div>
                      <label className="block text-sm font-medium tm-text mb-2">Menus Permitidos</label>
                      <div className="grid grid-cols-2 gap-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                        {[
                          { key: 'dashboard', label: 'Dashboard' },
                          { key: 'tickets', label: 'Chamados' },
                          { key: 'workspace', label: 'Workspace' },
                          { key: 'kb', label: 'Base de Conhecimento' },
                          { key: 'rmm', label: 'RMM' },
                          { key: 'inventory', label: 'Inventário' },
                          { key: 'ai-chat', label: 'Assistente IA' },
                          { key: 'finance', label: 'Financeiro' },
                          { key: 'reports', label: 'Relatórios' },
                          { key: 'agenda', label: 'Agenda' },
                          { key: 'telemetry', label: 'Telemetria' },
                          { key: 'security', label: 'Segurança' },
                          { key: 'admin', label: 'Administração' },
                          { key: 'monitoring', label: 'Monitoramento' },
                        ].map(item => {
                          const currentMenus: string[] = formData.allowedMenus ? (typeof formData.allowedMenus === 'string' ? JSON.parse(formData.allowedMenus) : formData.allowedMenus) : [];
                          const isChecked = currentMenus.includes(item.key);
                          return (
                            <label key={item.key} className="flex items-center gap-2 text-sm tm-text-secondary cursor-pointer hover:tm-text">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const menus = isChecked ? currentMenus.filter((m: string) => m !== item.key) : [...currentMenus, item.key];
                                  setFormData({ ...formData, allowedMenus: menus });
                                }}
                                className="rounded"
                              />
                              {item.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs tm-text-muted mt-1">Selecione os menus que este usuário poderá acessar</p>
                    </div>
                  )}

                  {/* Empresa só é obrigatória para CLIENT */}
                  {formData.role === 'CLIENT' ? (
                    <div>
                      <label className="block text-sm font-medium tm-text mb-1">Empresa *</label>
                      <select
                        value={formData.companyId || ''}
                        onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Selecione uma empresa</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs tm-text-muted mt-1">Obrigatório para usuários do tipo Cliente</p>
                    </div>
                  ) : formData.role === 'SPECIAL' ? (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                      <p className="text-sm text-purple-300">
                        Usuários do tipo <strong>Especial</strong> são usuários internos do sistema e não devem ser vinculados a nenhum cliente. O acesso é controlado pelas permissões de menu selecionadas acima.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <p className="text-sm text-blue-300">
                        Usuários do tipo <strong>{formData.role === 'ADMIN' ? 'Administrador' : formData.role === 'FINANCE' ? 'Financeiro' : 'Suporte'}</strong> têm acesso a todos os chamados e não precisam estar vinculados a uma empresa.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Formulário de Categoria */}
              {modalType === 'category' && (
                <>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Categoria Pai</label>
                    <select
                      value={formData.parentId || ''}
                      onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Nenhuma (categoria principal)</option>
                      {categories.filter(c => !c.parentId && c.id !== editingItem?.id).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {formData.parentId && (
                      <p className="text-xs tm-text-muted mt-1">
                        Esta será uma subcategoria de &quot;{categories.find(c => c.id === formData.parentId)?.name}&quot;
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Nome *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                      placeholder={formData.parentId ? 'Nome da subcategoria' : 'Nome da categoria'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Descrição</label>
                    <input
                      type="text"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                      placeholder="Descrição opcional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Cor</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.color || '#3B82F6'}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-12 h-10 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.color || '#3B82F6'}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive !== false}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="isActive" className="text-sm tm-text">
                      {formData.parentId ? 'Subcategoria ativa' : 'Categoria ativa'}
                    </label>
                  </div>
                </>
              )}

              {/* Formulário de SLA */}
              {modalType === 'sla' && (
                <>
                  <div>
                    <label className="block text-sm font-medium tm-text mb-1">Prioridade</label>
                    <select
                      value={formData.priority || 'MEDIUM'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      disabled={!!editingItem}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="CRITICAL">Crítica</option>
                      <option value="NONE">Sem SLA</option>
                    </select>
                  </div>
                  {formData.priority === 'NONE' ? (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-center">
                      <p className="tm-text-secondary text-sm">Sem SLA — nenhum prazo será aplicado aos chamados com esta prioridade.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium tm-text mb-1">
                          Tempo de Resposta (horas)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.responseTimeHrs || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, responseTimeHrs: parseInt(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium tm-text mb-1">
                          Tempo de Resolução (horas)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.resolutionHrs || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, resolutionHrs: parseInt(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 tm-text-secondary hover:tm-text transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Salvar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}