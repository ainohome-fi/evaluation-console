import { chromium } from 'playwright';

const CONSOLE_URL = (process.env.AINO_CONSOLE_URL || '').replace(/\/$/, '');
const TOKEN = process.env.AINO_WORKER_TOKEN || '';
const POLL_MS = Math.max(1000, Number(process.env.AINO_WORKER_POLL_MS || 3000));

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
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);

    const title = await page.title();
    const data = await page.evaluate(() => {
      const clean = (v) => String(v ?? '').replace(/\\s+/g, ' ').trim();
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
      const uniqueImages = [...new Set(images)].filter(u => /^https?:/i.test(u)).slice(0, 80);

      const bodyText = clean(document.body?.innerText || '').slice(0, 120000);
      const headings = [...document.querySelectorAll('h1,h2,h3')].map(text).filter(Boolean).slice(0, 50);

      const specificationRows = [];
      for (const row of document.querySelectorAll('tr, li, div')) {
        const t = text(row);
        if (!t || t.length > 500) continue;
        const m = t.match(/^([^:：]{2,60})[:：]\\s*(.{1,250})$/);
        if (m && /material|dimension|size|weight|capacity|feature|color|colour/i.test(m[1])) {
          specificationRows.push({ name: clean(m[1]), value: clean(m[2]) });
        }
      }

      const priceCandidates = [];
      const pricePattern = /(?:€|EUR\\s*)\\s?\\d+(?:[.,]\\d{1,2})?|(?:US\\$|\\$)\\s?\\d+(?:[.,]\\d{1,2})?/gi;
      for (const s of document.querySelectorAll('span, div, p')) {
        const t = text(s);
        if (t.length > 120) continue;
        const matches = t.match(pricePattern);
        if (matches) priceCandidates.push(...matches);
      }

      return {
        metaTitle: metas['og:title'] || metas['twitter:title'] || '',
        metaDescription: metas['description'] || metas['og:description'] || '',
        ogImage: metas['og:image'] || '',
        ld,
        images: uniqueImages,
        bodyText,
        headings,
        specificationRows: [...new Map(specificationRows.map(x => [`${x.name}|${x.value}`, x])).values()].slice(0, 100),
        priceCandidates: [...new Set(priceCandidates)].slice(0, 50),
      };
    });

    const challenge = /captcha|verify you are human|robot check|access denied|too many requests/i.test(data.bodyText);
    if (challenge) {
      return {
        product: {
          title: data.metaTitle || title,
          description: data.metaDescription,
          images: data.ogImage ? [data.ogImage] : data.images,
          specifications: data.specificationRows,
          features: [],
          variants: [],
          price: null,
          shipping: {},
          challenge_detected: true,
          page_title: title,
        },
        market: { shipTo: job.destination, currency: 'EUR' },
      };
    }

    const ldOffers = data.ld?.offers;
    const ldOffer = Array.isArray(ldOffers) ? ldOffers[0] : ldOffers;
    const titleValue = data.ld?.name || data.metaTitle || title;
    const description = data.ld?.description || data.metaDescription;
    const ldImages = Array.isArray(data.ld?.image) ? data.ld.image : [data.ld?.image].filter(Boolean);
    const price = ldOffer?.price ? { amount: Number(ldOffer.price), currency: ldOffer.priceCurrency || 'EUR' } : null;

    return {
      product: {
        productId: job.url.match(/item\/(\d+)/i)?.[1] || null,
        title: titleValue,
        description,
        images: [...new Set([...ldImages, data.ogImage, ...data.images])].filter(Boolean).slice(0, 80),
        specifications: data.specificationRows,
        features: data.headings.filter(x => /feature|material|design|easy|wash|clean|portable|water/i.test(x)),
        variants: [],
        price: price || (data.priceCandidates[0] ? parsePrice(data.priceCandidates[0]) : null),
        shipping: {},
        raw_page_text: data.bodyText,
      },
      market: { shipTo: job.destination, currency: 'EUR' },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

function parsePrice(value) {
  const normalized = String(value).replace(',', '.');
  const m = normalized.match(/(\d+(?:\.\d{1,2})?)/);
  return m ? { amount: Number(m[1]), currency: /€|EUR/i.test(value) ? 'EUR' : 'USD' } : null;
}

async function processJob(job) {
  console.log(`[aino-worker] ${job.id} ${job.url}`);
  try {
    const raw = await extractProduct(job);
    await call('complete', { job_id: job.id, raw, retrieved_at: new Date().toISOString() });
    console.log(`[aino-worker] completed ${job.id}`);
  } catch (error) {
    console.error(`[aino-worker] failed ${job.id}:`, error.message);
    try { await call('fail', { job_id: job.id, error: error.message }); } catch (e) { console.error(e.message); }
  }
}

while (true) {
  try {
    const result = await call('next');
    if (result.status === 'JOB') await processJob(result.job);
  } catch (error) {
    console.error('[aino-worker] poll error:', error.message);
  }
  await new Promise(r => setTimeout(r, POLL_MS));
}
