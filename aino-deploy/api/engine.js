import { normalizeProduct } from './normalizer.js';
import { validateProductRecord } from './validator.js';
import { detectRoutes } from './routing.js';

export function normalizeAndValidateAcquisition({ url, destination = 'FI', raw, retrievedAt, provider }) {
  try {
    const parsed = parseAliExpressUrl(url);
    if (!parsed.ok) return { status: 'FAILED', error: parsed.message };

    const product = normalizeProduct({
      input: {
        originalUrl: url,
        canonicalUrl: parsed.canonicalUrl,
        productId: parsed.productId,
        destination,
      },
      raw: raw || {},
      retrievedAt,
      provider,
    });

    const validation = validateProductRecord(product);
    product.assessment = { ...product.assessment, ...validation };
    product.sourcing.routes = detectRoutes(product);

    return { status: validation.status, product };
  } catch (error) {
    return { status: 'FAILED', error: error?.message || 'Normalization failed.' };
  }
}

function parseAliExpressUrl(value) {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const allowed = host === 'aliexpress.com' || host.endsWith('.aliexpress.com') || host === 'a.aliexpress.com';
    if (!allowed) return { ok: false, message: 'Only AliExpress product URLs are accepted.' };
    const productId = parsed.pathname.match(/\/item\/(\d+)\.html/i)?.[1] || parsed.searchParams.get('productId') || null;
    return { ok: true, productId, canonicalUrl: productId ? `https://www.aliexpress.com/item/${productId}.html` : value.trim() };
  } catch {
    return { ok: false, message: 'The supplied value is not a valid URL.' };
  }
}
