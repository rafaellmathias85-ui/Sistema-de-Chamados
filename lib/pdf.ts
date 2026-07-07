import fs from 'fs';

export interface PdfOptions {
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  printBackground?: boolean;
  /** timeout de renderização da página (ms) */
  timeoutMs?: number;
}

const DEFAULTS = {
  format: 'A4' as const,
  landscape: false,
  margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
  printBackground: true,
  timeoutMs: 30_000,
};

const CHROMIUM_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
].filter(Boolean) as string[];

function findChromium(): string | null {
  for (const p of CHROMIUM_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

// ---------- Singleton do browser ----------
let browserPromise: Promise<any> | null = null;

async function getBrowser(): Promise<any> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = findChromium();
      if (!executablePath) throw new Error('CHROMIUM_NOT_FOUND');
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
        ],
      });
      browser.on('disconnected', () => { browserPromise = null; });
      return browser;
    })();
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

// ---------- Semáforo simples (máx. 2 renders simultâneos) ----------
const MAX_CONCURRENT = 2;
let activeJobs = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT) {
    await new Promise<void>(resolve => waiters.push(resolve));
  }
  activeJobs++;
}

function release(): void {
  activeJobs--;
  const next = waiters.shift();
  if (next) next();
}

// ---------- Geração local ----------
async function localPdf(html: string, opts: PdfOptions): Promise<Buffer> {
  await acquire();
  let page: any = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: opts.timeoutMs ?? DEFAULTS.timeoutMs });
    const pdf = await page.pdf({
      format: opts.format ?? DEFAULTS.format,
      landscape: opts.landscape ?? DEFAULTS.landscape,
      printBackground: opts.printBackground ?? DEFAULTS.printBackground,
      margin: opts.margin ?? DEFAULTS.margin,
    });
    return Buffer.from(pdf);
  } finally {
    try { await page?.close(); } catch {}
    release();
  }
}

// ---------- Fallback legado (Abacus) ----------
async function abacusPdf(html: string, opts: PdfOptions): Promise<Buffer | null> {
  if (!process.env.ABACUSAI_API_KEY) return null;
  try {
    const createRes = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: {
          format: opts.format ?? DEFAULTS.format,
          landscape: opts.landscape ?? DEFAULTS.landscape,
          margin: opts.margin ?? DEFAULTS.margin,
          print_background: opts.printBackground ?? DEFAULTS.printBackground,
        },
      }),
    });
    if (!createRes.ok) {
      console.error('[PDF][abacus] create falhou:', await createRes.text());
      return null;
    }
    const { request_id } = await createRes.json();
    if (!request_id) return null;

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusData = await statusRes.json();
      if (statusData?.status === 'SUCCESS' && statusData?.result?.result) {
        return Buffer.from(statusData.result.result, 'base64');
      }
      if (statusData?.status === 'FAILED') {
        console.error('[PDF][abacus] geração falhou:', statusData?.result);
        return null;
      }
    }
    return null;
  } catch (e) {
    console.error('[PDF][abacus] erro:', e);
    return null;
  }
}

/**
 * Converte HTML em PDF. Retorna Buffer ou null se todas as
 * estratégias falharem (o chamador decide o erro HTTP).
 */
export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await localPdf(html, options);
    } catch (e: any) {
      if (e?.message === 'CHROMIUM_NOT_FOUND') {
        console.error('[PDF] Chromium não encontrado. Instale: sudo apt install -y chromium-browser (ou defina CHROME_PATH no .env)');
        break;
      }
      console.error(`[PDF] Chromium local falhou (tentativa ${attempt}/2):`, e?.message || e);
      browserPromise = null;
    }
  }
  console.warn('[PDF] Usando fallback externo (Abacus)...');
  return abacusPdf(html, options);
}
