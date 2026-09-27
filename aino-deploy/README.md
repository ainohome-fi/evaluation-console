# Aino Selection Console V3.1

Standalone Aino Home Console for Selection, Pricing, persistence, and supplier Product Acquisition.

## Architecture

V3.1 removes the paid third-party scraping dependency used by the earlier prototype. No FetchLayer account or scraping subscription is required.

```text
User browser
     |
     v
Aino Console (Vercel)
     |
     +-- /api/assess       -> DeepSeek
     +-- /api/storage      -> Upstash Redis
     +-- /api/acquisition  -> acquisition job queue / result normalization
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
```

### Vercel responsibilities

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

### Browser worker responsibilities

- Poll for queued acquisition jobs
- Open AliExpress with Playwright + Chromium
- Render JavaScript pages
- Extract browser-visible supplier evidence
- Return raw observations to `/api/acquisition`

The worker does **not** calculate Selection, Pricing, margin, dog-size suitability, VAT, customs, or business decisions.

The worker does not bypass CAPTCHA or anti-bot challenges. If supplier facts cannot be established, Aino preserves the missing evidence and may return PARTIAL rather than fabricating data.

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
    └── README.md
```

## Vercel environment variables

Existing Selection Console variables:

```text
APP_PASSWORD
DEEPSEEK_API_KEY
KV_REST_API_URL
KV_REST_API_TOKEN
```

Optional DeepSeek variables:

```text
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_REASONING_EFFORT=high
```

New worker security variable:

```text
AINO_WORKER_TOKEN=<long random secret>
```

Do **not** add `FETCHLAYER_API_KEY`. V3.1 does not use FetchLayer.

## Browser worker setup

The browser worker is separate from Vercel because a browser runtime is not part of the normal Vercel serverless function.

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
```

Run:

```bash
npm start
```

The worker can initially run on your own computer. It does not need to be hosted by a paid scraping provider. Later it can be moved to an always-on machine without changing the Aino Console API contract.

## Acquisition flow

1. User pastes an AliExpress product URL into the console.
2. Console calls `/api/acquisition` with `action=enqueue`.
3. Vercel creates a queued acquisition job in Redis.
4. Browser worker polls for the job.
5. Worker opens the AliExpress page in Chromium.
6. Worker returns raw supplier observations.
7. Vercel normalizes those observations into the canonical `aino.product.v1` Product Record.
8. Mandatory-field validation produces `COMPLETE`, `PARTIAL`, `CONFLICTING`, or `FAILED`.
9. `acquisition_record` is stored as supplier evidence.
10. Selection/Pricing remain blocked when acquisition is incomplete, according to the existing downstream gate.

## Evidence rule

The browser worker is an observation layer. It must not invent missing supplier facts.

Examples:

- Visible material text -> KNOWN
- Visible dimensions -> KNOWN
- Ship-from shown by supplier -> KNOWN
- VAT not explicitly established -> UNKNOWN
- Customs not established -> UNKNOWN
- Import responsibility not established -> UNKNOWN

"Ships from EU" is not automatically treated as proof of VAT, customs, or import economics.

## Variant rule

Purchasable variants should be represented at variant level whenever the browser can establish them. If only a price range can be established, the record remains partial and downstream pricing is blocked until exact variant pricing is available.

## No paid scraping dependency

The V3.1 acquisition architecture deliberately has no mandatory paid scraping API. The existing Selection Console still uses the external services already defined by its original deployment, such as DeepSeek and Upstash Redis. Acquisition itself adds no scraping-service subscription or per-request scraping charge.

The browser worker uses the open-source Playwright package and a locally installed Chromium browser.

## Deployment

1. Deploy the entire project to Vercel, preserving the `api/` directory.
2. Set the Vercel environment variables.
3. Generate a strong random `AINO_WORKER_TOKEN` and set the same value in Vercel and the worker machine.
4. Redeploy Vercel after environment-variable changes.
5. Start the browser worker with the deployed console URL.
6. Paste an AliExpress URL into the deployed Aino Console.

Opening `index.html` directly from your filesystem is not a valid acquisition test because `/api/acquisition` exists only in the deployed application.

## Existing Selection Engine

The existing Selection Engine remains the analytical authority. Acquisition supplies evidence and the canonical Product Record; it does not replace Selection logic.
