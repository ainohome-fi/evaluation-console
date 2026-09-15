const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

// Translates the Claude-style content blocks the frontend already builds
// (see buildMessageContent in index.html) into OpenAI-style content parts,
// which Groq's chat completions API expects.
function toGroqContent(content) {
  return content.map(block => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    if (block.type === 'image' && block.source) {
      if (block.source.type === 'base64') {
        return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
      }
      if (block.source.type === 'url') {
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
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is missing GROQ_API_KEY' } });
  }

  try {
    const body = req.body || {};
    const message = (body.messages && body.messages[0]) || { content: [] };
    const content = Array.isArray(message.content)
      ? message.content
      : [{ type: 'text', text: String(message.content || '') }];
    const groqContent = toGroqContent(content);
    const maxTokens = body.max_tokens || 4000;

    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: groqContent }],
        max_tokens: maxTokens,
        temperature: 0.2
      })
    });
    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: { message: (data.error && data.error.message) || 'Groq API error' }
      });
    }

    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) {
      return res.status(502).json({ error: { message: 'Groq returned no text' } });
    }

    // Returned in the same shape the frontend already expects.
    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (e) {
    return res.status(500).json({ error: { message: e.message || 'Proxy error contacting Groq' } });
  }
}
