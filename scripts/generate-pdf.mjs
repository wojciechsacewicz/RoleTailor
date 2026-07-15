import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = process.env.ROLETAILOR_CV_ROOT
  ? resolve(process.env.ROLETAILOR_CV_ROOT)
  : projectRoot;
const html = join(sourceRoot, 'portfolio', 'cv-portfolio.html');
const outputDirectory = process.env.ROLETAILOR_OUTPUT_DIR
  ? resolve(process.env.ROLETAILOR_OUTPUT_DIR)
  : join(sourceRoot, 'dist');
mkdirSync(outputDirectory, { recursive: true });

const chromiumCandidates = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

const executablePath = chromiumCandidates.find(existsSync);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const outputs = [
  { lang: 'pl', filename: 'cv-portfolio.pdf' },
  { lang: 'pl', filename: 'cv-portfolio-pl.pdf' },
  { lang: 'en', filename: 'cv-portfolio-en.pdf' },
];
try {
  for (const output of outputs) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 900 },
    });
    await context.route('**/*', async (route) => {
      const protocol = new URL(route.request().url()).protocol;
      if (protocol === 'file:' || protocol === 'data:' || protocol === 'blob:') {
        await route.continue();
      } else {
        await route.abort('blockedbyclient');
      }
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
    await page.evaluate((language) => {
      document.documentElement.dataset.lang = language;
      document.documentElement.lang = language;
    }, output.lang);
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: join(outputDirectory, output.filename),
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await context.close();
    console.log(`Generated ${output.filename}`);
  }
} finally {
  await browser.close();
}
