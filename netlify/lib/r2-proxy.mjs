import { getObject } from './r2.mjs';

export async function serveData(request, fetchObject = getObject) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD');
    return new Response(null, { status: 405, headers });
  }
  let key;
  try { key = decodeURIComponent(new URL(request.url).pathname.slice(1)); }
  catch { return new Response(null, { status: 400, headers }); }
  if (!key.startsWith('data/') || key.endsWith('/') || key.split('/').some(p => !p || p === '.' || p === '..' || p.includes('\\')) || /[\x00-\x1f]/.test(key)) return new Response(null, { status: 400, headers });
  try {
    const forwarded = new Headers();
    for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) if (request.headers.has(name)) forwarded.set(name, request.headers.get(name));
    const upstream = await fetchObject(key, { method: request.method, headers: forwarded, signal: AbortSignal.timeout(20000) });
    if (![200, 206, 304, 404, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      return new Response(request.method === 'HEAD' ? null : 'Resource temporarily unavailable', { status: 502, headers });
    }
    for (const name of ['content-type', 'content-range', 'accept-ranges', 'etag', 'last-modified']) if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name));
    // Fetch may decompress upstream bodies; do not forward compressed Content-Length.
    if (!upstream.headers.has('content-encoding') && upstream.headers.has('content-length')) headers.set('content-length', upstream.headers.get('content-length'));
    if (key.endsWith('.m3u8')) headers.set('content-type', 'application/vnd.apple.mpegurl');
    if (key.endsWith('.vtt')) headers.set('content-type', 'text/vtt; charset=utf-8');
    if (request.method === 'HEAD' || upstream.status === 304) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers });
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response(request.method === 'HEAD' ? null : 'Resource temporarily unavailable', { status: 503, headers });
  }
}

export default request => serveData(request);
export const config = { path: '/data/*' };
