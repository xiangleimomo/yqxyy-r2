/* Installed Android APK version display and opt-in updates. No auto-install. */
(function(){
  'use strict';
  const RELEASE_API='https://api.github.com/repos/xiangleimomo/yqxyy-r2/releases/tags/android-app-latest';
  const RELEASE_PAGE='https://github.com/xiangleimomo/yqxyy-r2/releases/tag/android-app-latest';
  const vParts=value=>String(value||'').replace(/^v/i,'').split('.').map(x=>Number(x));
  function newer(a,b){
    const aa=vParts(a),bb=vParts(b);
    if(aa.length!==3||bb.length!==3||!aa.every(Number.isInteger)||!bb.every(Number.isInteger))return false;
    for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i];
    return false;
  }
  function installed(){
    const native=window.YQXYYAndroidApp;
    if(!native || typeof native.getVersionName!=='function')return null;
    try{return {
      version:String(native.getVersionName()||''),
      sha:typeof native.getBuildSha==='function'?String(native.getBuildSha()||''):''
    };}catch{return null;}
  }
  function openRelease(){
    const native=window.YQXYYAndroidApp;
    if(native&&typeof native.openUpdatePage==='function'){
      native.openUpdatePage();return;
    }
    window.open(RELEASE_PAGE,'_blank','noopener,noreferrer');
  }
  function parseRelease(release){
    const body=String(release?.body||'');
    const version=body.match(/(?:^|\n)Version:\s*v?(\d+\.\d+\.\d+)/i)?.[1]||'';
    const sha=body.match(/(?:^|\n)Commit:\s*([0-9a-f]{40})/i)?.[1]||'';
    return {version,sha};
  }
  window.YQXYYUpdates={
    newer,parseRelease,openRelease,
    attach(panel){
      if(!panel)return;
      const info=panel.querySelector('#sfAppVersion');
      const status=panel.querySelector('#sfAppUpdateStatus');
      const button=panel.querySelector('#sfAppUpdateButton');
      if(!info||!status||!button)return;
      const current=installed();
      info.textContent=current?'安卓 APP v'+current.version:'网页版';
      button.textContent=current?'检查更新':'获取安卓 APP';
      if(!current){
        status.textContent='网页版持续使用最新网站内容；安卓版可从 GitHub 发布页获取。';
        button.onclick=openRelease;return;
      }
      const check=async()=>{
        if(!panel.isConnected)return;
        button.disabled=true;status.textContent='正在检查 GitHub 最新发布版本…';
        try{
          const response=await fetch(RELEASE_API,{headers:{Accept:'application/vnd.github+json'},
            cache:'no-store',signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw Error('GitHub 返回 HTTP '+response.status);
          const release=await response.json(),remote=parseRelease(release);
          const differentCommit=remote.sha && current.sha && current.sha!=='unknown' && remote.sha!==current.sha;
          const update=remote.version&&(newer(remote.version,current.version)||
            (remote.version===current.version&&differentCommit));
          if(update&&Array.isArray(release.assets)&&release.assets.some(asset=>asset.name==='YQXYY-Android.apk')){
            status.textContent='发现新版 v'+remote.version+'，可以下载更新。安装时如提示签名不匹配，需先卸载旧测试版。';
            button.textContent='下载新版 v'+remote.version;button.onclick=openRelease;
          }else if(remote.version){
            status.textContent='已安装 v'+current.version+(update?'；安装包暂不可用，请稍后再检查。':'，当前是最新版本。');
            button.textContent='重新检查';button.onclick=check;
          }else{
            status.textContent='GitHub 尚未提供版本号，可以到官方发布页查看。';
            button.textContent='查看下载页';button.onclick=openRelease;
          }
        }catch(error){
          status.textContent='暂时无法联网检查更新，可打开 GitHub 官方发布页。';
          button.textContent='查看下载页';button.onclick=openRelease;
        }finally{button.disabled=false;}
      };
      button.onclick=check;
      void check();
    }
  };
})();
