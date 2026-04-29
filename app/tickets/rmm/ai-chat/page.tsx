'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Bot, Send, ChevronLeft, Loader2, Sparkles, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;
    if (!['ADMIN', 'SUPPORT'].includes(session?.user?.role || '')) { router.push('/tickets'); return; }
  }, [status, session, router]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const res = await fetch('/api/rmm/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      });

      if (!res.ok) {
        setMessages(prev => { const msgs = [...prev]; msgs[msgs.length - 1] = { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' }; return msgs; });
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let partialRead = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                setMessages(prev => {
                  const msgs = [...prev];
                  msgs[msgs.length - 1] = { role: 'assistant', content: fullContent };
                  return msgs;
                });
              }
            } catch {}
          }
        }
      }

      if (!fullContent) {
        setMessages(prev => { const msgs = [...prev]; msgs[msgs.length - 1] = { role: 'assistant', content: 'Sem resposta da IA.' }; return msgs; });
      }
    } catch (err) {
      setMessages(prev => { const msgs = [...prev]; msgs[msgs.length - 1] = { role: 'assistant', content: 'Erro de conexão.' }; return msgs; });
    } finally {
      setStreaming(false);
    }
  };

  const formatContent = (content: string) => {
    // Simple markdown-like rendering for code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
        return <pre key={i} className="bg-black/50 rounded-lg p-3 my-2 text-xs text-cyan-300 overflow-x-auto font-mono">{code}</pre>;
      }
      return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b tm-border">
        <button onClick={() => router.push('/tickets/rmm')} className="p-2 hover:bg-white/10 rounded-lg"><ChevronLeft size={20} /></button>
        <Bot className="text-purple-400" size={28} />
        <div>
          <h1 className="text-xl font-bold tm-text">Assistente IA</h1>
          <p className="tm-text-secondary text-sm">Suporte técnico com base de conhecimento</p>
        </div>
        <button onClick={() => setMessages([])} className="ml-auto p-2 hover:bg-white/10 rounded-lg tm-text-secondary" title="Limpar chat">
          <Trash2 size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <Sparkles size={48} className="mx-auto mb-4 text-purple-400/30" />
            <h2 className="text-lg font-medium tm-text mb-2">Assistente Técnico IA</h2>
            <p className="tm-text-secondary text-sm max-w-md mx-auto">Pergunte sobre diagnósticos, comandos, scripts ou problemas técnicos. Usa base de conhecimento com tickets resolvidos e scripts aprovados.</p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {['Como reiniciar o spooler de impressão?', 'Script para verificar uso de disco', 'Como diagnosticar lentidão no servidor?', 'Comando para listar usuários do AD'].map(q => (
                <button key={q} onClick={() => { setInput(q); }}
                  className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-xs hover:bg-white/10 transition-colors">{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'tm-bg-card border tm-border text-gray-200'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1">
                  <Bot size={14} className="text-purple-400" />
                  <span className="text-purple-400 text-xs font-medium">Assistente</span>
                </div>
              )}
              <div className="text-sm leading-relaxed">
                {msg.role === 'assistant' ? formatContent(msg.content) : msg.content}
                {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                  <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />
                )}
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t tm-border">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            className="flex-1 px-4 py-3 tm-bg-card border tm-border rounded-xl tm-text text-sm focus:outline-none focus:border-purple-500"
            placeholder="Pergunte sobre problemas técnicos, comandos, scripts..." disabled={streaming} />
          <button onClick={sendMessage} disabled={!input.trim() || streaming}
            className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50">
            {streaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
