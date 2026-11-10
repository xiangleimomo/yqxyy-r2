(() => {
  "use strict";
  // Adapted from yqxyy-r2/js/movie-library.js automaticSource and
  // yqxyy-r2/js/movie-subtitles.js HLS subtitleTracks/CC handling.
  const defaults = {
    movie:"https://api.obj2.top/hls/movie/{id}/master.m3u8",
    tv:"https://api.obj2.top/hls/tv/{id}/{season}/{episode}/master.m3u8",
    movieBackup:"",tvBackup:"", autoCaptions:true
  };
  const $=id=>document.getElementById(id);
  const query=new URLSearchParams(location.search);
  const type=query.get("type"),id=query.get("id"),title=query.get("title")||"";
  const valid=(type==="movie"||type==="tv")&&/^[1-9]\d{0,11}$/.test(id||"");
  const video=$("video");
  const state={hls:null,generation:0,mediaRecoveries:0,subtitleSelection:false,source:"",native:false};
  const status=(message,kind="")=>{$("status").textContent=message;$("status").className=kind;};
  const fail=(message,detail="")=>{status(message,"error");$("error-detail").textContent=detail;};
  const clamp=(x,max)=>{
    const n=Number(x);
    return Number.isSafeInteger(n)?Math.max(1,Math.min(max,n)):1;
  };
  const templateUrl=(template,season,episode)=>{
    const raw=template.replaceAll("{id}",id).replaceAll("{type}",type)
      .replaceAll("{season}",String(season)).replaceAll("{episode}",String(episode));
    const u=new URL(raw);
    if(u.protocol!=="https:"||u.username||u.password)throw Error("只允许使用不含用户名密码的 HTTPS 地址");
    return u.href;
  };
  const resetSubtitles=()=>{
    const field=$("captions");
    field.replaceChildren(new Option("关闭字幕","-1"));
    state.subtitleSelection=false;
  };
  const nativeTracks=()=>Array.from(video.textTracks||[]).filter(t=>t.kind==="subtitles"||t.kind==="captions");
  const syncSubtitles=()=>{
    const field=$("captions");
    const old=field.value;
    resetSubtitlesOptions();
    const hls=state.hls;
    if(hls){
      (hls.subtitleTracks||[]).forEach((track,index)=>{
        field.add(new Option(track.name||track.lang||("字幕 "+(index+1)),String(index)));
      });
    }else{
      nativeTracks().forEach((track,index)=>{
        field.add(new Option(track.label||track.language||("字幕 "+(index+1)),String(index)));
      });
    }
    if(state.subtitleSelection&&[...field.options].some(x=>x.value===old)){
      field.value=old;
    } else {
      const tracks=hls?.subtitleTracks||nativeTracks();
      const preferred=tracks.findIndex(t=>/^(en|eng)(-|$)/i.test(t.lang||t.language||"")||/english|英文/i.test(t.name||t.label||""));
      field.value=field.options.length>1?String(preferred<0?0:preferred):"-1";
    }
    applySubtitle();
  };
  const resetSubtitlesOptions=()=>{
    $("captions").replaceChildren(new Option("关闭字幕","-1"));
  };
  const applySubtitle=()=>{
    const choice=Number($("captions").value);
    if(state.hls){
      state.hls.subtitleDisplay=choice>=0;
      state.hls.subtitleTrack=choice;
    }else{
      nativeTracks().forEach((track,index)=>{track.mode=choice===index?"showing":"disabled";});
    }
  };
  const clear=()=>{
    try{state.hls?.destroy();}catch{}
    state.hls=null;
    video.pause();video.removeAttribute("src");video.load();
    state.mediaRecoveries=0;state.native=false;
    resetSubtitles();
  };
  const init=async()=>{
    const generation=++state.generation;
    clear();
    if(!valid){fail("无法识别 TMDB ID");return;}
    const season=clamp($("season").value,999),episode=clamp($("episode").value,9999);
    $("season").value=String(season);$("episode").value=String(episode);
    let cfg;
    try{cfg=await chrome.storage.sync.get(defaults);}catch(error){fail("读取插件配置失败",String(error));return;}
    if(generation!==state.generation)return;
    const line=$("line").value;
    const key=type+(line==="backup"?"Backup":"");
    if(!cfg[key]){fail("这条线路尚未配置。可以进入右上角设置填写备用线路。");return;}
    let url;
    try{url=templateUrl(cfg[key],season,episode);}
    catch(error){fail("播放地址模板不正确",String(error));return;}
    state.source=url;
    $("address").textContent=url;
    $("error-detail").textContent="";
    status("正在请求 M3U8 播放列表…");
    if(window.Hls?.isSupported()){
      const hls=new Hls({enableWorker:false,lowLatencyMode:false,maxBufferLength:30,capLevelToPlayerSize:true});
      state.hls=hls;
      hls.on(Hls.Events.MEDIA_ATTACHED,()=>{
        if(generation===state.generation)hls.loadSource(url);
      });
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{
        if(generation!==state.generation)return;
        status("播放列表已加载，正在准备播放…","ok");
        video.play().catch(()=>status("播放器就绪，点击视频中央的播放键开始","ok"));
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,()=>{
        if(generation===state.generation)syncSubtitles();
      });
      hls.on(Hls.Events.ERROR,(_event,data)=>{
        if(generation!==state.generation||!data?.fatal)return;
        const info=(data.type||"unknown")+": "+(data.details||"unknown");
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&state.mediaRecoveries<1){
          state.mediaRecoveries++;
          status("检测到解码异常，正在尝试恢复…");
          hls.recoverMediaError();return;
        }
        fail("视频加载失败，请展开下方诊断信息",info+"。可能为源站 403/404、跨域限制、媒体解码失败、网络中断或播放资源不存在。");
      });
      try{hls.attachMedia(video);}catch(err){fail("HLS 初始化失败",String(err));}
    }else if(video.canPlayType("application/vnd.apple.mpegurl")){
      state.native=true;
      video.src=url;
      video.addEventListener("loadedmetadata",syncSubtitles,{once:true});
      video.play().catch(()=>status("播放器就绪，请点击播放键","ok"));
    }else{
      fail("未加载 HLS.js 播放内核","插件文件 vendor/hls.min.js 不存在或未能执行。请从完整 GitHub 插件分支 ZIP 下载。");
    }
  };
  const onSubtitleChange=()=>{state.subtitleSelection=true;applySubtitle();};
  $("captions").addEventListener("change",onSubtitleChange);
  $("play").addEventListener("click",init);
  $("line").addEventListener("change",init);
  $("season").addEventListener("change",init);
  $("episode").addEventListener("change",init);
  $("identifier").textContent=valid?((type==="movie"?"电影":"电视剧")+" · TMDB "+id):"无效 TMDB 参数";
  $("name").textContent=title.slice(0,120)||"TMDB OneClick Player";
  if(type==="tv")$("episodes").hidden=false;
  $("season").value=String(clamp(query.get("season")||1,999));
  $("episode").value=String(clamp(query.get("episode")||1,9999));
  video.addEventListener("playing",()=>status("正在播放","ok"));
  video.addEventListener("error",()=>{
    if(!state.hls)fail("视频播放出错","MediaError "+(video.error?.code||"unknown"));
  });
  window.addEventListener("pagehide",()=>{state.generation++;clear();});
  if(valid)init();else fail("TMDB 参数无效");
})();