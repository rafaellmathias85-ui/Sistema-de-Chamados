'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Eye,
  ThumbsUp,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  viewCount: number;
  helpfulYes: number;
  publishedAt: string | null;
}

export default function CategoryArticlesPage() {
  const params = useParams();
  const [articles, setArticles] = useState<Article[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArticles();
  }, [params.id]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kb/articles?categoryId=${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
        if (data.articles?.length > 0) {
          setCategoryName(data.articles[0].category?.name || '');
        }
      }
      
      // Buscar nome da categoria
      const catRes = await fetch('/api/kb/categories');
      if (catRes.ok) {
        const categories = await catRes.json();
        const cat = categories.find((c: any) => c.id === params.id);
        if (cat) setCategoryName(cat.name);
      }
    } catch (err) {
      console.error('Erro ao carregar artigos:', err);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Navegação */}
      <div className="flex items-center gap-2 text-sm tm-text-muted">
        <Link href="/tickets/kb" className="hover:text-gray-700">
          Base de Conhecimento
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{categoryName}</span>
      </div>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
          <p className="text-gray-600">{articles.length} artigos</p>
        </div>
        <Link
          href="/tickets/kb"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
      </div>

      {/* Lista de Artigos */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : articles.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {articles.map((article, i) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/tickets/kb/${article.slug}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{article.title}</h3>
                    {article.excerpt && (
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">{article.excerpt}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs tm-text-muted">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {article.viewCount} visualizações
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" /> {article.helpfulYes} acharam útil
                      </span>
                      {article.publishedAt && (
                        <span>
                          {new Date(article.publishedAt).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 tm-text-secondary" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <FileText className="w-12 h-12 tm-text mx-auto mb-3" />
          <p className="tm-text-muted">Nenhum artigo nesta categoria ainda</p>
        </div>
      )}
    </div>
  );
}
