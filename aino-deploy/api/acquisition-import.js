import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  automaticDeserialization: false,
});

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function auth(req, res) {
  const token = req.headers['x-aino-capture-token'];
  if (!process.env.AINO_CAPTURE_TOKEN || token !== process.env.AINO_CAPTURE_TOKEN) {
    res.status(401).json({ ok: false, error: 'Unauthorized capture client' });
    return false;
  }
  return true;
}

function escValue(v) {
  if (v === null || v === undefined || v === '') return 'unknown';
  if (Array.isArray(v)) return v.map(escValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function routeForOrigin(origin) {
  const o = String(origin || '').toUpperCase();
  if (!o) return 'UNKNOWN';
  if (o === 'CN' || /CHINA/.test(o)) return 'CN';
  const eu = new Set(['AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);
  if (eu.has(o)) return 'EU';
  return 'OTHER';
}

function buildSummary(evidence, capture) {
  const n = evidence.normalized_acquisition_record || {};
  const variants = evidence.variants || [];
  const fulfilment = evidence.fulfilment_options || [];
  const lines = [
    'Aino Product Acquisition Record',
    `Platform: AliExpress`,
    `Product ID: ${escValue(evidence.product_id)}`,
    `Product title: ${escValue(evidence.title)}`,
    `Description: ${escValue(n.description)}`,
    `Material: ${escValue(n.material)}`,
    `Dimensions: ${escValue(n.dimensions)}`,
    `Weight: ${escValue(n.weight)}`,
    `Capacity: ${escValue(n.capacity)}`,
    `Features: ${escValue(n.features)}`,
    `Acquisition status: ${escValue(evidence.acquisition_status)}`,
    `Missing mandatory fields: ${escValue(evidence.missing_mandatory_fields)}`,
    `Ship-from options: ${escValue(fulfilment.map(x=>x.ship_from_country))}`,
    `Shipping options: ${escValue(fulfilment.map(x=>`${x.shipping_cost_source ?? '?'} ${x.shipping_currency || ''}, ${x.delivery_min_days ?? '?'}-${x.delivery_max_days ?? '?'} days, ${x.delivery_provider || ''}`))}`,
    `VAT evidence: ${escValue(evidence.price_extend)}`,
    `Customs/compliance evidence: ${escValue(evidence.compliance)}`,
    `Variants captured: ${variants.length}`,
    ...variants.slice(0, 40).map(v => {
      const attrs = (v.attributes || []).map(a => `${a.property_name || a.property_id}: ${a.value_name || a.value_id}`).join('; ');
      const price = v.price?.sale_price_string || v.price?.sale_price_local || 'unknown';
      return `Variant ${v.sku_id || 'unknown'}: ${attrs || v.sku_attr || 'unknown'} | price ${price} | stock ${v.stock ?? 'unknown'} | salable ${v.salable ?? 'unknown'}`;
    })
  ];
  if (variants.length > 40) lines.push(`Additional variants omitted from summary: ${variants.length - 40}`);
  return lines.join('\n');
}

function toCanonicalProduct(capture) {
  const evidence = capture?.evidence;
  if (!evidence || typeof evidence !== 'object') throw new Error('Missing capture.evidence');
  const n = evidence.normalized_acquisition_record || {};
  const productId = evidence.product_id || n.product_id;
  if (!productId) throw new Error('Missing AliExpress product ID');

  const variants = (evidence.variants || []).map(v => ({
    variant_id: String(v.sku_id || v.sku_attr || Math.random().toString(36).slice(2)),
    sku_id: v.sku_id || null,
    sku_attr: v.sku_attr || null,
    attributes: Object.fromEntries((v.attributes || []).map(a => [a.property_name || a.property_id || 'attribute', a.value_name || a.value_id || null])),
    attribute_evidence: v.attributes || [],
    stock: v.stock ?? null,
    salable: v.salable ?? null,
    prices: v.price ? [{
      amount: v.price.sale_price_local ?? null,
      currency: v.price.source_currency || null,
      normalized_price_eur: (v.price.source_currency === 'EUR' && v.price.sale_price_local != null) ? Number(v.price.sale_price_local) : null,
      source: 'AliExpress PDP skuPriceInfoMap'
    }] : []
  }));

  const fulfilment = evidence.fulfilment_options || [];
  const origins = [...new Set(fulfilment.map(x => x.ship_from_country).filter(Boolean))];
  const routes = origins.map(origin => ({
    route: routeForOrigin(origin),
    origin,
    status: 'IDENTIFIED',
    pricing_allowed: true,
    auto_selected: false,
    note: routeForOrigin(origin) === 'EU'
      ? 'EU ship-from is a sourcing signal; it does not by itself establish EU VAT/customs economics.'
      : null
  }));

  const mandatory = evidence.mandatory_fields || {};
  const evidenceList = Object.entries(mandatory).map(([field, item]) => ({
    field,
    value: item?.value ?? null,
    status: item?.status || 'UNKNOWN',
    source: item?.source || 'AliExpress PDP network response',
    retrieved_at: capture.capturedAt || new Date().toISOString()
  }));

  const raw = String(capture.body || '');
  const id = `aliexpress_${productId}_${Date.now().toString(36)}`;
  const url = capture.url || `https://www.aliexpress.com/item/${productId}.html`;
  const summary = buildSummary(evidence, capture);

  const product = {
    id,
    name: evidence.title || `AliExpress ${productId}`,
    productUrl: url,
    collection: '',
    evidences: [{
      sourceType: 'acquisition_record',
      url,
      text: summary,
      acquisitionStatus: evidence.acquisition_status || 'PARTIAL'
    }],
    assessed: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    acquisition_input_url: url,
    acquisition_status: evidence.acquisition_status || 'PARTIAL',
    acquisition_error: '',
    acquisition_job_id: null,
    supplier_cost_eur: null,
    source_country: origins[0] || '',
    pricing: { scenarios: [] },
    acquisition: {
      schema_version: 'AINO_PRODUCT_ACQUISITION_RECORD_V0.2.4',
      acquisition: {
        platform: 'AliExpress',
        product_id: String(productId),
        canonical_url: url,
        retrieved_at: capture.capturedAt || new Date().toISOString(),
        adapter: 'aino-chrome-capture-v0.2.4'
      },
      identity: { title: evidence.title || null },
      content: {
        description: n.description ?? null,
        images: n.images || evidence.images || [],
        features: n.features || evidence.explicit_properties || []
      },
      specifications: {
        material: n.material ?? null,
        dimensions: n.dimensions ?? null,
        weight: n.weight ?? null,
        capacity: n.capacity ?? null
      },
      variants,
      fulfilment: {
        ship_from: origins[0] || null,
        available_ship_from_options: origins,
        options: fulfilment
      },
      commercial: {
        variant_pricing: variants.flatMap(v => v.prices.map(price => ({ variant_id: v.variant_id, ...price }))),
        shipping_cost: fulfilment
      },
      trade: {
        vat: evidence.price_extend || null,
        customs: evidence.compliance || evidence.price_extend || null,
        import_responsibility: null
      },
      sourcing: { routes },
      evidence: evidenceList,
      coverage: evidence.coverage || {},
      mandatory_fields: mandatory,
      missing_mandatory_fields: evidence.missing_mandatory_fields || [],
      assessment: {
        status: evidence.acquisition_status || 'PARTIAL',
        mandatory_fields: { missing: evidence.missing_mandatory_fields || [] },
        downstream_blocked: false
      },
      description_enrichment: evidence.description_enrichment || null,
      description_source_urls: evidence.description_source_urls || [],
      raw_supplier_response: raw
    }
  };

  return product;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Aino-Capture-Token');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Aino-Capture-Token');
  if (!auth(req, res)) return;

  try {
    const body = parseBody(req);
    const product = toCanonicalProduct(body.capture);
    await redis.set(`product:${product.id}`, JSON.stringify(product));
    const rawIndex = await redis.get('product-index');
    const index = rawIndex ? (typeof rawIndex === 'string' ? JSON.parse(rawIndex) : rawIndex) : [];
    const nextIndex = Array.isArray(index) ? index.filter(x => x?.id !== product.id) : [];
    nextIndex.unshift({ id: product.id, name: product.name, score: null, decision: null, updated_at: product.updated_at });
    await redis.set('product-index', JSON.stringify(nextIndex));
    return res.status(200).json({ ok: true, product_id: product.id, status: product.acquisition_status, missing_mandatory_fields: product.acquisition.missing_mandatory_fields || [] });
  } catch (error) {
    console.error('[aino-acquisition-import]', error);
    return res.status(400).json({ ok: false, error: 'IMPORT_FAILED', message: error?.message || 'Could not import capture.' });
  }
}
