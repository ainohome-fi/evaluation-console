const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function fetchImageAsBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not fetch image (HTTP ${resp.status})`);
  const contentType = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = await resp.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  return { mime_type: contentType, data: base64 };
}

// Translates the Claude-style content blocks the frontend already builds
// (see buildMessageContent in index.html) into Gemini's "parts" format.
async function toGeminiParts(content) {
  const parts = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push({ text: block.text });
    } else if (block.type === 'image') {
      if (block.source && block.source.type === 'base64') {
        parts.push({ inline_data: { mime_type: block.source.media_type, data: block.source.data } });
      } else if (block.source && block.source.type === 'url') {
        try {
          const img = await fetchImageAsBase64(block.source.url);
          parts.push({ inline_data: img });
        } catch (e) {
          parts.push({ text: `[Could not retrieve image at ${block.source.url}: ${e.message}]` });
        }
      }
    }
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const password = req.headers['x-app-password'];
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is missing GEMINI_API_KEY' } });
  }

  try {
    const body = req.body || {};
    const message = (body.messages && body.messages[0]) || { content: [] };
    const content = Array.isArray(message.content)
      ? message.content
      : [{ type: 'text', text: String(message.content || '') }];
    const parts = await toGeminiParts(content);
    const maxOutputTokens = body.max_tokens || 4000;

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens, temperature: 0.2 }
        })
      }
    );
    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: { message: (data.error && data.error.message) || 'Gemini API error' }
      });
    }

    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map(p => p.text || '').join('')
      : '';

    if (!text) {
      const reason = candidate && candidate.finishReason;
      return res.status(502).json({
        error: { message: 'Gemini returned no text' + (reason ? ` (finishReason: ${reason})` : ' (possibly blocked by safety filters)') }
      });
    }

    // Returned in the same shape the frontend already expects from Claude.
    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (e) {
    return res.status(500).json({ error: { message: e.message || 'Proxy error contacting Gemini' } });
  }
}
