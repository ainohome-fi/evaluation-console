const ENDPOINT = "https://api.fetchlayer.dev/aliexpress/product-details";

export function createFetchLayerAdapter() {
  const apiKey = process.env.FETCHLAYER_API_KEY || "";

  return {
    name: "fetchlayer-aliexpress",

    isConfigured() {
      return Boolean(apiKey);
    },

    async fetchProduct({ product, shipTo = "FI", currency = "EUR", language = "en_US" }) {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          product,
          shipTo,
          currency,
          language,
        }),
      });

      const text = await response.text();
      let payload;

      try {
        payload = JSON.parse(text);
      } catch {
        throw publicProviderError(
          `Acquisition provider returned non-JSON response (HTTP ${response.status}).`,
          response.status
        );
      }

      if (!response.ok) {
        throw publicProviderError(
          payload?.message ||
            payload?.error ||
            `Acquisition provider returned HTTP ${response.status}.`,
          response.status
        );
      }

      if (!payload?.product) {
        throw publicProviderError(
          "Acquisition provider returned no product object.",
          response.status
        );
      }

      return payload;
    },
  };
}

function publicProviderError(message, status) {
  const error = new Error(message);
  error.publicMessage = message;
  error.providerStatus = status;
  return error;
}
