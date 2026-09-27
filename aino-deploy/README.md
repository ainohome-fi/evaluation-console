# Aino Selection Console V3.2

Standalone Aino Home Console for Selection, Pricing, persistence, and supplier Product Acquisition.

## V3.2 acquisition change

V3.2 replaces the previous DOM-first AliExpress acquisition approach with a structured network-response-first approach.

The browser worker captures the successful AliExpress product-data request:

```text
mtop.aliexpress.pdp.pc.query
```

The response is parsed into supplier evidence, with rendered-page extraction retained as a fallback.

No paid scraping API is required.

## Architecture

```text
User browser
     |
     v
Aino Console (Vercel)
     |
     +-- /api/assess       -> existing Selection Engine
     +-- /api/storage      -> Upstash Redis
     +-- /api/acquisition  -> acquisition queue / normalization
                                  |
                                  v
                            Upstash Redis
                                  ^
                                  |
                         Aino Browser Worker
                         Playwright + Chromium
                                  |
                                  v
                              AliExpress
                                  |
                    mtop.aliexpress.pdp.pc.query
                                  |
              +-------------------+-------------------+
              |                   |                   |
          SKU paths          SKU prices          SHIPPING
              |                   |                   |
              +---------+---------+---------+---------+
                        |
                    Aino Product Record
                        |
              COMPLETE / PARTIAL / CONFLICTING
                        |
                 Selection / Pricing
```

## Vercel responsibilities

- Console UI
- Authentication
- Acquisition job creation and status
- Redis-backed job queue
- Raw acquisition result normalization
- Product Record creation
- Evidence and validation
- Routing
- Existing Selection Engine
- Existing Pricing Engine
- Existing storage and assessment APIs

## Browser worker responsibilities

- Poll queued acquisition jobs
- Open AliExpress with Playwright + Chromium
- Capture `mtop.aliexpress.pdp.pc.query`
- Parse structured supplier response
- Return raw observations to `/api/acquisition`
- Fall back to rendered-page observation if the structured response is unavailable

The worker does not calculate Selection, Pricing, margin, dog-size suitability, VAT, customs, or business decisions.

## Project structure

```text
aino-selection-console-v3/
├── index.html
├── package.json
├── README.md
├── api/
│   ├── assess.js
│   ├── storage.js
│   ├── acquisition.js
│   └── lib/
│       └── acquisition/
│           ├── engine.js
│           ├── normalizer.js
│           ├── routing.js
│           ├── utils.js
│           └── validator.js
└── worker/
    ├── package.json
    ├── worker.js
    ├── aliexpress-response-parser.js
    ├── test-parser.js
    └── README.md
```

## Vercel environment variables

```text
APP_PASSWORD
DEEPSEEK_API_KEY
KV_REST_API_URL
KV_REST_API_TOKEN
AINO_WORKER_TOKEN
```

Do not add `FETCHLAYER_API_KEY`. V3.2 does not use FetchLayer.

## Browser worker setup

Requirements:

- Node.js 20+
- A machine where Chromium can run
- Network access to the deployed Aino Console and AliExpress

Install:

```bash
cd worker
npm install
npx playwright install chromium
```

Configure:

```text
AINO_CONSOLE_URL=https://your-deployed-aino-console.vercel.app
AINO_WORKER_TOKEN=<same value configured in Vercel>
AINO_WORKER_POLL_MS=3000
AINO_ALIEXPRESS_API_WAIT_MS=15000
```

Run:

```bash
npm start
```

## Acquisition flow

1. User pastes an AliExpress product URL into the console.
2. Console calls `/api/acquisition` with `action=enqueue`.
3. Vercel creates a queued acquisition job in Redis.
4. Browser worker polls for the job.
5. Worker opens the AliExpress page in Chromium.
6. Worker captures `mtop.aliexpress.pdp.pc.query`.
7. Parser extracts SKU, price, stock, shipping, ship-from, and supplier-stated trade evidence when present.
8. Vercel normalizes the observations into the canonical `aino.product.v1` Product Record.
9. Mandatory-field validation produces `COMPLETE`, `PARTIAL`, `CONFLICTING`, or `FAILED`.
10. Selection/Pricing remain blocked when acquisition is incomplete.

## Variant and price rule

Purchasable variants are joined using the supplier SKU ID:

```text
skuPaths.skuId
        ↕
skuPriceInfoMap[skuId]
```

This produces variant-level supplier pricing rather than relying on a product-level price range.

If exact variant pricing cannot be established, the record remains partial and downstream pricing is blocked.

## Shipping and trade rule

The acquisition engine preserves supplier-stated shipping and trade evidence. It does not turn statements such as "Price includes VAT" or "Import charges will apply" into an independent Aino tax/customs conclusion.

"Ships from EU" is not automatically treated as proof of EU VAT/customs/import economics.

## Raw response retention

The complete structured AliExpress response is retained on the acquisition job for audit/debugging. The canonical Product Record stores a reference rather than duplicating the full response into the frontend product object.

## No paid scraping dependency

The acquisition architecture uses the open-source Playwright package and a locally installed Chromium browser. No FetchLayer or other paid scraping API is required.

## Deployment

1. Deploy the entire project to Vercel, preserving the `api/` directory.
2. Set the Vercel environment variables.
3. Generate a strong random `AINO_WORKER_TOKEN` and set the same value in Vercel and the worker machine.
4. Redeploy Vercel after environment-variable changes.
5. Start the browser worker with the deployed console URL.
6. Paste an AliExpress URL into the deployed Aino Console.

Opening `index.html` directly from your filesystem is not a valid acquisition test because `/api/acquisition` exists only in the deployed application.
