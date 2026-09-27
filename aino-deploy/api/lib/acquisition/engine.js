import { createFetchLayerAdapter } from "./fetchlayer-adapter.js";
import { normalizeProduct } from "./normalizer.js";
import { validateProductRecord } from "./validator.js";
import { detectRoutes } from "./routing.js";
import { nowIso } from "./utils.js";

export async function runAcquisition({ url, destination = "FI", currency = "EUR", language = "en_US" }) {
  const startedAt = nowIso();

  const input = validateAliExpressUrl(url);
  if (!input.ok) {
    return {
      httpStatus: 400,
      body: {
        ok: false,
        status: "FAILED",
        error: "INVALID_ALIEXPRESS_URL",
        message: input.message,
      },
    };
  }

  const provider = createFetchLayerAdapter();

  if (!provider.isConfigured()) {
    return {
      httpStatus: 503,
      body: {
        ok: false,
        status: "FAILED",
        error: "ACQUISITION_PROVIDER_NOT_CONFIGURED",
        message:
          "Set FETCHLAYER_API_KEY in the deployment environment. No supplier data is fabricated when the acquisition provider is unavailable.",
        started_at: startedAt,
      },
    };
  }

  try {
    const raw = await provider.fetchProduct({
      product: input.productId || input.canonicalUrl,
      shipTo: destination,
      currency,
      language,
    });

    const product = normalizeProduct({
      input: {
        originalUrl: url,
        canonicalUrl: input.canonicalUrl,
        productId: input.productId,
        destination,
      },
      raw,
      retrievedAt: nowIso(),
      provider: provider.name,
    });

    const validation = validateProductRecord(product);
    product.assessment = {
      ...product.assessment,
      ...validation,
    };

    product.sourcing.routes = detectRoutes(product);

    const status = validation.status;

    return {
      httpStatus: status === "COMPLETE" ? 200 : 422,
      body: {
        ok: true,
        status,
        product,
      },
    };
  } catch (error) {
    console.error("[aino-acquisition-provider]", error);
    return {
      httpStatus: 502,
      body: {
        ok: false,
        status: "FAILED",
        error: "SUPPLIER_ACQUISITION_FAILED",
        message: error?.publicMessage || "The supplier product could not be acquired.",
        provider: provider.name,
        started_at: startedAt,
      },
    };
  }
}

function validateAliExpressUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Product URL is required." };
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { ok: false, message: "The supplied value is not a valid URL." };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowed =
    host === "aliexpress.com" ||
    host.endsWith(".aliexpress.com") ||
    host === "a.aliexpress.com";

  if (!allowed) {
    return {
      ok: false,
      message: "Only AliExpress product URLs are accepted in v1.0.",
    };
  }

  const productId =
    parsed.pathname.match(/\/item\/(\d+)\.html/i)?.[1] ||
    parsed.searchParams.get("productId") ||
    null;

  return {
    ok: true,
    productId,
    canonicalUrl: productId
      ? `https://www.aliexpress.com/item/${productId}.html`
      : value.trim(),
  };
}
