import { chromium } from 'playwright';
import { parseAliExpressProductResponse } from './aliexpress-response-parser.js';

const CONSOLE_URL = (process.env.AINO_CONSOLE_URL || '').replace(/\/$/, '');
const TOKEN = process.env.AINO_WORKER_TOKEN || '';
const POLL_MS = Math.max(1000, Number(process.env.AINO_WORKER_POLL_MS || 3000));
const API_WAIT_MS = Math.max(5000, Number(process.env.AINO_ALIEXPRESS_API_WAIT_MS || 15000));

if (!CONSOLE_URL || !TOKEN) {
  console.error('Set AINO_CONSOLE_URL and AINO_WORKER_TOKEN before starting the worker.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'x-aino-worker-token': TOKEN,
};

async function call(action, payload = {}) {
  const response = await fetch(`${CONSOLE_URL}/api/acquisition`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

async function extractProduct(job) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1100 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153 Safari/537.36',
  });
  const page = await context.newPage();

  let apiCapture = null;
  let apiCaptureResolve;
  const apiCapturePromise = new Promise((resolve) => { apiCaptureResolve = resolve; });

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('mtop.aliexpress.pdp.pc.query')) return;
    if (apiCapture) return;

    try {
      const body = await response.text();
      apiCapture = {
        endpoint: url,
        status: response.status(),
        contentType: response.headers()['content-type'] || '',
        body,
      };
      apiCaptureResolve(apiCapture);
    } catch (error) {
      apiCapture = {
        endpoint: url,
        status: response.status(),
        contentType: response.headers()['content-type'] || '',
        body: null,
        error: error.message,
      };
      apiCaptureResolve(apiCapture);
    }
  });

  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const title = await page.title();
    await page.waitForTimeout(2500);

    const captured = await Promise.race([
      apiCapturePromise,
      new Promise((resolve) => setTimeout(() => resolve(apiCapture), API_WAIT_MS)),
    ]);

    const pageData = await extractVisiblePageData(page, title);

    if (captured?.body) {
      const parsed = parseAliExpressProductResponse(captured.body, {
        endpoint: captured.endpoint,
        status: captured.status,
        contentType: captured.contentType,
        productId: job.url.match(/item\/(\d+)/i)?.[1] || null,
        destination: job.destination,
        currency: 'EUR',
        language: job.language,
        title: pageData.metaTitle || title,
        description: pageData.metaDescription,
      });

      if (parsed.ok) {
        // Preserve browser-visible data only as fallback evidence. The structured
        // supplier response remains the primary acquisition source.
        parsed.product.images = [...new Set([...(parsed.product.images || []), ...pageData.images])].slice(0, 100);
        parsed.product.title = parsed.product.title || pageData.metaTitle || title;
        parsed.product.description = parsed.product.description || pageData.metaDescription || null;
        parsed.product.specifications = [...(parsed.product.specifications || []), ...(pageData.specificationRows || [])];
        parsed.product.features = [...new Set([...(parsed.product.features || []), ...(pageData.features || [])])].slice(0, 100);

        return {
          product: parsed.product,
          market: parsed.market,
          network: {
            captured: true,
            endpoint: captured.endpoint,
            status: captured.status,
            content_type: captured.contentType,
            response_bytes: Buffer.byteLength(captured.body, 'utf8'),
            parser: 'aliexpress-mtop-pdp-v1',
          },
          raw_supplier_response: captured.body,
        };
      }
    }

    // Fallback to the existing rendered-page observation path.
    const challenge = /captcha|verify you are human|robot check|access denied|too many requests/i.test(pageData.bodyText);
    return {
      product: {
        productId: job.url.match(/item\/(\d+)/i)?.[1] || null,
        title: pageData.metaTitle || title,
        description: pageData.metaDescription,
        images: pageData.images,
        specifications: pageData.specificationRows,
        features: pageData.features,
        variants: [],
        price: pageData.price,
        shipping: {},
        trade: {},
        challenge_detected: challenge,
        page_title: title,
      },
      market: { shipTo: job.destination, currency: 'EUR' },
      network: {
        captured: false,
        reason: captured?.error || 'AliExpress product API response was not captured or parsed.',
      },
      raw_supplier_response: captured?.body || null,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function extractVisiblePageData(page, title) {
  return page.evaluate((pageTitle) => {
    const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const text = (el) => clean(el?.textContent || '');
    const metas = {};
    for (const m of document.querySelectorAll('meta')) {
      const key = m.getAttribute('property') || m.getAttribute('name');
      const value = m.getAttribute('content');
      if (key && value) metas[key] = value;
    }

    const jsonLd = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { jsonLd.push(JSON.parse(s.textContent)); } catch {}
    }
    const flatten = (x) => Array.isArray(x) ? x.flatMap(flatten) : [x];
    const ld = flatten(jsonLd).find(x => x && (x['@type'] === 'Product' || (Array.isArray(x['@type']) && x['@type'].includes('Product')))) || {};

    const images = [...document.images].map(i => i.currentSrc || i.src).filter(Boolean);
    const uniqueImages = [...new Set(images)].filter(u => /^https?:/i.test(u)).slice(0, 100);
    const bodyText = clean(document.body?.innerText || '').slice(0, 120000);

    const specificationRows = [];
    for (const row of document.querySelectorAll('tr, li, div')) {
      const t = text(row);
      if (!t || t.length > 500) continue;
      const m = t.match(/^([^:：]{2,60})[:：]\s*(.{1,250})$/);
      if (m && /material|dimension|size|weight|capacity|feature|color|colour/i.test(m[1])) {
        specificationRows.push({ name: clean(m[1]), value: clean(m[2]) });
      }
    }

    const priceCandidates = [];
    const pricePattern = /(?:€|EUR\s*)\s?\d+(?:[.,]\d{1,2})?|(?:US\$|\$)\s?\d+(?:[.,]\d{1,2})?/gi;
    for (const s of document.querySelectorAll('span, div, p')) {
      const t = text(s);
      if (t.length > 120) continue;
      const matches = t.match(pricePattern);
      if (matches) priceCandidates.push(...matches);
    }

    const ldOffers = ld?.offers;
    const ldOffer = Array.isArray(ldOffers) ? ldOffers[0] : ldOffers;
    const ldPrice = ldOffer?.price ? { amount: Number(ldOffer.price), currency: ldOffer.priceCurrency || 'EUR' } : null;

    return {
      metaTitle: metas['og:title'] || metas['twitter:title'] || '',
      metaDescription: metas['description'] || metas['og:description'] || '',
      images: uniqueImages,
      bodyText,
      specificationRows: [...new Map(specificationRows.map(x => [`${x.name}|${x.value}`, x])).values()].slice(0, 100),
      features: [...new Set(specificationRows.filter(x => /feature/i.test(x.name)).map(x => x.value))].slice(0, 100),
      price: ldPrice || (priceCandidates[0] ? parseVisiblePrice(priceCandidates[0]) : null),
      pageTitle,
    };

    function parseVisiblePrice(value) {
      const normalized = String(value).replace(',', '.');
      const m = normalized.match(/(\d+(?:\.\d{1,2})?)/);
      return m ? { amount: Number(m[1]), currency: /€|EUR/i.test(value) ? 'EUR' : 'USD' } : null;
    }
  }, title);
}

async function processJob(job) {
  console.log(`[aino-worker] ${job.id} ${job.url}`);
  try {
    const raw = await extractProduct(job);
    await call('complete', {
      job_id: job.id,
      raw,
      retrieved_at: new Date().toISOString(),
    });
    console.log(`[aino-worker] completed ${job.id}`);
  } catch (error) {
    console.error(`[aino-worker] failed ${job.id}:`, error.message);
    try {
      await call('fail', { job_id: job.id, error: error.message });
    } catch (e) {
      console.error(e.message);
    }
  }
}

while (true) {
  try {
    const result = await call('next');
    if (result.status === 'JOB') await processJob(result.job);
  } catch (error) {
    console.error('[aino-worker] poll error:', error.message);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
