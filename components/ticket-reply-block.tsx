'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import EmailHtmlViewer from '@/components/email-html-viewer';

interface TicketReplyBlockProps {
  content: string;        // original body
  contentHtml?: string | null;
  bodyClean?: string | null;
  bodyQuoted?: string | null;
  bodyParseMethod?: string | null;
}

// Basic HTML sanitizer for client-side rendering
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '');
}

export default function TicketReplyBlock({
  content,
  contentHtml,
  bodyClean,
  bodyQuoted,
  bodyParseMethod,
}: TicketReplyBlockProps) {
  const [showQuoted, setShowQuoted] = useState(false);

  // Determine what to display as main content
  const hasCleanContent = bodyClean && bodyClean.trim().length > 0;
  const hasQuotedContent = bodyQuoted && bodyQuoted.trim().length > 0;
  const isParsed = bodyParseMethod === 'parsed';

  // Main content: bodyClean if parsed, otherwise fall back to content/contentHtml
  const mainContent = isParsed && hasCleanContent ? bodyClean : null;
  const isMainHtml = isParsed && hasCleanContent && contentHtml;

  // If not parsed, use original rendering
  if (!isParsed || !hasCleanContent) {
    if (contentHtml) {
      return <EmailHtmlViewer html={contentHtml} plainText={content || ''} />;
    }
    return (
      <div className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
        {content}
      </div>
    );
  }

  return (
    <div>
      {/* Main reply content */}
      {isMainHtml ? (
        <EmailHtmlViewer html={sanitizeHtml(mainContent || '')} plainText={content || ''} />
      ) : (
        <div className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
          {mainContent}
        </div>
      )}

      {/* Quoted history toggle */}
      {hasQuotedContent && (
        <div className="mt-3">
          <button
            onClick={() => setShowQuoted(!showQuoted)}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: 'var(--text-muted)',
              background: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
            }}
          >
            {showQuoted ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showQuoted ? 'Ocultar histórico citado' : '▼ Ver histórico citado'}
          </button>

          {showQuoted && (
            <div
              className="mt-2 pl-3 text-sm max-h-[300px] overflow-y-auto"
              style={{
                borderLeft: '3px solid var(--border-color)',
                color: 'var(--text-muted)',
              }}
            >
              {isMainHtml ? (
                <div
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyQuoted || '') }}
                  className="prose prose-sm max-w-none dark:prose-invert"
                />
              ) : (
                <div className="whitespace-pre-wrap">
                  {bodyQuoted}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
