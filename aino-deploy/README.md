# Aino Selection Console — standalone deployment (Gemini backend)

## What's in here
- `index.html` — the console UI. Unchanged from the Claude-artifact version, except it talks to your own backend instead of Claude's sandbox.
- `api/assess.js` — serverless function that calls Google's **Gemini API** (free tier) and translates the request/response so the frontend doesn't need to know the difference.
- `api/storage.js` — serverless function backed by Vercel KV, replacing the artifact's `window.storage`.
- `package.json` — declares the `@vercel/kv` dependency and marks the project as an ES module (required for the `api/*.js` files).

## Why Gemini instead of Claude here
Google's Gemini API currently offers a free tier with generous daily limits and no credit card required, which fits a no-budget deployment. The console's evidence-analysis logic, scoring engine, and UI are all identical — only the model doing the extraction changed. Expect some differences in extraction quality and phrasing compared to Claude; if budget opens up later, swapping back to Anthropic only means rewriting `api/assess.js` again (the frontend stays the same either way).

## Get a Gemini API key (free)
1. Go to **https://aistudio.google.com/apikey**.
2. Sign in with a Google account.
3. Click **Create API key** — no payment method required for the free tier.
4. Copy the key.

Check Google's current rate limits/free-tier terms in AI Studio before relying on this for heavy use — free-tier limits and available model names can change.

## Deploy steps
1. Push these files to a new GitHub repo (keep the `api/` folder structure).
2. In Vercel: **Add New Project** → import that repo.
3. Before deploying: go to the project's **Storage** tab → **Create Database** → choose **KV** → connect it. This auto-adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. In **Settings → Environment Variables**, add:
   - `GEMINI_API_KEY` — from aistudio.google.com
   - `APP_PASSWORD` — any password you choose; this gates access to the console
   - (optional) `GEMINI_MODEL` — defaults to `gemini-2.5-flash` if not set; change this if Google renames or retires that model
5. Deploy. Open the live URL, enter `APP_PASSWORD`, and use the console as normal.

## Notes
- Image URLs are now fetched directly by your own backend (not subject to Claude's robots.txt courtesy check), so the earlier "blocked by robots.txt" failure mode mostly goes away. Some sites may still block generic server requests (403s, bot detection) — the same red-highlight diagnostic in the console still applies.
- Pasted images (Ctrl+V) still work exactly as before and are never stored — only sent to `/api/assess` for that one analysis.
- Video evidence still isn't visually analyzed (Gemini can technically accept video, but that's not wired up here) — scoring still relies on the transcript/description field.
- Everyone who has `APP_PASSWORD` shares your Gemini free-tier quota, so keep it to people you trust.
