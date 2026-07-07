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

// Candidatos em ordem de prioridade; puppeteer.executablePath() é adicionado em runtime
const CHROMIUM_ENV_AND_SYSTEM = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
].filter(Boolean) as string[];

function findChromium(puppeteerBundled: string): string {
  for (const p of CHROMIUM_ENV_AND_SYSTEM) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // última opção: binário que o próprio puppeteer empacotou/baixou
  return puppeteerBundled;
}

// ---------- Singleton do browser ----------
let browserPromise: Promise<any> | null = null;

async function getBrowser(): Promise<any> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = (await import('puppeteer')).default;
      const executablePath = findChromium(puppeteer.executablePath());
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

/**
 * Converte HTML em PDF via Chromium local (Puppeteer).
 * Faz 2 tentativas com relaunch automático do browser.
 * Retorna null apenas se ambas as tentativas falharem.
 */
export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await localPdf(html, options);
    } catch (e: any) {
      console.error(`[PDF] Tentativa ${attempt}/2 falhou:`, e?.message || e);
      browserPromise = null; // força relaunch na próxima tentativa
    }
  }
  return null;
}
