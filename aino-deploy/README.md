# Aino Selection Console — standalone deployment (DeepSeek V4.1 Flash, High reasoning)

## What's in here
- `index.html` — the console UI, including the "Image text extraction" panel (product name, tagline, key features, promo/pricing text transcribed from any pasted or linked image).
- `api/assess.js` — serverless function that calls **DeepSeek's official API** (model ID `deepseek-flash`, i.e. V4.1 Flash) with **extended "High" reasoning effort turned on by default**.
- `api/storage.js` — serverless function backed by an Upstash Redis store (via `@upstash/redis`), replacing the artifact's `window.storage`.
- `package.json` — declares the `@upstash/redis` dependency and marks the project as an ES module.

## The reasoning toggle
DeepSeek supports extended "thinking" before it answers, controlled by two request fields (`thinking: {type: "enabled"}` and `reasoning_effort`). This is **on by default at "high"** per your request. It's controlled by an environment variable so you can turn it off or dial it down without touching code:

- `DEEPSEEK_REASONING_EFFORT` — set to `high` (default if unset), `medium`, `low`, or `none` to disable reasoning entirely.

**Why this matters for cost and reliability:** reasoning tokens are billed as output tokens, and — like every reasoning model we've dealt with this session — a request can come back empty if the token ceiling is too tight for the amount of internal "thinking" the model does. To guard against that, `api/assess.js` automatically floors the token ceiling at 8,000 whenever reasoning is enabled, regardless of what the frontend requests. If you ever see an error mentioning "ran out of tokens on internal reasoning," that floor (`Math.max(requestedTokens, 8000)` in `api/assess.js`) needs raising further.

## Get a DeepSeek API key
1. Go to **platform.deepseek.com/api_keys**.
2. Sign in / create an account, create a key, copy it.
3. Add prepaid credit — DeepSeek is metered like every non-free-tier provider we've used.

## Deploy steps
1. Push these files to your GitHub repo (keep the `api/` folder structure, and make sure Vercel's Root Directory setting points to wherever this folder lives in the repo).
2. In Vercel: **Settings → Environment Variables**, set:
   - `DEEPSEEK_API_KEY` — from platform.deepseek.com
   - `APP_PASSWORD` — your chosen access password
   - (optional) `DEEPSEEK_MODEL` — defaults to `deepseek-flash` if not set
   - (optional) `DEEPSEEK_REASONING_EFFORT` — defaults to `high`; set to `none` to disable reasoning and cut cost/latency if it turns out not to help this task
3. Make sure the Upstash Redis integration (Storage tab) is still connected — `KV_REST_API_URL` / `KV_REST_API_TOKEN` should already exist from before.
4. Redeploy.

## Notes
- Image URLs are fetched by DeepSeek's own servers, so the earlier Claude-specific robots.txt failure mode doesn't apply.
- Pasted images (Ctrl+V) are compressed client-side before sending and are never stored — only used for that one analysis.
- The image text extraction is a literal transcription task (what's printed on the packaging), separate from the 12-signal analytical scoring.
- Video evidence still isn't visually analyzed — scoring relies on the transcript/description field.
- This is a paid, metered API — track usage at platform.deepseek.com, especially with reasoning enabled, since it's the main lever that can push cost up if a particular evidence set makes the model "think" a lot.
- Worth testing with `DEEPSEEK_REASONING_EFFORT=none` at some point for comparison — signal extraction is closer to a structured classification task than an open-ended reasoning problem, so it's not guaranteed that "High" reasoning actually improves the output here versus just adding latency and cost.
