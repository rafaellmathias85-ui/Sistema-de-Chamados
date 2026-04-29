/**
 * Email Body Parser - Separa resposta nova do histórico citado.
 * Equivalente ao email_parser.py mas em TypeScript/Node.js.
 * Detecta padrões de: Outlook PT/EN, Gmail PT/EN, blockquote HTML, div citados.
 */

// ===== Text-based splitting =====

const TEXT_QUOTE_PATTERNS = [
  // Outlook PT: "De: ... Enviado: ... Para: ..."
  /^-{2,}\s*Mensagem\s+original\s*-{2,}/im,
  /^De:\s*.+\nEnviado:\s*.+\nPara:\s*/im,
  /^De:\s*.+\nSent:\s*/im,
  // Outlook EN: "From: ... Sent: ... To: ..."
  /^-{2,}\s*Original\s+Message\s*-{2,}/im,
  /^From:\s*.+\nSent:\s*.+\nTo:\s*/im,
  /^From:\s*.+\nDate:\s*/im,
  // Gmail PT: "Em dd/mm/aaaa ... escreveu:"
  /^Em\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}.+escreveu:/im,
  // Gmail EN: "On ... wrote:"
  /^On\s+.+wrote:/im,
  // Simple quoted lines (> prefix)
  /^>{1,3}\s/m,
  // Separator lines
  /^_{10,}/m,
  /^={10,}/m,
];

export function splitEmailBodyText(body: string): { clean: string; quoted: string } {
  if (!body) return { clean: '', quoted: '' };

  let splitIndex = -1;
  let matchLength = 0;

  for (const pattern of TEXT_QUOTE_PATTERNS) {
    const match = body.match(pattern);
    if (match && match.index !== undefined) {
      // If this is a ">" pattern, only split if there are multiple consecutive quoted lines
      if (pattern.source.startsWith('^>{1,3}')) {
        const lines = body.split('\n');
        let quotedStartLine = -1;
        let consecutiveQuoted = 0;
        for (let i = 0; i < lines.length; i++) {
          if (/^>/.test(lines[i])) {
            if (quotedStartLine === -1) quotedStartLine = i;
            consecutiveQuoted++;
          } else {
            if (consecutiveQuoted >= 3) break;
            quotedStartLine = -1;
            consecutiveQuoted = 0;
          }
        }
        if (consecutiveQuoted >= 3 && quotedStartLine >= 0) {
          const idx = body.indexOf(lines[quotedStartLine]);
          if (idx > 0 && (splitIndex === -1 || idx < splitIndex)) {
            splitIndex = idx;
            matchLength = 0;
          }
        }
        continue;
      }

      if (splitIndex === -1 || match.index < splitIndex) {
        splitIndex = match.index;
        matchLength = match[0].length;
      }
    }
  }

  if (splitIndex > 0) {
    return {
      clean: body.substring(0, splitIndex).trim(),
      quoted: body.substring(splitIndex).trim(),
    };
  }

  return { clean: body.trim(), quoted: '' };
}

// ===== HTML-based splitting =====

const HTML_QUOTE_SELECTORS = [
  // Outlook: div#divRplyFwdMsg
  '<div id="divRplyFwdMsg"',
  '<div id="divRplyFwdMsg',
  '<div id=divRplyFwdMsg',
  // Gmail: div.gmail_quote
  '<div class="gmail_quote"',
  '<div class="gmail_quote',
  // Apple Mail
  '<div class="AppleOriginalContents"',
  // Generic blockquotes
  '<blockquote',
  // Outlook separator
  '<hr style="display:inline-block',
  '<hr tabindex="-1"',
  // Text patterns in HTML
  '-----Mensagem original-----',
  '-----Original Message-----',
  '________________________________',
];

export function splitEmailBodyHtml(html: string): { cleanHtml: string; quotedHtml: string } {
  if (!html) return { cleanHtml: '', quotedHtml: '' };

  let splitIndex = -1;
  let bestSelector = '';

  for (const selector of HTML_QUOTE_SELECTORS) {
    const idx = html.toLowerCase().indexOf(selector.toLowerCase());
    if (idx > 0 && (splitIndex === -1 || idx < splitIndex)) {
      splitIndex = idx;
      bestSelector = selector;
    }
  }

  // Also check for "De:/From:" patterns inside HTML
  const dePatterns = [
    /(<(?:p|div|span)[^>]*>\s*(?:<(?:b|strong)[^>]*>)?\s*De:\s)/i,
    /(<(?:p|div|span)[^>]*>\s*(?:<(?:b|strong)[^>]*>)?\s*From:\s)/i,
    /(<(?:p|div|span)[^>]*>\s*-{2,}\s*Mensagem\s+original)/i,
    /(<(?:p|div|span)[^>]*>\s*-{2,}\s*Original\s+Message)/i,
  ];

  for (const pattern of dePatterns) {
    const match = html.match(pattern);
    if (match && match.index !== undefined && match.index > 0) {
      if (splitIndex === -1 || match.index < splitIndex) {
        splitIndex = match.index;
      }
    }
  }

  if (splitIndex > 0) {
    return {
      cleanHtml: html.substring(0, splitIndex).trim(),
      quotedHtml: html.substring(splitIndex).trim(),
    };
  }

  return { cleanHtml: html.trim(), quotedHtml: '' };
}

// ===== Main parser =====

export interface ParsedEmailBody {
  bodyClean: string;
  bodyQuoted: string;
  bodyParseMethod: 'parsed' | 'raw' | 'fallback';
}

export function parseEmailBody(body: string, isHtml: boolean = false): ParsedEmailBody {
  if (!body || !body.trim()) {
    return { bodyClean: '', bodyQuoted: '', bodyParseMethod: 'raw' };
  }

  try {
    if (isHtml) {
      const { cleanHtml, quotedHtml } = splitEmailBodyHtml(body);
      if (quotedHtml) {
        return { bodyClean: cleanHtml, bodyQuoted: quotedHtml, bodyParseMethod: 'parsed' };
      }
      // Try text splitting as fallback (strip HTML first)
      const textBody = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const { clean, quoted } = splitEmailBodyText(textBody);
      if (quoted) {
        return { bodyClean: clean, bodyQuoted: quoted, bodyParseMethod: 'parsed' };
      }
      return { bodyClean: body.trim(), bodyQuoted: '', bodyParseMethod: 'raw' };
    } else {
      const { clean, quoted } = splitEmailBodyText(body);
      if (quoted) {
        return { bodyClean: clean, bodyQuoted: quoted, bodyParseMethod: 'parsed' };
      }
      return { bodyClean: body.trim(), bodyQuoted: '', bodyParseMethod: 'raw' };
    }
  } catch (error) {
    console.error('[EmailParser] Error parsing body:', error);
    return { bodyClean: body.trim(), bodyQuoted: '', bodyParseMethod: 'fallback' };
  }
}

// ===== HTML Sanitization =====

// Tags perigosas — inclui style para prevenir CSS injection (exfiltração de dados via background-image, etc.)
const UNSAFE_TAGS = /<(\/?)(?:script|iframe|object|embed|applet|form|input|button|link|meta|style|base|svg|math|template|textarea|select|details|dialog)[^>]*>/gi;
// Conteúdo entre tags style (remove blocos inteiros <style>...</style>)
const STYLE_BLOCKS = /<style[^>]*>[\s\S]*?<\/style>/gi;
const EVENT_HANDLERS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Atributos inline style perigosos (expressões, url(), behavior)
const DANGEROUS_CSS = /expression\s*\(|behavior\s*:|url\s*\(\s*(?!data:image\/)/gi;

export function sanitizeHtmlBasic(html: string): string {
  if (!html) return '';
  return html
    .replace(STYLE_BLOCKS, '')         // Remove blocos <style>...</style> inteiros
    .replace(UNSAFE_TAGS, '')          // Remove tags perigosas
    .replace(EVENT_HANDLERS, '')       // Remove event handlers (onclick, onerror, etc.)
    .replace(/javascript\s*:/gi, '')   // Remove javascript: URIs
    .replace(/vbscript\s*:/gi, '')     // Remove vbscript: URIs
    .replace(/data\s*:\s*text\/html/gi, '') // Remove data:text/html URIs
    .replace(DANGEROUS_CSS, '');       // Remove expressões CSS perigosas
}
