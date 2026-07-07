import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ].filter(Boolean) as string[];

  const checked: Record<string, boolean> = {};
  for (const p of candidates) {
    try { checked[p] = fs.existsSync(p); } catch { checked[p] = false; }
  }

  const homes = ['/home/ubuntu', '/root', process.env.HOME].filter(Boolean) as string[];
  const cacheFinds: string[] = [];
  for (const home of homes) {
    const chromeBase = path.join(home, '.cache', 'puppeteer', 'chrome');
    try {
      const versions = fs.readdirSync(chromeBase);
      for (const v of versions) {
        for (const suffix of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
          const p = path.join(chromeBase, v, suffix);
          if (fs.existsSync(p)) cacheFinds.push(p);
        }
      }
    } catch {}
  }

  let puppeteerExecPath: string | null = null;
  try {
    const puppeteer = (await import('puppeteer')).default;
    puppeteerExecPath = puppeteer.executablePath();
  } catch {}

  // ---- Tenta lançar o browser de verdade e captura o erro ----
  let launchResult: { ok: boolean; path: string; error?: string } = { ok: false, path: '' };
  const chromePath =
    (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)
      ? process.env.PUPPETEER_EXECUTABLE_PATH
      : cacheFinds[0] ?? puppeteerExecPath ?? '');

  if (chromePath) {
    try {
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
      });
      await browser.close();
      launchResult = { ok: true, path: chromePath };
    } catch (e: any) {
      launchResult = { ok: false, path: chromePath, error: e?.message || String(e) };
    }
  } else {
    launchResult = { ok: false, path: '', error: 'Nenhum Chrome encontrado' };
  }

  return NextResponse.json({
    env: {
      HOME: process.env.HOME,
      CHROME_PATH: process.env.CHROME_PATH || null,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || null,
    },
    candidates: checked,
    puppeteerExecPath,
    puppeteerExecPathExists: puppeteerExecPath ? fs.existsSync(puppeteerExecPath) : false,
    cacheFinds,
    launchTest: launchResult,
  });
}
