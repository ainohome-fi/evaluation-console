// Aino Selection Console V3.2.5.7 — remote image evidence proxy
// Fetches supplier/CDN images server-side and returns a verified data URL.
// This prevents the multimodal provider from having to fetch external
// AliExpress CDN URLs directly.

function isPrivateHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g,'');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

function authorized(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const supplied = req.headers['x-app-password'];
  return supplied === expected;
}

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok:false,error:'Method not allowed'});
  if (!authorized(req)) return send(res, 401, {ok:false,error:'Unauthorized'});

  const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!rawUrl) return send(res, 400, {ok:false,error:'Image URL is required'});

  let target;
  try {
    target = new URL(String(rawUrl));
  } catch {
    return send(res, 400, {ok:false,error:'Invalid image URL'});
  }

  if (!/^https?:$/.test(target.protocol)) {
    return send(res, 400, {ok:false,error:'Only HTTP/HTTPS image URLs are supported'});
  }
  if (isPrivateHostname(target.hostname)) {
    return send(res, 400, {ok:false,error:'Private/local image hosts are not allowed'});
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Aino-Selection-Console/3.2.5.8',
        'Accept': 'image/jpeg,image/png,image/webp,image/gif;q=0.95,*/*;q=0.5'
      }
    });

    if (!upstream.ok) {
      return send(res, 502, {ok:false,error:`Upstream image returned HTTP ${upstream.status}`});
    }

    const contentType = (upstream.headers.get('content-type') || '')
      .split(';')[0].trim().toLowerCase();

    // The assessment model accepts JPEG/PNG/GIF/WebP image blocks.
    // AliExpress CDNs can negotiate AVIF or SVG when the request advertises
    // them; those formats must never be forwarded to /api/assess.
    const supportedTypes = new Set(['image/jpeg','image/png','image/gif','image/webp']);
    if (!supportedTypes.has(contentType)) {
      return send(res, 415, {ok:false,error:`Unsupported upstream image format: ${contentType || 'unknown'}. Expected JPEG, PNG, GIF, or WebP.`});
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    const maxBytes = 8 * 1024 * 1024;
    if (!buffer.length) return send(res, 502, {ok:false,error:'Image response was empty'});
    if (buffer.length > maxBytes) return send(res, 413, {ok:false,error:'Image exceeds the 8 MB evidence limit'});

    return send(res, 200, {
      ok: true,
      dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      contentType,
      bytes: buffer.length,
      sourceUrl: target.toString()
    });
  } catch (error) {
    return send(res, 502, {
      ok:false,
      error:`Could not fetch image: ${error?.message || String(error)}`
    });
  }
}
