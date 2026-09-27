/**
 * Parse the structured response returned by AliExpress
 * mtop.aliexpress.pdp.pc.query.
 *
 * This parser is intentionally evidence-first. It only maps values that are
 * present in the supplier response. It does not infer material, dimensions,
 * customs responsibility, or other missing facts.
 */

export function parseAliExpressProductResponse(body, context = {}) {
  const parsed = parseJsonOrJsonp(body);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, raw_response: body };
  }

  const root = parsed.value;
  const priceMap = findObjectByKey(root, 'skuPriceInfoMap') || {};
  const skuPaths = findValueByKey(root, 'skuPaths');
  const skuProperties = findValueByKey(root, 'skuProperties');
  const shipping = findObjectByKey(root, 'SHIPPING') || {};
  const priceExtend = findObjectByKey(root, 'PRICE_EXTEND') || {};

  const productId = firstString(
    findValueByKey(root, 'itemId'),
    findValueByKey(root, 'productId'),
    context.productId
  );

  const title = firstString(
    findValueByKey(root, 'title'),
    findValueByKey(root, 'subject'),
    findValueByKey(root, 'productTitle'),
    context.title
  );

  const description = firstString(
    findValueByKey(root, 'description'),
    findValueByKey(root, 'productDescription'),
    context.description
  );

  const images = collectImageUrls(root);
  const properties = extractSkuProperties(skuProperties);
  const skuRecords = extractSkuRecords(skuPaths, priceMap, properties);
  const shippingRecord = extractShipping(shipping, root);
  const trade = extractTrade(priceExtend, root);

  const productPrice = chooseProductPrice(priceMap, root);

  return {
    ok: true,
    product: {
      productId,
      title,
      description,
      images,
      specifications: extractSpecifications(root),
      features: extractFeatures(root),
      variants: skuRecords,
      price: productPrice,
      shipping: shippingRecord,
      trade,
    },
    market: {
      shipTo: shippingRecord.destination || context.destination || null,
      currency: context.currency || inferCurrency(priceMap, root) || 'EUR',
      language: context.language || null,
    },
    api: {
      endpoint: context.endpoint || null,
      status: context.status || null,
      content_type: context.contentType || null,
      response_bytes: Buffer.byteLength(String(body || ''), 'utf8'),
    },
    raw_supplier_response: body,
  };
}

function parseJsonOrJsonp(body) {
  const text = String(body || '').trim();
  if (!text) return { ok: false, error: 'Empty AliExpress API response.' };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {}

  // Common AliExpress response form: callback({...})
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start = [firstBrace, firstBracket].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);

  if (start >= 0 && end > start) {
    try {
      return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
    } catch (error) {
      return { ok: false, error: `AliExpress JSON/JSONP parse failed: ${error.message}` };
    }
  }

  return { ok: false, error: 'AliExpress API response was not valid JSON/JSONP.' };
}

function findValueByKey(root, targetKey) {
  const target = String(targetKey).toLowerCase();
  const seen = new Set();
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (String(key).toLowerCase() === target) return value;
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

function findObjectByKey(root, targetKey) {
  const value = findValueByKey(root, targetKey);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return null;
}

function collectImageUrls(root) {
  const urls = new Set();
  const seen = new Set();
  const stack = [root];
  const imageKey = /(image|img|picture|pic|gallery)/i;

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string' && imageKey.test(key) && /^https?:\/\//i.test(value)) {
        urls.add(value);
      } else if (Array.isArray(value) || (value && typeof value === 'object')) {
        stack.push(value);
      }
    }
  }

  return [...urls].slice(0, 100);
}

function extractSkuProperties(value) {
  const result = [];
  const roots = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();

  const visit = (node, fallbackPropertyId = null, fallbackPropertyName = null) => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item, fallbackPropertyId, fallbackPropertyName);
      return;
    }

    const propertyId = firstString(
      node.skuPropertyId,
      node.propertyId,
      node.propertyID,
      node.id,
      fallbackPropertyId
    );
    const propertyName = firstString(
      node.skuPropertyName,
      node.propertyName,
      node.name,
      node.label,
      node.title,
      fallbackPropertyName
    );
    const valueId = firstString(
      node.propertyValueId,
      node.valueId,
      node.propertyValueID,
      node.optionId
    );
    const valueName = firstString(
      node.propertyValueName,
      node.valueName,
      node.optionName,
      node.value,
      node.text
    );

    if (propertyId && (propertyName || valueName)) {
      result.push({
        property_id: propertyId,
        property_name: propertyName || null,
        value_id: valueId || null,
        value_name: valueName || null,
      });
    }

    for (const [key, child] of Object.entries(node)) {
      if (child && typeof child === 'object') visit(child, propertyId || key, propertyName || fallbackPropertyName);
    }
  };

  for (const root of roots) visit(root);

  return dedupe(result, (x) => `${x.property_id}|${x.value_id}|${x.value_name}`);
}

function extractSkuRecords(skuPaths, priceMap, properties) {
  const paths = Array.isArray(skuPaths) ? skuPaths : [];
  const records = [];
  const priceEntries = priceMap && typeof priceMap === 'object' ? priceMap : {};

  for (const entry of paths) {
    if (!entry || typeof entry !== 'object') continue;
    const skuId = firstString(entry.skuId, entry.skuID, entry.id, entry.skuIdStr);
    if (!skuId) continue;

    const priceEntry = priceEntries[skuId] || priceEntries[String(skuId)] || {};
    const price = extractSkuPrice(priceEntry);
    const stock = firstNumber(entry.skuStock, entry.stock, entry.inventory);
    const path = firstString(entry.path, entry.skuPath, entry.skuAttr);
    const attributes = parseSkuPath(path, properties);

    records.push({
      variantId: skuId,
      skuId,
      attributes,
      stock,
      prices: price ? [price] : [],
      source_path: path || null,
    });
  }

  // Some responses expose price-map entries even when skuPaths is incomplete.
  for (const [skuId, priceEntry] of Object.entries(priceEntries)) {
    if (records.some((x) => x.skuId === String(skuId))) continue;
    const price = extractSkuPrice(priceEntry);
    if (!price) continue;
    records.push({
      variantId: String(skuId),
      skuId: String(skuId),
      attributes: {},
      stock: null,
      prices: [price],
      source_path: null,
    });
  }

  return records;
}

function parseSkuPath(path, properties) {
  if (!path) return {};
  const attributes = {};
  const propertyByValueId = new Map();

  for (const property of properties) {
    if (property.value_id) {
      propertyByValueId.set(String(property.value_id), property);
    }
  }

  for (const token of String(path).split(';')) {
    const match = token.match(/^([^:#]+):([^#]+)#(.+)$/);
    if (!match) continue;
    const propertyId = match[1];
    const valueId = match[2];
    const valueNameFromPath = match[3].trim();
    const property = propertyByValueId.get(String(valueId));

    const propertyName = property?.property_name || `property_${propertyId}`;
    const valueName = property?.value_name || valueNameFromPath;
    attributes[normalizeAttributeName(propertyName)] = valueName;
  }

  return attributes;
}

function extractSkuPrice(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const value = firstNumber(
    entry.salePriceLocal,
    entry.salePrice,
    entry.price,
    entry.priceValue
  );
  if (value === null) return null;

  const displayed = firstString(entry.salePriceString, entry.priceString);
  const currency = inferCurrencyFromString(displayed) || inferCurrencyFromString(entry.salePriceLocal) || 'EUR';

  return {
    amount: value,
    currency,
    source: 'supplier',
    displayed: displayed || null,
  };
}

function chooseProductPrice(priceMap, root) {
  const entries = Object.values(priceMap || {})
    .map(extractSkuPrice)
    .filter(Boolean);
  if (entries.length) {
    const amounts = entries.map((x) => x.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return {
      amount: min,
      currency: entries[0].currency,
      source: 'supplier',
      original_range: { min, max },
      precision: 'variant_derived_range',
    };
  }

  const fallback = firstNumber(
    findValueByKey(root, 'salePriceLocal'),
    findValueByKey(root, 'salePrice'),
    findValueByKey(root, 'price')
  );
  return fallback === null ? null : { amount: fallback, currency: 'EUR', source: 'supplier' };
}

function extractShipping(shippingRoot, root) {
  const candidates = [];
  walkObjects(shippingRoot, (node) => candidates.push(node));

  const shipFrom = firstStringFromCandidates(candidates, [
    'shipFrom', 'shipFromCountry', 'originCountry', 'warehouseCountry'
  ]);
  const destination = firstStringFromCandidates(candidates, [
    'shipTo', 'destination', 'shipToCountry'
  ]);
  const carrier = firstStringFromCandidates(candidates, [
    'deliveryProviderName', 'providerName', 'carrier', 'deliveryMethod'
  ]);
  const minDays = firstNumberFromCandidates(candidates, ['deliveryDayMin', 'minDeliveryDays']);
  const maxDays = firstNumberFromCandidates(candidates, ['deliveryDayMax', 'maxDeliveryDays']);
  const shippingAmount = firstNumberFromCandidates(candidates, [
    'displayAmount', 'shippingFee', 'shippingCost', 'amount'
  ]);
  const currency = firstStringFromCandidates(candidates, ['currency']) || inferCurrencyFromCandidates(candidates) || 'EUR';
  const shippingType = firstStringFromCandidates(candidates, ['shippingFee', 'feeType', 'shippingType']);

  return {
    shipFromCountry: shipFrom || null,
    destination: destination || null,
    carrier: carrier || null,
    deliveryEstimate: minDays !== null || maxDays !== null
      ? { min_days: minDays, max_days: maxDays }
      : null,
    fee: shippingAmount !== null
      ? { amount: shippingAmount, currency, source: 'supplier' }
      : null,
    shippingFeeType: shippingType || null,
    raw_signals: {
      warehouseType: firstStringFromCandidates(candidates, ['warehouseType']),
      solutionId: firstStringFromCandidates(candidates, ['solutionId']),
      deliveryOptionCode: firstStringFromCandidates(candidates, ['deliveryOptionCode']),
    },
  };
}

function extractTrade(priceExtendRoot, root) {
  const texts = [];
  walkObjects(priceExtendRoot, (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && /content|text|title|explanation|description/i.test(key)) {
        texts.push(value.trim());
      }
    }
  });

  const joined = [...new Set(texts)].join(' | ');
  const vat = joined.match(/price includes VAT/i)
    ? joined.match(/price includes VAT[^|]*/i)?.[0] || 'Price includes VAT'
    : null;
  const customs = joined.match(/VAT,?\s*duty and clearance fees may vary[^.]*\.?/i)?.[0]
    || (joined.match(/import charges will apply/i)?.[0] || null);
  const importResponsibility = joined.match(/final total will be confirmed[^.]*\.?/i)?.[0] || null;

  return {
    vat: vat ? { status: 'STATED', text: vat } : null,
    customs: customs ? { status: 'STATED', text: customs } : null,
    import_responsibility: importResponsibility
      ? { status: 'STATED', text: importResponsibility }
      : null,
    raw_text: joined || null,
  };
}

function extractSpecifications(root) {
  const rows = [];
  const keys = /(material|dimension|weight|capacity|feature|specification)/i;
  walkObjects(root, (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (!keys.test(key)) continue;
      if (typeof value === 'string' && value.length <= 1000) {
        rows.push({ name: key, value: value.trim() });
      }
    }
  });
  return dedupe(rows, (x) => `${x.name}|${x.value}`).slice(0, 200);
}

function extractFeatures(root) {
  const features = [];
  walkObjects(root, (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (!/feature|sellingPoint|highlights/i.test(key)) continue;
      if (typeof value === 'string' && value.trim()) features.push(value.trim());
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.trim()) features.push(item.trim());
          else if (item && typeof item === 'object') {
            const text = firstString(item.text, item.content, item.value, item.name, item.title);
            if (text) features.push(text);
          }
        }
      }
    }
  });
  return [...new Set(features)].slice(0, 100);
}

function walkObjects(root, callback) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    callback(current);
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else {
      for (const value of Object.values(current)) {
        if (value && typeof value === 'object') stack.push(value);
      }
    }
  }
}

function firstStringFromCandidates(candidates, keys) {
  for (const node of candidates) {
    for (const key of keys) {
      if (node[key] !== undefined && node[key] !== null && String(node[key]).trim()) {
        return String(node[key]).trim();
      }
    }
  }
  return null;
}

function firstNumberFromCandidates(candidates, keys) {
  for (const node of candidates) {
    for (const key of keys) {
      const value = toNumber(node[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function inferCurrencyFromCandidates(candidates) {
  for (const node of candidates) {
    for (const value of Object.values(node)) {
      const currency = inferCurrencyFromString(value);
      if (currency) return currency;
    }
  }
  return null;
}

function inferCurrency(priceMap, root) {
  for (const entry of Object.values(priceMap || {})) {
    const currency = inferCurrencyFromString(entry?.salePriceString) || inferCurrencyFromString(entry?.salePriceLocal);
    if (currency) return currency;
  }
  return inferCurrencyFromString(findValueByKey(root, 'currency'));
}

function inferCurrencyFromString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value);
  if (/€|EUR/i.test(text)) return 'EUR';
  if (/US\$|USD/i.test(text)) return 'USD';
  if (/£|GBP/i.test(text)) return 'GBP';
  if (/¥|CNY|RMB/i.test(text)) return 'CNY';
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = toNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).replace(/[^0-9.,-]/g, '').replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function normalizeAttributeName(value) {
  const key = String(value || '').trim().toLowerCase();
  if (/^colou?r$/i.test(key) || /colou?r/.test(key)) return 'color';
  if (/^size$/.test(key)) return 'size';
  return key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'attribute';
}

function dedupe(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
