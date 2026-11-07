import { AwsClient } from 'aws4fetch';

const env = name => globalThis.Netlify?.env?.get(name) ?? globalThis.process?.env?.[name];

export function objectURL(key) {
  if (!key.startsWith('data/') || key.split('/').some(p => p === '..' || p === '.' || p.includes('\\')) || /[\x00-\x1f]/.test(key)) throw new Error('Invalid resource key');
  const endpoint = env('R2_ENDPOINT');
  const bucket = env('R2_BUCKET');
  if (!endpoint || !bucket) throw new Error('R2 configuration missing');
  const base = new URL(endpoint);
  if (base.protocol !== 'https:' || base.username || base.password || base.port || base.pathname !== '/' || base.search || base.hash || !/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(base.hostname)) throw new Error('Invalid R2 endpoint');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid R2 bucket');
  return new URL('/' + [bucket, ...key.split('/')].map(encodeURIComponent).join('/'), base);
}

export async function getObject(key, { method = 'GET', headers, signal, fetcher = fetch } = {}) {
  if (!['GET', 'HEAD'].includes(method)) throw new Error('Read only');
  const accessKeyId = env('R2_ACCESS_KEY_ID'), secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  if (!accessKeyId || !secretAccessKey) throw new Error('R2 credentials missing');
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const request = await client.sign(objectURL(key), { method, headers, signal: signal || AbortSignal.timeout(20000) });
  return fetcher(request, { redirect: 'error', cache: 'no-store' });
}

export async function getJSON(key) {
  const response = await getObject(key);
  if (!response.ok) { await response.body?.cancel(); throw new Error(`R2 resource unavailable (${response.status})`); }
  return response.json();
}
