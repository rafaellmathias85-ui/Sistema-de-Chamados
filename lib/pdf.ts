import fs from 'fs';
import path from 'path';

export interface PdfOptions {
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  printBackground?: boolean;
  timeoutMs?: number;
}

const DEFAULTS = {
  format: 'A4' as const,
  landscape: false,
  margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
  printBackground: true,
  timeoutMs: 30_000,
};

/**
 * Encontra o binário do Chrome/Chromium em todas as localizações conhecidas.
 * Varre o cache do puppeteer em múltiplos home dirs para não depender de HOME.
 */
function findChromium(): string | null {
  // 1. Variáveis de ambiente explícitas (maior prioridade)
  for (const p of [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH]) {
    if (p && fs.existsSync(p)) return p;
  }

  // 2. Instalações de sistema
  for (const p of [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ]) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }

  // 3. Cache do puppeteer em múltiplos home dirs
  //    (npm install pode ter rodado como ubuntu, mas PM2 roda como root)
  const homeDirs = [...new Set([
    '/home/ubuntu',
    '/root',
    process.env.HOME,
    process.env.PUPPETEER_CACHE_DIR,
  ].filter(Boolean))] as string[];

  for (const base of homeDirs) {
    // suporta PUPPETEER_CACHE_DIR apontando direto para o cache
    const cacheDir = base.includes('puppeteer')
      ? base
      : path.join(base, '.cache', 'puppeteer');

    const chromeBase = path.join(cacheDir, 'chrome');
    try {
      const versions = fs.readdirSync(chromeBase);
      for (const version of versions) {
        // formato novo (puppeteer v20+) e formato antigo
        for (const suffix of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
          const p = path.join(chromeBase, version, suffix);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch {}
  }

  // 4. node_modules do projeto (caso puppeteer tenha baixado localmente)
  try {
    const localBase = path.join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium');
    if (fs.existsSync(localBase)) {
      const dirs = fs.readdirSync(localBase);
      for (const d of dirs) {
        const p = path.join(localBase, d, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}

  return null;
}

// ---------- Singleton do browser ----------
let browserPromise: Promise<any> | null = null;

async function getBrowser(): Promise<any> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = (await import('puppeteer')).default;

      // findChromium() primeiro; só chama executablePath() se não encontrar nada
      const executablePath = findChromium() ?? puppeteer.executablePath();

      console.log('[PDF] Usando Chrome:', executablePath);

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

// ---------- Semáforo (máx. 2 renders simultâneos) ----------
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
 * Converte HTML em PDF via Chromium local.
 * Faz até 2 tentativas com relaunch automático do browser.
 * Retorna null se ambas falharem (o chamador decide o erro HTTP).
 */
export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await localPdf(html, options);
    } catch (e: any) {
      console.error(`[PDF] Tentativa ${attempt}/2 falhou:`, e?.message || e);
      browserPromise = null;
    }
  }
  return null;
}
