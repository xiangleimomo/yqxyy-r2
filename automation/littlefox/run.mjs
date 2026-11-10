/** Standalone command; does not import website or Netlify functions. */
import {daily} from './core.mjs';

if(process.env.LF_RUN_ENABLED!=='1'){
  console.error('Little Fox runner disabled. Set LF_RUN_ENABLED=1 after review.');
  process.exitCode=2;
}else{
  const result=await daily({env:process.env});
  console.log(JSON.stringify(result,null,2));
  if(result.status==='failed'||result.status==='partial_or_blocked')process.exitCode=1;
}