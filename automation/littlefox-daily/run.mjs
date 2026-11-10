/** GitHub Actions one-shot worker. Writes R2 data, never website source/Netlify. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {daily,chinaDate} from './core.mjs';
const date=chinaDate();
const env={...process.env};
if(env.LF_DRY_RUN!=='0'||env.LF_ALLOW_PUBLISH!=='1'){
  env.LF_DRY_RUN='1';env.LF_ALLOW_PUBLISH='0';
}
const reportPath=env.LF_REPORT_FILE||'/tmp/littlefox-daily-report.json';
let report;
try{
  report=await daily({env,log:(...x)=>console.error(...x)});
}catch(e){report={date:date.date,status:'failed',errors:[String(e?.message||e)],items:[]};}
try{await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
catch(e){console.error('Could not write local report:',e.message);}
if(env.GITHUB_STEP_SUMMARY){
 const summary=['# Little Fox 每日增量制课',`日期：${report.date||date.date}（北京时间）`,`执行模式：${env.LF_DRY_RUN==='0'?'发布':'安全演练'}`,`结果：${report.status}`,''];
 for(const item of report.items||[])summary.push(`- ${item.seriesId} / ${item.title}: ${item.status}${item.contentId?' · '+item.contentId:''}${item.error?' · '+item.error:''}${item.siteWarning?' · 网站验收待核：'+item.siteWarning:''}`);
 for(const err of report.errors||[])summary.push('错误：'+err);
 try{await fs.appendFile(env.GITHUB_STEP_SUMMARY,summary.join('\n')+'\n');}catch(e){console.error(e.message);}
}
console.log(JSON.stringify(report,null,2));
if(report.status==='failed'||report.status==='partial_or_blocked'||report.errors?.length||report.items?.some(x=>/pending_failed|site_unverified/.test(x.status)))process.exitCode=1;