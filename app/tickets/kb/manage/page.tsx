'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Star,
  Save,
  X,
  ArrowLeft,
  FolderOpen,
} from 'lucide-react';
import Link from 'next/link';

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  isActive: boolean;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  categoryId: string;
  tags: string[];
  category: { name: string };
}

export default function ManageKBPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editSlug = searchParams.get('edit');

  const [activeTab, setActiveTab] = useState<'articles' | 'categories'>('articles');
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      if (!['ADMIN', 'SUPPORT', 'FINANCE'].includes(session?.user?.role || '')) {
        router.push('/tickets/kb');
      } else {
        loadData();
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (editSlug && articles.length > 0) {
      const article = articles.find(a => a.slug === editSlug);
      if (article) {
        openArticleModal(article);
      }
    }
  }, [editSlug, articles]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, artRes] = await Promise.all([
        fetch('/api/kb/categories'),
        fetch('/api/kb/articles?published=all&limit=100'),
      ]);

      if (catRes.ok) setCategories(await catRes.json());
      if (artRes.ok) {
        const data = await artRes.json();
        setArticles(data.articles || []);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
    setLoading(false);
  };

  const openArticleModal = (article?: Article) => {
    setEditingCategory(null);
    setEditingArticle(article || null);
    setFormData(article ? {
      title: article.title,
      content: article.content,
      excerpt: article.excerpt || '',
      categoryId: article.categoryId,
      tags: article.tags.join(', '),
      isPublished: article.isPublished,
      isFeatured: article.isFeatured,
    } : {
      title: '',
      content: '',
      excerpt: '',
      categoryId: categories[0]?.id || '',
      tags: '',
      isPublished: false,
      isFeatured: false,
    });
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const openCategoryModal = (category?: Category) => {
    setEditingArticle(null);
    setEditingCategory(category || null);
    setFormData(category ? {
      name: category.name,
      description: category.description || '',
      icon: category.icon,
      isActive: category.isActive,
    } : {
      name: '',
      description: '',
      icon: 'FileText',
      isActive: true,
    });
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const handleSaveArticle = async () => {
    setError('');
    try {
      const tagsArray = formData.tags
        ? formData.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
        : [];

      const body = {
        title: formData.title,
        content: formData.content,
        excerpt: formData.excerpt || null,
        categoryId: formData.categoryId,
        tags: tagsArray,
        isPublished: formData.isPublished,
        isFeatured: formData.isFeatured,
      };

      const url = editingArticle 
        ? `/api/kb/articles/${editingArticle.slug}`
        : '/api/kb/articles';
      
      const res = await fetch(url, {
        method: editingArticle ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSuccess('Artigo salvo com sucesso!');
        loadData();
        setTimeout(() => {
          setShowModal(false);
          router.replace('/tickets/kb/manage');
        }, 1000);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao salvar artigo');
      }
    } catch (err) {
      setError('Erro ao salvar artigo');
    }
  };

  const handleSaveCategory = async () => {
    setError('');
    try {
      const url = editingCategory 
        ? `/api/kb/categories/${editingCategory.id}`
        : '/api/kb/categories';
      
      const res = await fetch(url, {
        method: editingCategory ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSuccess('Categoria salva com sucesso!');
        loadData();
        setTimeout(() => setShowModal(false), 1000);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao salvar categoria');
      }
    } catch (err) {
      setError('Erro ao salvar categoria');
    }
  };

  const handleDeleteArticle = async (slug: string) => {
    if (!confirm('Tem certeza que deseja excluir este artigo?')) return;
    try {
      const res = await fetch(`/api/kb/articles/${slug}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch (err) {
      console.error('Erro ao excluir artigo:', err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      const res = await fetch(`/api/kb/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir');
      }
    } catch (err) {
      console.error('Erro ao excluir categoria:', err);
    }
  };

  const togglePublished = async (article: Article) => {
    try {
      await fetch(`/api/kb/articles/${article.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !article.isPublished }),
      });
      loadData();
    } catch (err) {
      console.error('Erro ao atualizar:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/tickets/kb"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gerenciar Base de Conhecimento</h1>
            <p className="text-gray-600">Criar e editar artigos e categorias</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('articles')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'articles'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent tm-text-muted hover:text-gray-700'
          }`}
        >
          Artigos ({articles.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent tm-text-muted hover:text-gray-700'
          }`}
        >
          Categorias ({categories.length})
        </button>
      </div>

      {/* Conteúdo */}
      {activeTab === 'articles' ? (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => openArticleModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Artigo
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium tm-text-muted">Título</th>
                  <th className="px-4 py-3 text-left text-sm font-medium tm-text-muted">Categoria</th>
                  <th className="px-4 py-3 text-center text-sm font-medium tm-text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium tm-text-muted">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {articles.map(article => (
                  <tr key={article.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {article.isFeatured && <Star className="w-4 h-4 text-yellow-500" />}
                        <span className="font-medium text-gray-900">{article.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{article.category.name}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => togglePublished(article)}
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          article.isPublished
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {article.isPublished ? 'Publicado' : 'Rascunho'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openArticleModal(article)}
                          className="p-1 tm-text-muted hover:text-blue-600 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteArticle(article.slug)}
                          className="p-1 tm-text-muted hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => openCategoryModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Categoria
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-900">{cat.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {cat.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                {cat.description && (
                  <p className="text-sm text-gray-600 mb-3">{cat.description}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => openCategoryModal(cat)}
                    className="p-1 tm-text-muted hover:text-blue-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1 tm-text-muted hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingArticle ? 'Editar Artigo' : editingCategory ? 'Editar Categoria' : 
                  (activeTab === 'articles' ? 'Novo Artigo' : 'Nova Categoria')}
              </h3>
              <button onClick={() => { setShowModal(false); router.replace('/tickets/kb/manage'); }}>
                <X className="w-5 h-5 tm-text-muted" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>}

              {(editingArticle !== null || (!editingCategory && activeTab === 'articles')) ? (
                // Formulário de Artigo
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                    <select
                      value={formData.categoryId || ''}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione...</option>
                      {categories.filter(c => c.isActive).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo</label>
                    <textarea
                      value={formData.content || ''}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      rows={10}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Resumo (opcional)</label>
                    <textarea
                      value={formData.excerpt || ''}
                      onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (separadas por vírgula)</label>
                    <input
                      type="text"
                      value={formData.tags || ''}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="vpn, acesso remoto, configuração"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isPublished || false}
                        onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Publicado</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isFeatured || false}
                        onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Destaque</span>
                    </label>
                  </div>
                </>
              ) : (
                // Formulário de Categoria
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ícone</label>
                    <select
                      value={formData.icon || 'FileText'}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="FileText">Documento</option>
                      <option value="Book">Livro</option>
                      <option value="HelpCircle">Ajuda</option>
                      <option value="Settings">Configurações</option>
                      <option value="Shield">Segurança</option>
                      <option value="Lightbulb">Dica</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive !== false}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Categoria ativa</span>
                  </label>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => { setShowModal(false); router.replace('/tickets/kb/manage'); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={editingCategory || (!editingArticle && activeTab === 'categories') ? handleSaveCategory : handleSaveArticle}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Salvar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
