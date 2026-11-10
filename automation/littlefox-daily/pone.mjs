/** Optional Pone storage adapter for user-authorized large course assets.
 * Never upload HLS video copies or copyrighted books automatically.
 */
const UPLOAD_URL='https://pone.rs/upload';
export function validatePoneUrl(value) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.hostname!=='u.pone.rs'||u.username||u.password||!/^\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,12}$/.test(u.pathname))
    throw Error('Untrusted Pone download URL');
  return u.href;
}
export async function uploadAuthorizedPdfToPone({id,http=fetch,sourceUrl,maxBytes=64*1024*1024}) {
  if(!/^C\d{7}$/.test(id))throw Error('Invalid C ID for Pone');
  const response=await http(sourceUrl,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('Pone PDF source unavailable: '+response.status);
  const type=(response.headers?.get?.('content-type')||'').toLowerCase();
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length<5||bytes.length>maxBytes||!String.fromCharCode(...bytes.slice(0,5)).startsWith('%PDF-')||!type.includes('pdf'))throw Error('Invalid PDF or file too large for optional Pone adapter');
  const form=new FormData();form.append('files[]',new Blob([bytes],{type:'application/pdf'}),`${id}.pdf`);
  const uploaded=await http(UPLOAD_URL,{method:'POST',body:form,signal:AbortSignal.timeout(120000)});
  if(!uploaded.ok)throw Error('Pone upload failed: '+uploaded.status);
  const json=await uploaded.json();const url=json.files?.[0]?.url;
  if(!json.success||!url)throw Error('Pone response did not contain a file URL');
  return validatePoneUrl(url);
}