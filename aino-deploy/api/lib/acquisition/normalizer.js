import { addEvidence, evidence, firstDefined, asArray, textValue } from "./utils.js";

export function normalizeProduct({ input, raw, retrievedAt, provider }) {
  const p = raw?.product || {};
  const shipping = p.shipping || {};
  const market = raw?.market || {};

  const productId = firstDefined(p.productId, input.productId);
  const title = textValue(p.title);
  const description = textValue(
    p.description ??
      p.productDescription ??
      p.detailDescription ??
      p.details
  );

  const images = uniqueStrings([
    ...asArray(p.images),
    ...asArray(p.imageUrls),
    ...asArray(p.imageList),
  ]);

  const specifications = normalizeSpecifications(p.specifications);
  const variants = normalizeVariants(p.variants, p.variantProperties);

  const shipFrom = firstDefined(
    shipping.shipFromCountry,
    shipping.shipFrom,
    shipping.originCountry
  );

  const shippingCost = firstDefined(
    shipping.fee,
    shipping.shippingFee,
    shipping.cost,
    shipping.price
  );

  const sourcingOptions = uniqueStrings([
    ...asArray(shipping.shipFromCountries),
    ...asArray(shipping.availableShipFrom),
    ...asArray(shipping.origins),
    ...(shipFrom ? [shipFrom] : []),
  ]);

  const record = {
    schema_version: "aino.product.v1",
    acquisition: {
      platform: "AliExpress",
      adapter: provider,
      source_url: input.originalUrl,
      canonical_url: input.canonicalUrl,
      product_id: productId ?? null,
      destination: {
        aino_default: "FI",
        requested: input.destination,
        supplier_stated: market.shipTo || null,
      },
      retrieved_at: retrievedAt,
    },

    identity: {
      title: title || null,
      brand: firstDefined(p.brand, p.brandName) ?? null,
      category: firstDefined(p.categoryPath, p.category, p.categoryName) ?? null,
    },

    content: {
      description: description || null,
      images,
      features: normalizeFeatures(p),
    },

    specifications: {
      material: specificationValue(specifications, ["material"]),
      dimensions: specificationValue(specifications, [
        "dimensions",
        "dimension",
        "size",
        "product size",
      ]),
      weight: specificationValue(specifications, ["weight"]),
      capacity: specificationValue(specifications, ["capacity"]),
      raw: specifications,
    },

    variants: variants.map((v) => ({
      ...v,
      evidence: {
        source: "AliExpress product detail",
        extraction_method: provider === "aino-browser-worker" ? "browser_worker" : "supplier_adapter",
        retrieved_at: retrievedAt,
      },
    })),

    commercial: {
      product_price: normalizePrice(p.price),
      variant_pricing: variants.flatMap((v) => v.prices || []),
      shipping_cost: shippingCost ?? null,
      currency: firstDefined(
        p.price?.currency,
        market.currency,
        variants.find((v) => v.prices?.length)?.prices?.[0]?.currency
      ) ?? null,
    },

    fulfilment: {
      ship_from: shipFrom ?? null,
      available_ship_from_options: sourcingOptions,
      delivery_estimate: firstDefined(
        shipping.deliveryDates,
        shipping.deliveryEstimate,
        shipping.delivery
      ) ?? null,
      delivery_method: firstDefined(
        shipping.carrier,
        shipping.method,
        shipping.service
      ) ?? null,
    },

    trade: {
      vat: null,
      customs: null,
      import_responsibility: null,
    },

    sourcing: {
      routes: [],
      routing_status: sourcingOptions.length > 1 ? "MULTI_ORIGIN" : "REVIEW",
    },

    evidence: [],
    assessment: {},
  };

  // Evidence is attached to the canonical record rather than inferred.
  addEvidence(record, "product.title", record.identity.title, record.identity.title ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "product.description", record.content.description, record.content.description ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "product.images", record.content.images, record.content.images.length ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "specifications.material", record.specifications.material, record.specifications.material ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "specifications.dimensions", record.specifications.dimensions, record.specifications.dimensions ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "specifications.weight", record.specifications.weight, record.specifications.weight ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "specifications.capacity", record.specifications.capacity, record.specifications.capacity ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "product.features", record.content.features, record.content.features.length ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "variants.size", extractVariantAttributeValues(variants, "size"), hasVariantAttribute(variants, "size") ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "variants.colour", extractVariantAttributeValues(variants, "color"), hasVariantAttribute(variants, "color") ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "variants.other_attributes", variants, variants.length ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "commercial.supplier_price", record.commercial.variant_pricing, record.commercial.variant_pricing.length ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "fulfilment.ship_from", record.fulfilment.ship_from, record.fulfilment.ship_from ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "commercial.shipping_cost", record.commercial.shipping_cost, record.commercial.shipping_cost !== null ? "KNOWN" : "UNKNOWN");
  addEvidence(record, "trade.vat", record.trade.vat, "UNKNOWN");
  addEvidence(record, "trade.customs", record.trade.customs, "UNKNOWN");
  addEvidence(record, "trade.import_responsibility", record.trade.import_responsibility, "UNKNOWN");

  return record;
}

function normalizeSpecifications(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return { name: "specification", value: item };
      return {
        name: textValue(item?.name ?? item?.key ?? item?.label),
        value: textValue(item?.value ?? item?.content ?? item?.text),
      };
    })
    .filter((x) => x.name || x.value);
}

function specificationValue(specs, names) {
  const normalized = names.map(normalizeKey);
  const hit = specs.find((s) => normalized.includes(normalizeKey(s.name)));
  return hit?.value || null;
}

function normalizeVariants(rawVariants, rawProperties) {
  const variants = Array.isArray(rawVariants) ? rawVariants : [];

  if (variants.length) {
    return variants.map((v, index) => {
      const attributes = {};
      const rawAttributes = v.attributes || v.options || v.properties || {};

      if (Array.isArray(rawAttributes)) {
        for (const a of rawAttributes) {
          const key = textValue(a?.name ?? a?.label ?? a?.property);
          const value = textValue(a?.value ?? a?.option);
          if (key && value) attributes[normalizeAttributeName(key)] = value;
        }
      } else {
        for (const [key, value] of Object.entries(rawAttributes)) {
          if (value !== null && value !== undefined && String(value).trim()) {
            attributes[normalizeAttributeName(key)] = String(value);
          }
        }
      }

      const price = normalizePrice(v.price ?? v);
      return {
        variant_id: String(v.id ?? v.variantId ?? v.skuId ?? `variant-${index + 1}`),
        attributes,
        stock: firstDefined(v.stock, v.inventory, null),
        prices: price ? [price] : [],
      };
    });
  }

  // If the provider exposes only variantProperties, preserve them as
  // attribute metadata rather than pretending they are purchasable variants.
  if (Array.isArray(rawProperties) && rawProperties.length) {
    return [{
      variant_id: "variant-properties-only",
      attributes: normalizeVariantProperties(rawProperties),
      stock: null,
      prices: [],
    }];
  }

  return [];
}

function normalizeVariantProperties(properties) {
  const result = {};
  for (const p of properties || []) {
    const key = textValue(p?.name ?? p?.label ?? p?.property);
    const values = p?.values ?? p?.options ?? p?.value;
    if (key) result[normalizeAttributeName(key)] = values;
  }
  return result;
}

function normalizePrice(price) {
  if (!price) return null;

  if (typeof price === "number" || typeof price === "string") {
    const amount = Number(price);
    return Number.isFinite(amount)
      ? { amount, currency: null, source: "supplier" }
      : null;
  }

  const amount = Number(firstDefined(price.amount, price.value, price.min, null));
  if (!Number.isFinite(amount)) return null;

  return {
    amount,
    currency: firstDefined(price.currency, null),
    source: "supplier",
    original_range: price.min != null || price.max != null
      ? {
          min: Number(price.min ?? amount),
          max: Number(price.max ?? amount),
        }
      : null,
  };
}

function normalizeFeatures(p) {
  const values = [
    ...asArray(p.features),
    ...asArray(p.keyFeatures),
    ...asArray(p.featureList),
  ];

  return values
    .map((v) => textValue(typeof v === "string" ? v : v?.name ?? v?.value ?? v?.text))
    .filter(Boolean);
}

function extractVariantAttributeValues(variants, key) {
  return uniqueStrings(
    variants.flatMap((v) => {
      const hit = Object.entries(v.attributes || {}).find(
        ([k]) => normalizeAttributeName(k) === key
      );
      return hit ? [String(hit[1])] : [];
    })
  );
}

function hasVariantAttribute(variants, key) {
  return variants.some((v) =>
    Object.keys(v.attributes || {}).some(
      (k) => normalizeAttributeName(k) === key
    )
  );
}

function normalizeAttributeName(value) {
  const key = normalizeKey(value);
  if (["colour", "color", "colourname", "colorname"].includes(key)) return "color";
  if (["size", "sizes"].includes(key)) return "size";
  return key.replace(/\s+/g, "_");
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}
