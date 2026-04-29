'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Eye,
  Calendar,
  User,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Tag,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  authorName: string;
  tags: string[];
  category: { id: string; name: string; icon: string };
  createdAt: string;
  publishedAt: string | null;
}

export default function ArticlePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const isStaff = session?.user?.role && ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role);

  useEffect(() => {
    loadArticle();
  }, [params.slug]);

  const loadArticle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kb/articles/${params.slug}`);
      if (res.ok) {
        setArticle(await res.json());
      } else {
        router.push('/tickets/kb');
      }
    } catch (err) {
      console.error('Erro ao carregar artigo:', err);
    }
    setLoading(false);
  };

  const handleFeedback = async (helpful: boolean) => {
    if (feedbackGiven || !article) return;
    try {
      const res = await fetch(`/api/kb/articles/${params.slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpful }),
      });
      if (res.ok) {
        setFeedbackGiven(true);
        setArticle(prev => prev ? {
          ...prev,
          helpfulYes: helpful ? prev.helpfulYes + 1 : prev.helpfulYes,
          helpfulNo: !helpful ? prev.helpfulNo + 1 : prev.helpfulNo,
        } : null);
      }
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="text-center py-12">
        <BookOpen className="w-16 h-16 tm-text mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">Artigo não encontrado</h2>
        <Link href="/tickets/kb" className="text-blue-600 hover:underline mt-2 inline-block">
          Voltar à Base de Conhecimento
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Navegação */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/tickets/kb"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        {isStaff && (
          <Link
            href={`/tickets/kb/manage?edit=${article.slug}`}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
            Editar
          </Link>
        )}
      </div>

      {/* Artigo */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
      >
        {/* Cabeçalho */}
        <div className="p-6 sm:p-8 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Link
              href={`/tickets/kb/category/${article.category.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {article.category.name}
            </Link>
            {article.isFeatured && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                Destaque
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm tm-text-muted">
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {article.authorName}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('pt-BR') : 'Rascunho'}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {article.viewCount} visualizações
            </span>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6 sm:p-8">
          <div 
            className="prose prose-blue max-w-none"
            dangerouslySetInnerHTML={{ __html: article.content.replace(/\n/g, '<br/>') }}
          />
        </div>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="px-6 sm:px-8 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="w-4 h-4 tm-text-secondary" />
              {article.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Feedback */}
        <div className="px-6 sm:px-8 py-6 bg-gray-50 border-t border-gray-100">
          <div className="text-center">
            <p className="text-gray-700 mb-4">Este artigo foi útil?</p>
            {feedbackGiven ? (
              <p className="text-green-600 font-medium">Obrigado pelo seu feedback!</p>
            ) : (
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => handleFeedback(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                >
                  <ThumbsUp className="w-5 h-5" />
                  Sim ({article.helpfulYes})
                </button>
                <button
                  onClick={() => handleFeedback(false)}
                  className="flex items-center gap-2 px-6 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  <ThumbsDown className="w-5 h-5" />
                  Não ({article.helpfulNo})
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.article>
    </div>
  );
}
