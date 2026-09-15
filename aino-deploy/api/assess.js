const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
// Optional reasoning control. Set DEEPSEEK_REASONING_EFFORT to "none" (or leave
// it unset with no default) to disable extended thinking entirely; any other
// value ("high", "medium", "low") is passed straight through to the API.
const REASONING_EFFORT = process.env.DEEPSEEK_REASONING_EFFORT || 'high';
const REASONING_ENABLED = REASONING_EFFORT && REASONING_EFFORT.toLowerCase() !== 'none';

// Translates the Claude-style content blocks the frontend already builds
// (see buildMessageContent in index.html) into OpenAI-style content parts,
// which DeepSeek's chat completions API expects.
function toDeepSeekContent(content) {
  return content.map(block => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    if (block.type === 'image' && block.source) {
      if (block.source.type === 'base64') {
        return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
      }
      if (block.source.type === 'url') {
        // DeepSeek fetches public image URLs itself, no server-side fetch needed here.
        return { type: 'image_url', image_url: { url: block.source.url } };
      }
    }
    return { type: 'text', text: '' };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const password = req.headers['x-app-password'];
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is missing DEEPSEEK_API_KEY' } });
  }

  try {
    const body = req.body || {};
    const message = (body.messages && body.messages[0]) || { content: [] };
    const content = Array.isArray(message.content)
      ? message.content
      : [{ type: 'text', text: String(message.content || '') }];
    const dsContent = toDeepSeekContent(content);
    const requestedTokens = body.max_tokens || 3000;
    // Extended thinking consumes output-token budget on invisible reasoning
    // before the visible answer. When reasoning is on, floor the ceiling much
    // higher so a real answer doesn't get starved out (same lesson learned
    // the hard way with GPT-5 Nano earlier).
    const maxTokens = REASONING_ENABLED ? Math.max(requestedTokens, 8000) : requestedTokens;

    const payload = {
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: dsContent }],
      max_tokens: maxTokens
    };
    if (REASONING_ENABLED) {
      payload.thinking = { type: 'enabled' };
      payload.reasoning_effort = REASONING_EFFORT.toLowerCase();
    } else {
      payload.temperature = 0.2;
    }

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: { message: (data.error && data.error.message) || 'DeepSeek API error' }
      });
    }

    const choice = data.choices && data.choices[0];
    const text = choice && choice.message && choice.message.content;
    if (!text) {
      const reason = choice && choice.finish_reason;
      return res.status(502).json({
        error: { message: 'DeepSeek returned no text' + (reason === 'length' ? ' (ran out of tokens on internal reasoning — raise the ceiling or lower reasoning_effort)' : '') }
      });
    }

    // Returned in the same shape the frontend already expects.
    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (e) {
    return res.status(500).json({ error: { message: e.message || 'Proxy error contacting DeepSeek' } });
  }
}
