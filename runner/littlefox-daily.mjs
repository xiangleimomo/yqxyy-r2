/** GitHub Actions entrypoint. Never changes the website, Netlify or Supabase. */
import fs from 'node:fs';
import {daily,chinaDate} from '../scripts/littlefox-daily-core.mjs';
const date=chinaDate();
if(!['Mon','Tue','Wed','Thu','Fri'].includes(date.weekday)){
  console.log('Weekend: no Little Fox sync.');
  process.exit(0);
}
try {
  const report=await daily({env:process.env,log:(...args)=>console.error(...args)});
  fs.writeFileSync('littlefox-daily-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({date:report.date,status:report.status,items:report.items?.map(x=>({seriesId:x.seriesId,contentId:x.contentId,status:x.status,error:x.error})),errors:report.errors},null,2));
  if(report.status==='failed'||report.errors?.length||report.items?.some(x=>/failed/.test(x.status)))process.exitCode=1;
} catch(e){
  const error={date:date.date,status:'failed',error:String(e?.message||e)};
  fs.writeFileSync('littlefox-daily-report.json',JSON.stringify(error,null,2)+'\n');
  console.error(JSON.stringify(error));
  process.exitCode=1;
}
