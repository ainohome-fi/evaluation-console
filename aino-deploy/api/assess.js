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

    // IMPORTANT: the browser can request a per-call reasoning profile.
    // The old implementation ignored those fields and always used the
    // deployment-wide DEEPSEEK_REASONING_EFFORT (default: high). That meant
    // the frontend could ask for thinking=disabled, but the proxy silently
    // turned thinking back on. This is exactly why Pricing kept exhausting
    // its token budget on invisible reasoning.
    const requestedEffort = typeof body.reasoning_effort === 'string'
      ? body.reasoning_effort.toLowerCase()
      : null;
    const requestedThinking = body.thinking && typeof body.thinking.type === 'string'
      ? body.thinking.type.toLowerCase()
      : null;

    let reasoningEffort = requestedEffort || REASONING_EFFORT.toLowerCase();
    let thinkingEnabled = requestedThinking
      ? requestedThinking === 'enabled'
      : reasoningEffort !== 'none';

    if (reasoningEffort === 'none') thinkingEnabled = false;
    if (thinkingEnabled && !['low','high','max'].includes(reasoningEffort)) reasoningEffort = 'high';

    // In thinking mode, reserve a larger completion ceiling because the
    // invisible reasoning tokens share max_tokens with the visible answer.
    // Non-thinking requests use exactly the caller's requested ceiling.
    const maxTokens = thinkingEnabled ? Math.max(requestedTokens, 8000) : requestedTokens;

    const payload = {
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: dsContent }],
      max_tokens: maxTokens,
      thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
      reasoning_effort: thinkingEnabled ? reasoningEffort : 'none'
    };

    // Temperature is meaningful only in non-thinking mode. DeepSeek documents
    // that it is ignored while thinking is enabled.
    if (!thinkingEnabled) {
      payload.temperature = typeof body.temperature === 'number' ? body.temperature : 0.2;
    }

    // DeepSeek JSON Output is useful for both Selection and Pricing because
    // the frontend expects a JSON object and should not need a second repair
    // generation merely because the model added markdown fences.
    if (body.response_format) payload.response_format = body.response_format;

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
      const usage = data.usage || {};
      const details = [
        reason ? `finish_reason=${reason}` : null,
        Number.isFinite(usage.reasoning_tokens) ? `reasoning_tokens=${usage.reasoning_tokens}` : null,
        Number.isFinite(usage.completion_tokens) ? `completion_tokens=${usage.completion_tokens}` : null
      ].filter(Boolean).join(', ');
      return res.status(502).json({
        error: { message: 'DeepSeek returned no visible text' + (details ? ` (${details})` : '') + (reason === 'length' && thinkingEnabled ? ' — the completion ceiling was exhausted while thinking was enabled' : '') }
      });
    }

    // Returned in the same shape the frontend already expects.
    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (e) {
    return res.status(500).json({ error: { message: e.message || 'Proxy error contacting DeepSeek' } });
  }
}
