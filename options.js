(() => {
"use strict";
const defaults={
 movie:"https://api.obj2.top/hls/movie/{id}/master.m3u8",
 tv:"https://api.obj2.top/hls/tv/{id}/{season}/{episode}/master.m3u8",
 movieBackup:"",tvBackup:""
};
const keys=Object.keys(defaults);
async function fill(){
 const config=await chrome.storage.sync.get(defaults);
 keys.forEach(k=>document.getElementById(k).value=config[k]||"");
}
document.getElementById("save").onclick=async()=>{
 const values={};
 for(const k of keys){
  const raw=document.getElementById(k).value.trim();
  if(raw){
   if(!raw.startsWith("https://")||!raw.includes("{id}")){
    document.getElementById("note").textContent=k+"：必须是包含 {id} 的 HTTPS 模板";return;
   }
  }
  values[k]=raw;
 }
 await chrome.storage.sync.set(values);
 document.getElementById("note").textContent="已保存。返回 TMDB 播放器重新加载即可生效。";
};
document.getElementById("reset").onclick=async()=>{
 await chrome.storage.sync.set(defaults);await fill();
 document.getElementById("note").textContent="已恢复默认模板。";
};
fill().catch(e=>document.getElementById("note").textContent=String(e));
})();