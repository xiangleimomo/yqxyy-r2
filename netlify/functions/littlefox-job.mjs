import {daily} from '../../scripts/littlefox-daily-core.mjs';
/** Background function (up to 15 minutes). Never runs without a server-side token. */
export const config={background:true};
export default async function (request) {
  const token=process.env.LF_JOB_TOKEN;
  if(!token||request.headers.get('authorization')!==`Bearer ${token}`){
    console.warn('Rejected unauthorized Little Fox sync invocation.');
    return new Response('Unauthorized',{status:401});
  }
  if(process.env.LF_RUN_ENABLED!=='1')return new Response('Disabled',{status:503});
  const result=await daily({});
  console.log('LITTLEFOX_DAILY_RESULT '+JSON.stringify({date:result.date,status:result.status,items:result.items,errors:result.errors||[]}));
  return new Response(null,{status:202});
}