# Aino Acquisition Browser Worker

Self-hosted browser worker for the Aino Home Product Acquisition Engine. It replaces paid third-party scraping services.

## What it does

- Polls the deployed Aino Console for queued acquisition jobs.
- Opens public AliExpress product pages with Playwright + Chromium.
- Extracts browser-visible product evidence and sends the raw observation back to Aino.
- Does not calculate Selection, Pricing, margin, dog-size suitability, VAT, customs, or other Aino decisions.
- Does not bypass CAPTCHA or anti-bot challenges. When a challenge is detected, the job can complete as PARTIAL rather than fabricating data.

## Requirements

- Node.js 20+
- A machine where Chromium can run
- Network access to the deployed Aino Console and AliExpress
- No paid scraping API is required.

## Setup

```bash
cd worker
npm install
npx playwright install chromium
```

Set environment variables:

```text
AINO_CONSOLE_URL=https://your-aino-console.vercel.app
AINO_WORKER_TOKEN=<same secret configured in Vercel>
AINO_WORKER_POLL_MS=3000
```

Then:

```bash
npm start
```

Keep this process running while you want acquisition jobs to be processed.

## Architecture

```text
Aino Console (Vercel)
       |
       | queued job
       v
Upstash Redis queue
       ^
       |
       | poll / complete
       |
Aino Browser Worker
       |
       +-- Playwright
       +-- Chromium
       |
       v
AliExpress
```
