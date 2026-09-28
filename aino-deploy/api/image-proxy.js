// Aino Selection Console V3.2.5.9 — remote image evidence proxy
// Fetches supplier/CDN images server-side and returns a model-safe data URL.
// Important: do not trust the upstream Content-Type alone. Some CDNs return
// generic or negotiated content types even when the response bytes are a
// supported JPEG/PNG/GIF/WebP image.

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

function sniffImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
  // GIF
  if (buffer.toString('ascii',0,6) === 'GIF87a' || buffer.toString('ascii',0,6) === 'GIF89a') return 'image/gif';
  // WebP: RIFF....WEBP
  if (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return null;
}

function isAliExpressHost(hostname) {
  const h=String(hostname||'').toLowerCase();
  return h === 'aliexpress.com' || h.endsWith('.aliexpress.com') || h.endsWith('.aliexpress-media.com') || h.endsWith('.alicdn.com');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok:false,error:'Method not allowed'});
  if (!authorized(req)) return send(res, 401, {ok:false,error:'Unauthorized'});

  const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!rawUrl) return send(res, 400, {ok:false,error:'Image URL is required'});

  let target;
  try { target = new URL(String(rawUrl)); }
  catch { return send(res, 400, {ok:false,error:'Invalid image URL'}); }

  if (!/^https?:$/.test(target.protocol)) return send(res, 400, {ok:false,error:'Only HTTP/HTTPS image URLs are supported'});
  if (isPrivateHostname(target.hostname)) return send(res, 400, {ok:false,error:'Private/local image hosts are not allowed'});

  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/138 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/jpeg,image/png,image/gif,*/*;q=0.8',
        ...(isAliExpressHost(target.hostname) ? {
          'Referer': 'https://www.aliexpress.com/',
          'Origin': 'https://www.aliexpress.com'
        } : {})
      }
    });

    if (!upstream.ok) return send(res, 502, {ok:false,error:`Upstream image returned HTTP ${upstream.status}`});

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const maxBytes = 8 * 1024 * 1024;
    if (!buffer.length) return send(res, 502, {ok:false,error:'Image response was empty'});
    if (buffer.length > maxBytes) return send(res, 413, {ok:false,error:'Image exceeds the 8 MB evidence limit'});

    const headerType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const sniffedType = sniffImageType(buffer);
    const supported = new Set(['image/jpeg','image/png','image/gif','image/webp']);

    // Prefer the byte signature. This avoids rejecting a valid image merely
    // because the supplier CDN sent application/octet-stream or a negotiated
    // content type. Only supported model formats are emitted.
    const contentType = sniffedType || (supported.has(headerType) ? headerType : null);

    if (!contentType) {
      const avifLike = /avif|avis|heic|heif/i.test(headerType) || buffer.toString('ascii',4,12).includes('ftyp');
      return send(res, 415, {
        ok:false,
        error: avifLike
          ? 'Supplier returned AVIF/HEIF image bytes. This deployment cannot safely transcode that format; use a JPEG/PNG/WebP supplier image URL.'
          : `Unsupported upstream image format: ${headerType || 'unknown'}. The response bytes were not a supported JPEG, PNG, GIF, or WebP image.`
      });
    }

    return send(res, 200, {
      ok:true,
      dataUrl:`data:${contentType};base64,${buffer.toString('base64')}`,
      contentType,
      bytes:buffer.length,
      sourceUrl:target.toString(),
      detectedBy:sniffedType ? 'magic-bytes' : 'content-type'
    });
  } catch (error) {
    return send(res, 502, {ok:false,error:`Could not fetch image: ${error?.message || String(error)}`});
  }
}
