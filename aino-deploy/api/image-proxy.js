// Aino Selection Console V3.2.5.11 — remote image evidence proxy
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
  // AVIF / HEIF: ISO-BMFF ftyp brands. Keep AVIF transportable so the browser
  // can decode it and convert it to JPEG for the assessment path.
  if (buffer.toString('ascii',4,8) === 'ftyp') {
    const brands = buffer.toString('ascii',8,64);
    if (/avif|avis/.test(brands)) return 'image/avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(brands)) return 'image/heif';
  }
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
    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36',
      // Important: do NOT advertise AVIF here. AliExpress CDN may content-negotiate
      // a .jpg URL into AVIF when AVIF is listed first, which the assessment path
      // cannot consume. Request a model-safe raster format explicitly.
      'Accept': 'image/jpeg,image/png,image/webp,image/gif;q=0.9,*/*;q=0.1',
      ...(isAliExpressHost(target.hostname) ? {
        'Referer': 'https://www.aliexpress.com/',
        'Origin': 'https://www.aliexpress.com'
      } : {})
    };

    const controller = new AbortController();
    const upstreamTimer = setTimeout(() => controller.abort(), 12000);
    let upstream;
    try {
      upstream = await fetch(target.toString(), { redirect: 'follow', headers: requestHeaders, signal: controller.signal });
    } finally {
      clearTimeout(upstreamTimer);
    }

    // If the CDN still negotiates an unsupported format, make one strict retry
    // asking for JPEG only. This is intentionally a retry of the same source,
    // not a new external image provider.
    let buffer = null;
    if (upstream.ok) {
      buffer = Buffer.from(await upstream.arrayBuffer());
    } else {
      return send(res, 502, {ok:false,error:`Upstream image returned HTTP ${upstream.status}`});
    }
    const maxBytes = 8 * 1024 * 1024;
    if (!buffer.length) return send(res, 502, {ok:false,error:'Image response was empty'});
    if (buffer.length > maxBytes) return send(res, 413, {ok:false,error:'Image exceeds the 8 MB evidence limit'});

    const headerType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const sniffedType = sniffImageType(buffer);
    const supported = new Set(['image/jpeg','image/png','image/gif','image/webp']);
    const browserDecodable = new Set(['image/jpeg','image/png','image/gif','image/webp','image/avif']);

    // Prefer the byte signature. This avoids rejecting a valid image merely
    // because the supplier CDN sent application/octet-stream or a negotiated
    // content type. Only supported model formats are emitted.
    let contentType = sniffedType || (supported.has(headerType) ? headerType : null);

    if (!contentType && isAliExpressHost(target.hostname)) {
      try {
        const retryController = new AbortController();
        const retryTimer = setTimeout(() => retryController.abort(), 10000);
        const retry = await fetch(target.toString(), {
          redirect: 'follow',
          headers: {
            ...requestHeaders,
            'Accept': 'image/jpeg'
          },
          signal: retryController.signal
        });
        clearTimeout(retryTimer);
        if (retry.ok) {
          const retryBuffer = Buffer.from(await retry.arrayBuffer());
          const retryType = sniffImageType(retryBuffer);
          if (retryType && supported.has(retryType)) {
            buffer = retryBuffer;
            contentType = retryType;
          }
        }
      } catch (_) {}
    }

    if (!contentType) {
      return send(res, 415, {
        ok:false,
        error:`Unsupported upstream image format: ${headerType || 'unknown'}. The response bytes were not a supported browser-decodable image.`
      });
    }

    if (!browserDecodable.has(contentType)) {
      return send(res, 415, {ok:false,error:`Image format ${contentType} was detected but this browser pipeline cannot decode it safely.`});
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
