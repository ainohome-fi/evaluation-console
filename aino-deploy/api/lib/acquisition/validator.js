const MANDATORY_FIELDS = [
  ["product.title", (p) => Boolean(p.identity.title)],
  ["product.description", (p) => Boolean(p.content.description)],
  ["product.images", (p) => p.content.images.length > 0],
  ["specifications.material", (p) => Boolean(p.specifications.material)],
  ["specifications.dimensions", (p) => Boolean(p.specifications.dimensions)],
  ["specifications.weight", (p) => Boolean(p.specifications.weight)],
  ["specifications.capacity", (p) => Boolean(p.specifications.capacity)],
  ["product.features", (p) => p.content.features.length > 0],
  ["variants.size", (p) => evidenceKnown(p, "variants.size")],
  ["variants.colour", (p) => evidenceKnown(p, "variants.colour")],
  ["variants.other_attributes", (p) => p.variants.length > 0],
  ["commercial.supplier_price", (p) => p.commercial.variant_pricing.length > 0],
  ["fulfilment.ship_from", (p) => Boolean(p.fulfilment.ship_from)],
  ["commercial.shipping_cost", (p) => p.commercial.shipping_cost !== null],
  ["trade.vat", (p) => evidenceKnown(p, "trade.vat")],
  ["trade.customs", (p) => evidenceKnown(p, "trade.customs")],
  ["trade.import_responsibility", (p) => evidenceKnown(p, "trade.import_responsibility")],
];

export function validateProductRecord(product) {
  const missing = [];
  const conflicting = [];

  for (const [field, predicate] of MANDATORY_FIELDS) {
    if (!predicate(product)) missing.push(field);
  }

  for (const item of product.evidence || []) {
    if (item.status === "CONFLICTING") conflicting.push(item.field);
  }

  let status = "COMPLETE";
  if (conflicting.length) status = "CONFLICTING";
  else if (missing.length) status = "PARTIAL";

  return {
    status,
    downstream_blocked: status !== "COMPLETE",
    mandatory_fields: {
      total: MANDATORY_FIELDS.length,
      satisfied: MANDATORY_FIELDS.length - missing.length,
      missing,
      conflicting,
    },
  };
}

function evidenceKnown(product, field) {
  return product.evidence?.some(
    (e) => e.field === field && e.status === "KNOWN"
  );
}
