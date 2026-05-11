'use client';
import { useState, useMemo } from 'react';
import { Mail, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface EmailHtmlViewerProps {
  html: string;
  plainText: string;
}

/**
 * Client-side HTML sanitizer (fallback). The server-side sanitize-html is stronger;
 * this is here to strip any lingering script/handler leaks. Keeps formatting rich.
 */
function sanitizeClient(html: string): string {
  if (!html) return '';
  let result = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '');
  // Remover imagens CID não resolvidas (normalmente logos de assinatura) — silencioso
  result = result.replace(
    /<img\b[^>]*\bsrc\s*=\s*["']cid:[^"']*["'][^>]*\/?>/gi,
    ''
  );
  return result;
}

function looksLikeBounce(text: string, html: string): boolean {
  const combined = (text + ' ' + html).toLowerCase();
  return /undelivered mail|delivery (?:has )?failed|delivery status notification|mail delivery failed|returned mail|n(?:a|ã)o entregue|falha (?:na )?entrega|mailer[- ]?daemon|message blocked/i.test(
    combined,
  );
}

/**
 * Renderer estilo N-able / Kaseya / Millvus:
 *  - HTML já vem sanitizado do servidor, porém aplicamos sanitização cliente adicional.
 *  - Renderizado dentro de container .email-body com prose (tailwind-typography).
 *  - Alternancia entre HTML e texto puro.
 *  - Destaca alertas de bounce (NDR) com faixa laranja.
 */
export default function EmailHtmlViewer({ html, plainText }: EmailHtmlViewerProps) {
  const [showHtml, setShowHtml] = useState(true);

  const safeHtml = useMemo(() => sanitizeClient(html || ''), [html]);
  const isBounce = useMemo(() => looksLikeBounce(plainText || '', html || ''), [html, plainText]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Mail size={14} className="text-blue-400" />
        <span className="text-xs text-blue-400 font-medium">Conteúdo de E-mail</span>
        {isBounce && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
            style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.4)' }}
          >
            <AlertTriangle size={10} /> E-MAIL NÃO ENTREGUE
          </span>
        )}
        <button
          onClick={() => setShowHtml(!showHtml)}
          className="ml-auto flex items-center gap-1 text-xs tm-text-muted hover:tm-text transition-colors"
          type="button"
        >
          {showHtml ? <EyeOff size={12} /> : <Eye size={12} />}
          {showHtml ? 'Ver texto' : 'Ver HTML'}
        </button>
      </div>
      {showHtml ? (
        <div
          className="email-body prose prose-sm prose-invert max-w-none rounded-lg p-3"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            overflowX: 'auto',
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : (
        <p className="tm-text whitespace-pre-wrap text-sm">{plainText}</p>
      )}
    </div>
  );
}
