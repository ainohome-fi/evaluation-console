export function detectRoutes(product) {
  const origins = [
    ...(product.fulfilment.available_ship_from_options || []),
    ...(product.fulfilment.ship_from ? [product.fulfilment.ship_from] : []),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  const unique = [...new Set(origins)];
  const routes = [];

  for (const origin of unique) {
    if (isChina(origin)) {
      routes.push({
        route: "CN",
        origin,
        status: tradeReviewRequired(product) ? "REVIEW" : "AVAILABLE",
        pricing_allowed: !tradeReviewRequired(product),
      });
    } else if (isEU(origin)) {
      routes.push({
        route: "EU",
        origin,
        status: tradeReviewRequired(product) ? "REVIEW" : "AVAILABLE",
        pricing_allowed: !tradeReviewRequired(product),
      });
    } else {
      routes.push({
        route: "EU_EXCEPTION",
        origin,
        status: "REVIEW",
        pricing_allowed: false,
      });
    }
  }

  if (routes.length === 0) {
    routes.push({
      route: "UNKNOWN",
      origin: null,
      status: "REVIEW",
      pricing_allowed: false,
    });
  }

  return dedupeRoutes(routes);
}

function tradeReviewRequired(product) {
  return Boolean(
    product.trade.vat === null ||
    product.trade.customs === null ||
    product.trade.import_responsibility === null
  );
}

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "");
}

function isChina(origin) {
  return ["CN", "CHINA", "MAINLANDCHINA"].includes(origin);
}

function isEU(origin) {
  return [
    "AT","BE","BG","HR","CY","CZ","DE","DK","EE","EL","ES","FI","FR",
    "GR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE",
    "SI","SK","EU","SPAIN","POLAND","GERMANY","FINLAND","FRANCE",
    "ITALY","NETHERLANDS"
  ].includes(origin);
}

function dedupeRoutes(routes) {
  const seen = new Set();
  return routes.filter((r) => {
    const key = `${r.route}|${r.origin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
