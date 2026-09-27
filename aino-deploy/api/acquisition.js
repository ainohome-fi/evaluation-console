import { runAcquisition } from './lib/acquisition/engine.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = req.headers['x-app-password'];
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const result = await runAcquisition({
      url: body.url,
      destination: body.destination || 'FI',
      currency: 'EUR',
      language: body.language || 'en_US',
    });

    return res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error('[aino-acquisition]', error);
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error?.message || 'Acquisition engine failed unexpectedly.',
    });
  }
}
