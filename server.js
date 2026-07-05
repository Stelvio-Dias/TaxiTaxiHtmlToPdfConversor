import express from 'express';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(express.text({ type: 'text/html', limit: '15mb' }));

function resolveChromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const candidatos = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  const encontrado = candidatos.find(existsSync);
  if (!encontrado) {
    throw new Error(
      'Chromium não encontrado. Instala-o ou define a env var CHROMIUM_PATH.'
    );
  }
  return encontrado;
}

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: resolveChromiumPath(),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // evita crashes em containers com /dev/shm pequeno
        '--disable-gpu',
      ],
    });

    try {
      const browser = await browserPromise;
      // Se o processo do Chromium morrer, limpamos para relançar da próxima vez.
      browser.on('disconnected', () => { browserPromise = null; });
    } catch (err) {
      browserPromise = null; // permite nova tentativa no próximo pedido
      throw err;
    }
  }
  return browserPromise;
}

function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next(); // sem chave configurada => sem proteção (dev local)

  const provided = req.get('X-Api-Key');
  if (provided && provided === expected) return next();

  return res.status(401).json({ error: 'Não autorizado.' });
}

app.post('/pdf', requireApiKey, async (req, res) => {
  const html = typeof req.body === 'string' ? req.body : req.body?.html;
  const options = (req.body && typeof req.body === 'object' && req.body.options) || {};

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Falta o campo "html" (string).' });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // waitUntil: 'networkidle0' espera que imagens/fontes/recursos carreguem.
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true, // essencial para cores/backgrounds de CSS
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      ...options, // o .NET pode sobrepor format, margin, landscape, etc.
    }));

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="documento.pdf"',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    res.status(500).json({ error: 'Falha ao gerar o PDF.' });
  } finally {
    // Fechamos apenas a página; o browser fica vivo para o próximo pedido.
    if (page) await page.close().catch(() => {});
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serviço HTML->PDF a correr na porta ${PORT}`);
  if (!process.env.API_KEY) {
    console.warn('AVISO: API_KEY não definida — o endpoint /pdf está SEM proteção.');
  }
});