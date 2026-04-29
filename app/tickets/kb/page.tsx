'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Search,
  FileText,
  Book,
  HelpCircle,
  Settings,
  Shield,
  Lightbulb,
  ChevronRight,
  Star,
  Eye,
  ThumbsUp,
  Plus,
} from 'lucide-react';
import Link from 'next/link';

const iconMap: Record<string, any> = {
  FileText,
  Book,
  HelpCircle,
  Settings,
  Shield,
  Lightbulb,
};

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  _count: { articles: number };
}

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  isFeatured: boolean;
  viewCount: number;
  helpfulYes: number;
  category: { id: string; name: string; icon: string };
}

export default function KnowledgeBasePage() {
  const { data: session } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredArticles, setFeaturedArticles] = useState<Article[]>([]);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  const isStaff = session?.user?.role && ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, featuredRes, recentRes] = await Promise.all([
        fetch('/api/kb/categories?activeOnly=true'),
        fetch('/api/kb/articles?featured=true&limit=4'),
        fetch('/api/kb/articles?limit=6'),
      ]);

      if (catRes.ok) setCategories(await catRes.json());
      if (featuredRes.ok) {
        const data = await featuredRes.json();
        setFeaturedArticles(data.articles || []);
      }
      if (recentRes.ok) {
        const data = await recentRes.json();
        setRecentArticles(data.articles || []);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/kb/articles?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.articles || []);
      }
    } catch (err) {
      console.error('Erro na busca:', err);
    }
    setSearching(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Base de Conhecimento</h1>
          <p className="text-gray-600">Encontre respostas para suas dúvidas</p>
        </motion.div>

        {/* Busca */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 max-w-2xl mx-auto"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-secondary" />
            <input
              type="text"
              placeholder="Buscar artigos, tutoriais, soluções..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
          </div>
        </motion.div>

        {isStaff && (
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/tickets/kb/manage"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Gerenciar Artigos
            </Link>
          </div>
        )}
      </div>

      {/* Resultados da Busca */}
      {searchQuery && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
        >
          <h3 className="font-semibold text-gray-900 mb-4">
            {searching ? 'Buscando...' : `${searchResults.length} resultado(s) para "${searchQuery}"`}
          </h3>
          {searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map(article => (
                <Link
                  key={article.id}
                  href={`/tickets/kb/${article.slug}`}
                  className="block p-4 border border-gray-100 rounded-lg hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-gray-900">{article.title}</h4>
                      {article.excerpt && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{article.excerpt}</p>
                      )}
                      <span className="text-xs text-blue-600 mt-2 inline-block">{article.category.name}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : !searching && (
            <p className="tm-text-muted text-center py-4">Nenhum artigo encontrado</p>
          )}
        </motion.div>
      )}

      {/* Categorias */}
      {!searchQuery && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Categorias</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat, i) => {
                const IconComponent = iconMap[cat.icon] || FileText;
                return (
                  <Link
                    key={cat.id}
                    href={`/tickets/kb/category/${cat.id}`}
                    className="group"
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * i }}
                      className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                          <IconComponent className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                          <p className="text-sm tm-text-muted">{cat._count.articles} artigos</p>
                        </div>
                        <ChevronRight className="w-5 h-5 tm-text-secondary group-hover:text-blue-600 transition-colors" />
                      </div>
                      {cat.description && (
                        <p className="mt-3 text-sm text-gray-600 line-clamp-2">{cat.description}</p>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </motion.div>

          {/* Artigos em Destaque */}
          {featuredArticles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                Em Destaque
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featuredArticles.map(article => (
                  <Link
                    key={article.id}
                    href={`/tickets/kb/${article.slug}`}
                    className="block bg-gradient-to-br from-blue-50 to-white rounded-xl p-6 border border-blue-100 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{article.title}</h3>
                        {article.excerpt && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{article.excerpt}</p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-xs tm-text-muted">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {article.viewCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" /> {article.helpfulYes}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Artigos Recentes */}
          {recentArticles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Artigos Recentes</h2>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
                {recentArticles.map(article => (
                  <Link
                    key={article.id}
                    href={`/tickets/kb/${article.slug}`}
                    className="block p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 tm-text-secondary" />
                        <div>
                          <h4 className="font-medium text-gray-900">{article.title}</h4>
                          <span className="text-xs tm-text-muted">{article.category.name}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 tm-text-secondary" />
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
