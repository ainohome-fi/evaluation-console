# Aino Selection Console — standalone deployment (Groq backend)

## What's in here
- `index.html` — the console UI. Unchanged from earlier versions except it always talks to your own backend instead of any model provider directly.
- `api/assess.js` — serverless function that calls **Groq's** free-tier, OpenAI-compatible chat completions API and translates the request/response so the frontend doesn't need to know the difference.
- `api/storage.js` — serverless function backed by an Upstash Redis store (via `@upstash/redis`), replacing the artifact's `window.storage`.
- `package.json` — declares the `@upstash/redis` dependency and marks the project as an ES module.

## Why Groq
Groq has historically had a genuinely free tier for open-weight models (like Llama) with much less of the account-flagging friction that Google's Gemini free tier has shown. It also accepts image URLs directly in requests (no server-side image fetching needed, unlike the Gemini version). As with any provider swap, extraction quality and phrasing will differ from Claude or Gemini — only `api/assess.js` needed to change; the scoring engine and UI stay identical regardless of which model is behind them.

## Get a Groq API key (free)
1. Go to **https://console.groq.com**.
2. Sign in (no card required for the free tier, as of when this was written — always double check current terms since free-tier policies can change).
3. Go to **API Keys** → **Create API Key**.
4. Copy the key.

## About the model name
`api/assess.js` defaults to `qwen/qwen3.8-27b` — per Groq's own vision docs, this and `qwen/qwen3.6-27b` are the current multimodal (image-capable) models; the earlier `llama-3.2-*-vision-preview` models have been fully decommissioned. Model availability on Groq shifts over time (we've now hit this twice). If you get a "model not found" or "decommissioned" style error again:
1. Go to **console.groq.com/docs/vision** and find whatever vision-capable model is current.
2. In Vercel, add/update the environment variable `GROQ_MODEL` with that name.
3. Redeploy — no code change needed, the backend already reads this as an override.

**Cost note:** unlike a true zero-cost tier, Groq's own pricing table lists real per-token prices for `qwen/qwen3.8-27b` (not $0). Check **console.groq.com**'s billing/usage page directly to confirm what your account is actually being charged, if anything, before relying on this for volume use.

## Deploy steps
1. Push these files to your GitHub repo (keep the `api/` folder structure, and make sure `index.html`/`package.json` sit at the repo root or that Vercel's Root Directory setting points to wherever this folder lives).
2. In Vercel: **Settings → Environment Variables**, set:
   - `GROQ_API_KEY` — from console.groq.com
   - `APP_PASSWORD` — your chosen access password
   - (optional) `GROQ_MODEL` — see above
3. Make sure the Upstash Redis integration (Storage tab) is still connected — `KV_REST_API_URL` / `KV_REST_API_TOKEN` should already exist from before.
4. Redeploy.

## Notes
- Image URLs are passed straight through to Groq in the request — no server-side fetch, so the earlier robots.txt-style failure mode doesn't apply here at all.
- Pasted images (Ctrl+V) are compressed client-side before sending and are never stored — only used for that one analysis.
- Video evidence still isn't visually analyzed — scoring relies on the transcript/description field.
- Anyone with `APP_PASSWORD` shares your Groq free-tier quota, so keep it to people you trust.
