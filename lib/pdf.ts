import puppeteer from 'puppeteer';

interface PdfOptions {
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  printBackground?: boolean;
}

export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: options.format ?? 'A4',
      landscape: options.landscape ?? false,
      margin: options.margin,
      printBackground: options.printBackground ?? true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
