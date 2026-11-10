/** Netlify scheduled trigger: Mon–Fri 14:00 Asia/Shanghai == 06:00 UTC. */
export const config={schedule:'0 6 * * 1-5'};
export default async function () {
  if(process.env.LF_RUN_ENABLED!=='1') {console.log('Little Fox daily sync disabled; set LF_RUN_ENABLED=1 after staging verification.');return;}
  const token=process.env.LF_JOB_TOKEN;
  const base=process.env.URL||process.env.DEPLOY_PRIME_URL;
  if(!token||!base)throw Error('Missing LF_JOB_TOKEN or Netlify site URL');
  const r=await fetch(new URL('/.netlify/functions/littlefox-job',base),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
  if(r.status!==202)throw Error('Could not launch Little Fox background job: HTTP '+r.status);
  console.log('Little Fox incremental background sync requested.');
}