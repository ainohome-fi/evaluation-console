import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = req.headers['x-app-password'];
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, key, value, prefix } = req.body || {};

  try {
    if (action === 'get') {
      const v = await kv.get(key);
      return res.status(200).json({ value: v ?? null });
    }
    if (action === 'set') {
      await kv.set(key, value);
      return res.status(200).json({ ok: true });
    }
    if (action === 'delete') {
      await kv.del(key);
      return res.status(200).json({ ok: true });
    }
    if (action === 'list') {
      const keys = await kv.keys((prefix || '') + '*');
      return res.status(200).json({ keys });
    }
    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Storage error' });
  }
}
