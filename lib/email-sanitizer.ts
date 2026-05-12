import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizacao de emails HTML para exibicao segura dentro de chamados.
 * Baseada em boas praticas de MSPs (N-able, Kaseya, HaloPSA, Millvus):
 *  - Remove scripts, iframes, objects, forms, handlers inline.
 *  - Mantem formatacao rica (tabelas, listas, imagens, estilos inline seguros).
 *  - Garante alt text, target blank em links, rel noopener.
 *  - Preserva cores e fontes, mas isola do CSS global via classe 'email-body'.
 *
 * Para exibicao, o componente deve usar tailwind-typography (`prose prose-invert`)
 * dentro de um container com `className="email-body"`.
 */
const defaultOptions: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'figure', 'figcaption', 'mark', 'small', 'sup', 'sub',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'div', 'center', 'u', 's', 'strike',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'hr', 'br',
    'style',
  ]),
  allowedAttributes: {
    '*': ['style', 'class', 'id', 'title', 'dir', 'lang', 'align'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    table: ['border', 'cellpadding', 'cellspacing', 'width', 'bgcolor', 'summary'],
    td: ['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'valign'],
    th: ['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'valign', 'scope'],
    tr: ['bgcolor'],
    font: ['color', 'size', 'face'],
    col: ['width', 'span'],
    colgroup: ['span'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data', 'cid'],
    a: ['http', 'https', 'mailto', 'tel'],
  },
  allowProtocolRelative: true,
  // Limita CSS inline as propriedades seguras
  allowedStyles: {
    '*': {
      'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\s*\(/i, /^rgba\s*\(/i, /^[a-z]+$/i],
      'background': [/^#(0x)?[0-9a-f]+$/i, /^rgb\s*\(/i, /^rgba\s*\(/i, /^[a-z]+$/i, /^linear-gradient/i],
      'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\s*\(/i, /^rgba\s*\(/i, /^[a-z]+$/i],
      'font-size': [/^\d+(?:px|em|rem|%|pt)$/i],
      'font-family': [/.+/],
      'font-weight': [/^\d{3}$/i, /^(normal|bold|bolder|lighter)$/i],
      'font-style': [/^(normal|italic|oblique)$/i],
      'text-align': [/^(left|right|center|justify)$/i],
      'text-decoration': [/^(none|underline|overline|line-through)$/i],
      'margin': [/.+/],
      'margin-top': [/.+/],
      'margin-bottom': [/.+/],
      'margin-left': [/.+/],
      'margin-right': [/.+/],
      'padding': [/.+/],
      'padding-top': [/.+/],
      'padding-bottom': [/.+/],
      'padding-left': [/.+/],
      'padding-right': [/.+/],
      'border': [/.+/],
      'border-top': [/.+/],
      'border-bottom': [/.+/],
      'border-left': [/.+/],
      'border-right': [/.+/],
      'border-color': [/.+/],
      'border-style': [/.+/],
      'border-width': [/.+/],
      'border-radius': [/.+/],
      'width': [/^\d+(?:px|em|rem|%|pt)$/i, /^auto$/i],
      'max-width': [/^\d+(?:px|em|rem|%|pt)$/i, /^none$/i],
      'height': [/^\d+(?:px|em|rem|%|pt)$/i, /^auto$/i],
      'line-height': [/.+/],
      'letter-spacing': [/.+/],
      'display': [/^(block|inline|inline-block|flex|inline-flex|grid|none|table|table-row|table-cell)$/i],
      'vertical-align': [/.+/],
      'text-transform': [/^(none|uppercase|lowercase|capitalize)$/i],
      'white-space': [/^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/i],
      'word-break': [/.+/],
      'overflow-wrap': [/.+/],
      'list-style': [/.+/],
      'list-style-type': [/.+/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
  },
  // Remove comentarios (incluindo os condicionais do Outlook)
  allowedClasses: {
    '*': false,
  },
  disallowedTagsMode: 'discard',
  parseStyleAttributes: true,
  nonBooleanAttributes: ['*'],
};

/**
 * Sanitiza HTML de email preservando formatacao visual.
 * Retorna string vazia em entradas invalidas.
 */
export function sanitizeEmailHtmlAdvanced(html: string | null | undefined): string {
  if (!html || typeof html !== 'string') return '';
  try {
    // Normalizacao inicial: remove BOM e control chars
    let input = html.replace(/^\uFEFF/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    // Remove comentarios HTML/MSO
    input = input.replace(/<!--[\s\S]*?-->/g, '');
    return sanitizeHtml(input, defaultOptions);
  } catch (error) {
    console.error('[email-sanitizer] Erro ao sanitizar HTML:', error);
    return '';
  }
}

/**
 * Extrai texto puro de HTML (para busca e indexacao).
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  try {
    const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\r\n|\r|\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}

/**
 * Detecta se o email parece ser uma entrega falhada (bounce / NDR).
 * Retorna um objeto com flag e motivo legivel.
 */
export function detectBounce(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
  fromEmail: string | null | undefined,
): { isBounce: boolean; reason?: string; smtpCode?: string } {
  const s = (subject || '').toLowerCase();
  const b = (bodyText || '').toLowerCase();
  const f = (fromEmail || '').toLowerCase();

  const bounceSubjectPatterns = [
    /undelivered mail/i,
    /delivery (?:has )?failed/i,
    /delivery status notification/i,
    /mail delivery failed/i,
    /returned mail/i,
    /nao foi entregue/i,
    /n(?:a|ã)o entregue/i,
    /falha (?:na )?entrega/i,
    /mailer[- ]?daemon/i,
  ];

  const bounceSenderPatterns = [
    /mailer[- ]?daemon@/i,
    /postmaster@/i,
    /no-?reply@.*microsoft/i,
    /mta@/i,
  ];

  const isBounceSubject = bounceSubjectPatterns.some((p) => p.test(s));
  const isBounceSender = bounceSenderPatterns.some((p) => p.test(f));

  if (!isBounceSubject && !isBounceSender) {
    return { isBounce: false };
  }

  // Tentar extrair codigo SMTP (5xx, 4xx)
  const codeMatch = b.match(/\b([45]\d{2})[ \-]?([\d.]+)?/);
  const smtpCode = codeMatch ? `${codeMatch[1]}${codeMatch[2] ? ' ' + codeMatch[2] : ''}` : undefined;

  let reason = 'Email nao entregue';
  if (/mailbox (?:full|quota)/i.test(b) || /over quota/i.test(b)) {
    reason = 'Caixa postal cheia';
  } else if (/user (?:unknown|not found)|does not exist|not found|no such user|invalid recipient|no such address/i.test(b)) {
    reason = 'Destinatario inexistente';
  } else if (/spam|blocked|blacklist|reject(?:ed)?|policy|junk/i.test(b)) {
    reason = 'Bloqueado por politica anti-spam';
  } else if (/connection (?:timed? out|refused)|temporary (?:failure|problem)/i.test(b)) {
    reason = 'Servidor de destino indisponivel';
  } else if (/greylist/i.test(b)) {
    reason = 'Greylisting (aguarde nova tentativa)';
  }

  return { isBounce: true, reason, smtpCode };
}

/**
 * Gera um bloco HTML com cabecalho de email estilo N-able/Kaseya.
 */
export function generateEmailHeader(params: {
  from?: string | null;
  fromName?: string | null;
  date?: Date | null;
  subject?: string | null;
  to?: string | null;
  cc?: string | null;
}): string {
  const fromDisplay = params.fromName
    ? `${params.fromName} &lt;${params.from || ''}&gt;`
    : params.from || '';
  const dateStr = params.date
    ? params.date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) +
      ' ' +
      params.date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    : '';
  return `<div class="email-meta-header" style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;line-height:1.6;color:#cbd5e1;font-family:system-ui,-apple-system,sans-serif;">
    <div style="margin-bottom:6px;color:#60a5fa;font-weight:600;text-transform:uppercase;letter-spacing:0.02em;font-size:11px;">Detalhes da mensagem</div>
    ${fromDisplay ? `<div><span style="color:#94a3b8;display:inline-block;width:72px;">FROM:</span><span style="color:#e2e8f0;">${fromDisplay}</span></div>` : ''}
    ${params.to ? `<div><span style="color:#94a3b8;display:inline-block;width:72px;">TO:</span><span style="color:#e2e8f0;">${params.to}</span></div>` : ''}
    ${params.cc ? `<div><span style="color:#94a3b8;display:inline-block;width:72px;">CC:</span><span style="color:#e2e8f0;">${params.cc}</span></div>` : ''}
    ${dateStr ? `<div><span style="color:#94a3b8;display:inline-block;width:72px;">SENT:</span><span style="color:#e2e8f0;">${dateStr}</span></div>` : ''}
    ${params.subject ? `<div><span style="color:#94a3b8;display:inline-block;width:72px;">SUBJECT:</span><span style="color:#e2e8f0;font-weight:600;">${params.subject}</span></div>` : ''}
  </div>`;
}
