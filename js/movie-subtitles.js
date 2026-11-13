/* Movie subtitles reuse the source explorer's public lookup and VTT conversion. */
window.MovieSubtitles = {
  mount(root, video, movie, getHls, app = typeof App !== 'undefined' ? App : null, sourceManifestUrl = '') {
    const panel = document.createElement('section');
    panel.className = 'movie-subtitles';
    panel.innerHTML = `<h2>英文字幕 · English subtitles</h2><form><label>片名 / Title <input name="query" maxlength="100" required></label><label>年份 / Year <input name="year" type="number" min="1900" max="2100"></label><button class="btn" type="submit">查找英文字幕</button></form><div class="movie-subtitle-controls"><label>字幕 / Track <select name="track"><option value="off">关闭字幕 / Off</option></select></label><label>导入 SRT / VTT <input name="file" type="file" accept=".srt,.vtt"></label><label>延迟 / Delay（秒）<input name="offset" type="number" step="0.1" value="0"></label></div><p role="status" aria-live="polite">按片名和年份查找，选择与当前片源匹配的字幕版本。正数使字幕延后。</p><div class="movie-subtitle-results"></div>`;
    const anchor = root.querySelector('.movie-watch-actions') || root.querySelector('.movie-watch-frame');
    if (anchor) anchor.after(panel); else root.append(panel);
    const fields=Object.fromEntries(Array.from(panel.querySelectorAll('[name]')).map(el=>[el.name,el]));
    const field = name => fields[name];
    const status = panel.querySelector('[role="status"]');
    const results = panel.querySelector('.movie-subtitle-results');
    field('query').value = movie.title || movie.titleZh;
    field('year').value = movie.year || '';
    const movieOffsetKey='storyfox-movie-subtitle-offset:'+String(movie.id||movie.tmdbId||movie.title||'');
    try{field('offset').value=String(Math.max(-30,Math.min(30,Number(localStorage.getItem(movieOffsetKey))||0)));}catch{}
    const abort = new AbortController(), blobs = [], tracks = [];
    let disposed = false, request = 0, download = 0, hlsBound, userSelectedTrack=false;
    const nativeIds=new WeakMap(),nativeTracks=new Map(),cueTracks=new Map(),cueListeners=new Map(),hlsListeners=[];
    let nextNativeId=0;
    const standaloneTracks=[];
    const parseAttr=line=>Object.fromEntries([...line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));
    const clock=value=>{const parts=value.replace(',','.').split(':').map(Number);return parts.reduce((n,p)=>n*60+p,0);};
    const parseVtt=text=>{const blocks=text.replace(/\r/g,'').split(/\n\s*\n/),cues=[];for(const block of blocks){const lines=block.trim().split('\n'),i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue;const m=lines[i].match(/(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})/);if(!m)continue;const start=clock(m[0].split('-->')[0].trim()),end=clock(m[2]);if(Number.isFinite(start)&&Number.isFinite(end))cues.push({startTime:start,endTime:end,text:lines.slice(i+1).join('\n')});}return cues;};
    async function loadStandalone(){
      if(!sourceManifestUrl||disposed)return;
      try{
        const fetchText=async url=>{const res=await fetch(url,{signal:abort.signal});if(!res.ok)throw Error('HTTP '+res.status);return res.text();};
        const manifest=await fetchText(sourceManifestUrl);
        if(!manifest.includes('#EXTM3U'))return;
        const lines=manifest.split(/\r?\n/), entries=lines.filter(l=>l.startsWith('#EXT-X-MEDIA:')&&/TYPE=SUBTITLES(?:,|$)/.test(l));
        for(const line of entries){
          const attrs=parseAttr(line.slice(line.indexOf(':')+1));if(!attrs.URI)continue;
          const url=new URL(attrs.URI,sourceManifestUrl).href,playlist=await fetchText(url);
          let cues=[];
          if(/^\s*WEBVTT/.test(playlist))cues=parseVtt(playlist);
          else if(playlist.includes('#EXTM3U')){
            const segments=playlist.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).slice(0,600);
            let elapsed=0;const durations=[...playlist.matchAll(/#EXTINF:([\d.]+)/g)].map(m=>Number(m[1]));
            for(let i=0;i<segments.length;i++){
              const body=await fetchText(new URL(segments[i],url).href);
              for(const cue of parseVtt(body)){cues.push({startTime:cue.startTime,endTime:cue.endTime,text:cue.text});}
              elapsed+=durations[i]||0;
            }
          }
          if(disposed)return;
          standaloneTracks.push({label:attrs.NAME||attrs.LANGUAGE||'English',cues});
        }
        if(standaloneTracks.length)refresh();
      }catch(error){if(error.name!=='AbortError')console.warn('Standalone HLS subtitle discovery failed:',error);}
    }
    const normalizeLanguage=value=>({eng:'en',zho:'zh',chi:'zh',spa:'es',fra:'fr',fre:'fr'}[String(value||'').toLowerCase()]||String(value||'').toLowerCase().split('-')[0]);
    const nativeKey=track=>{if(!nativeIds.has(track)){const key=`text:${nextNativeId++}`;nativeIds.set(track,key);nativeTracks.set(key,track);}return nativeIds.get(track);};
    const frame = root.querySelector('.movie-watch-frame');
    let settings=null,caption=null,settingsTrack=null;
    if(frame&&app?.subtitleControls){
      frame.insertAdjacentHTML('beforeend',app.subtitleControls({series:{seriesTitle:movie.titleZh||movie.title}}));
      settings=frame.querySelector('.subtitle-controls');
      const trackRow=document.createElement('label');trackRow.className='subtitle-setting-row';trackRow.innerHTML='<span>字幕轨道</span><select aria-label="选择字幕轨道"></select>';settings.append(trackRow);settingsTrack=trackRow.querySelector('select');
      settingsTrack.onchange=()=>{field('track').value=settingsTrack.value;choose();};
      // The unified toolbar owns the shift buttons and vertical-position slider.
      // Keep the original numeric input in the DOM for subtitle rendering.
      field('offset').type='hidden';
      settings.querySelectorAll('.sf-offset-minus,.sf-offset-plus,.sf-offset-reset').forEach(button=>button.addEventListener('click',()=>{
        const delta=button.classList.contains('sf-offset-minus')?-0.5:button.classList.contains('sf-offset-plus')?0.5:null;
        const current=Number(field('offset').value)||0;
        field('offset').value=String(Math.max(-30,Math.min(30,Math.round((delta===null?0:current+delta)*2)/2)));
        field('offset').dispatchEvent(new Event('input',{bubbles:true}));
        updateOffsetLabels();
      }));
      panel.remove();
      caption=document.createElement('div');caption.className='video-caption';caption.hidden=true;frame.append(caption);
      frame.classList.add('subtitle-video-wrap','sf-movie-custom-caption');
      const trigger=frame.querySelector('.subtitle-settings-trigger');
      trigger.onclick=()=>{const open=frame.classList.toggle('subtitle-settings-open');frame.classList.add('subtitle-settings-visible');trigger.setAttribute('aria-expanded',String(open));if(open){const menu=frame.querySelector('.movie-source-menu');if(menu)menu.hidden=true;frame.closest('.sf-full-movie-player')?.querySelectorAll('.movie-source-trigger').forEach(button=>button.setAttribute('aria-expanded','false'));}};
      const save=patch=>{localStorage.setItem('storyfox-subtitle-preferences',JSON.stringify({...app.subtitlePreferences(),...patch}));app.applySubtitlePreferences(frame);paintCaption();video.dispatchEvent(new Event('sfcaptionchange'));};
      const position=settings.querySelector('.subtitle-position');
      position.oninput=()=>{position.nextElementSibling.textContent=position.value+'%';save({captionY:Number(position.value)});};
      const visible=settings.querySelector('.subtitle-toggle');visible.onclick=()=>{const on=app.subtitlePreferences().visible===false;save({visible:on});visible.textContent=on?'已开启':'已关闭';visible.setAttribute('aria-pressed',String(on));};
      const word=settings.querySelector('.subtitle-word-toggle');word.disabled=true;word.title='整部电影字幕不含逐词时间信息';word.textContent='无逐词时间轴';
      for(const [selector,key,suffix] of [['.subtitle-size','size','px'],['.subtitle-opacity','opacity','%']]){const input=settings.querySelector(selector);input.oninput=()=>{input.nextElementSibling.textContent=input.value+suffix;save({[key]:Number(input.value)});};}
      settings.querySelector('.subtitle-color').oninput=e=>save({color:e.target.value});
      settings.querySelector('.subtitle-reset-position').onclick=()=>{save({visible:true,size:20,color:'#ffffff',captionX:50,captionY:88,opacity:72});for(const [selector,value,suffix] of [['.subtitle-size',20,'px'],['.subtitle-opacity',72,'%']]){const input=settings.querySelector(selector);input.value=value;input.nextElementSibling.textContent=value+suffix;}settings.querySelector('.subtitle-color').value='#ffffff';position.value='88';position.nextElementSibling.textContent='88%';visible.textContent='已开启';visible.setAttribute('aria-pressed','true');};
      let dragging=false;
      caption.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;dragging=true;caption.setPointerCapture?.(e.pointerId);caption.classList.add('caption-dragging');e.preventDefault();});
      caption.addEventListener('pointermove',e=>{if(!dragging)return;const r=frame.getBoundingClientRect();const y=Math.round(Math.max(8,Math.min(94,(e.clientY-r.top)/r.height*100)));position.value=String(y);position.nextElementSibling.textContent=y+'%';save({captionX:Math.round(Math.max(7,Math.min(93,(e.clientX-r.left)/r.width*100))),captionY:y});});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])caption.addEventListener(event,()=>{dragging=false;caption.classList.remove('caption-dragging');});
      video.addEventListener('timeupdate',paintCaption);video.addEventListener('seeked',paintCaption);
      app.applySubtitlePreferences(frame);
    }
    function paintCaption(){
      if(!caption)return;
      const prefs=app.subtitlePreferences(),selected=field('track').value;
      let cues=[];
      if(selected.startsWith('text:'))cues=Array.from(nativeTracks.get(selected)?.cues||[]);
      else if(selected.startsWith('manifest:'))cues=standaloneTracks[Number(selected.slice(9))]?.cues||[];
      else if(selected.startsWith('hls:')){
        const index=Number(selected.slice(4)),hlsTrack=getHls()?.subtitleTracks?.[index];
        cues=cueTracks.get(index)||[];
        if(!cues.length){
          const available=Array.from(video.textTracks).filter(track=>!tracks.some(el=>el.track===track)&&(track.kind==='subtitles'||track.kind==='captions'));
          const matching=available.find(track=>hlsTrack?.name&&track.label===hlsTrack.name)||available.find(track=>hlsTrack?.lang&&normalizeLanguage(track.language)===normalizeLanguage(hlsTrack.lang))||(available.length===1?available[0]:null);
          cues=Array.from(matching?.cues||[]);
        }
      }
      const time=video.currentTime-(Number(field('offset').value)||0);
      caption.textContent=[...new Set(cues.filter(cue=>cue.startTime<=time&&cue.endTime>time).map(cue=>cue.text.replace(/<[^>]*>/g,'')))].join('\n');
      caption.hidden=!caption.textContent||!prefs.visible;
      if(!caption.hidden){

        frame._captionLayout?.();
        const half=caption.getBoundingClientRect().height/2+4,height=frame.clientHeight;
        caption.style.top=`${Math.max(half,Math.min(height-half,height*Number(prefs.captionY)/100))}px`;
      }
    }
    let ccButton = null, ccMenu = null;
    const say = text => { if (!disposed) status.textContent = text; };
    const current = token => !disposed && token === request;

    if (frame) {
      ccButton = document.createElement('button');
      ccButton.type = 'button';
      ccButton.className = 'movie-cc-button';
      ccButton.textContent = 'CC';
      ccButton.setAttribute('aria-label', '字幕 CC');
      ccButton.setAttribute('aria-haspopup', 'menu');
      ccButton.setAttribute('aria-expanded', 'false');
      ccButton.setAttribute('aria-pressed', 'false');

      ccMenu = document.createElement('div');
      ccMenu.className = 'movie-cc-menu';
      ccMenu.setAttribute('role', 'menu');
      ccMenu.setAttribute('aria-label', '选择字幕');
      ccMenu.hidden = true;
      frame.append(ccButton, ccMenu);
    }

    function closeCCMenu() {
      if (!ccMenu || !ccButton) return;
      ccMenu.hidden = true;
      ccButton.setAttribute('aria-expanded', 'false');
    }

    function syncCCMenu() {
      if (!ccMenu || !ccButton) return;
      const select = field('track');
      ccMenu.replaceChildren();
      const options = Array.from(select.options);
      if(settingsTrack){settingsTrack.replaceChildren(...options.map(o=>new Option(o.textContent,o.value)));settingsTrack.value=select.value;}
      if (options.length <= 1) {
        const empty = document.createElement('p');
        empty.className = 'movie-cc-empty';
        empty.textContent = '暂未检测到字幕轨道';
        ccMenu.append(empty);
        const find = document.createElement('button');
        find.type = 'button';
        find.className = 'movie-cc-find';
        find.textContent = '查找英文字幕';
        find.addEventListener('click', () => {
          closeCCMenu();
          panel.scrollIntoView({behavior: 'smooth', block: 'start'});
          field('query').focus({preventScroll: true});
        });
        ccMenu.append(find);
      } else {
        options.forEach(option => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'movie-cc-option';
          item.setAttribute('role', 'menuitemradio');
          item.setAttribute('aria-checked', String(option.value === select.value));
          item.textContent = option.textContent;
          item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', {bubbles: true}));
            closeCCMenu();
          });
          ccMenu.append(item);
        });
      }
      ccButton.setAttribute('aria-pressed', String(select.value !== 'off'));
    }

    function toggleCCMenu() {
      if (!ccMenu || !ccButton) return;
      const open = ccMenu.hidden;
      if (open) syncCCMenu();
      ccMenu.hidden = !open;
      ccButton.setAttribute('aria-expanded', String(open));
    }

    const onOutsideCC = event => {
      if (frame && !frame.contains(event.target)) closeCCMenu();
    };
    const onEscapeCC = event => {
      if (event.key === 'Escape' && ccMenu && !ccMenu.hidden) {
        closeCCMenu();
        ccButton?.focus();
      }
    };
    ccButton?.addEventListener('click', toggleCCMenu);
    ccMenu?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('pointerdown', onOutsideCC);
    document.addEventListener('keydown', onEscapeCC);
    async function api(body) {
      const response = await fetch('/.netlify/functions/source-explorer-api', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: abort.signal});
      const data = await response.json();
      if (!response.ok || data.error) throw Error(data.error || '字幕服务暂时不可用');
      return data;
    }
    function refresh() {
      if (disposed) return;
      const select = field('track'), old = select.value;
      select.replaceChildren(new Option('关闭字幕 / Off', 'off'));
      Array.from(video.textTracks).forEach((t, i) => {
        const key=nativeKey(t);
        if(!cueListeners.has(t)){t.addEventListener('cuechange',paintCaption);cueListeners.set(t,paintCaption);}
        const managedByHls=!!getHls()?.subtitleTracks?.length&&!tracks.some(el=>el.track===t);
        if ((t.kind === 'subtitles' || t.kind === 'captions')&&!managedByHls) select.add(new Option(t.label || t.language || `字幕 ${i + 1}`, key));
      });
      (getHls()?.subtitleTracks || []).forEach((t, i) => select.add(new Option(t.name || t.lang || `内嵌字幕 ${i + 1}`, `hls:${i}`)));
      if(!getHls()?.subtitleTracks?.length)standaloneTracks.forEach((t,i)=>select.add(new Option(t.label,`manifest:${i}`)));
      if (Array.from(select.options).some(o => o.value === old)) select.value = old;
      else {
        const showing = Array.from(video.textTracks).findIndex(t => t.mode === 'showing');
        if (showing >= 0&&Array.from(select.options).some(o=>o.value===nativeKey(video.textTracks[showing]))) select.value = nativeKey(video.textTracks[showing]);
      }
      if(!userSelectedTrack&&select.value==='off'&&select.options.length>1){
        const preferred=Array.from(select.options).find(o=>o.value.startsWith('hls:'))||select.options[1];
        select.value=preferred.value;choose(false);
      }
      syncCCMenu();
      paintCaption();
    }
    function choose(remember=true) {
      if(remember!==false)userSelectedTrack=true;
      const value = field('track').value, hls = getHls();
      if (hls) { hls.subtitleTrack = value.startsWith('hls:') ? Number(value.slice(4)) : -1; hls.subtitleDisplay = !caption&&value.startsWith('hls:'); }
      if(!value.startsWith('hls:'))Array.from(video.textTracks).forEach(t => { t.mode = value === nativeKey(t) ? (caption?'hidden':'showing') : 'disabled'; });
      if(value==='off')caption?.replaceChildren();
      syncCCMenu();
      paintCaption();
    }
    function updateOffsetLabels(){frame?.querySelectorAll('.sf-offset-label').forEach(label=>label.textContent=(Number(field('offset').value)>0?'+':'')+(Number(field('offset').value)||0).toFixed(1)+'s');}
    function offset() {
      try{localStorage.setItem(movieOffsetKey,String(Number(field('offset').value)||0));}catch{}
      updateOffsetLabels();
      if(caption){paintCaption();return;}
      const seconds = Number(field('offset').value) || 0;
      for (const element of tracks) for (const cue of Array.from(element.track.cues || [])) {
        cue._movieOriginal ||= [cue.startTime, cue.endTime];
        cue.startTime = Math.max(0, cue._movieOriginal[0] + seconds);
        cue.endTime = Math.max(cue.startTime + 0.001, cue._movieOriginal[1] + seconds);
      }
    }
    function add(text, label) {
      if (disposed) return;
      if (!/^\s*WEBVTT/.test(text) && !/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) throw Error('请选择有效的 SRT / VTT 字幕文件');
      // Keep only the latest imported version so a slower track load cannot
      // reselect an older download after the user has chosen a newer one.
      tracks.splice(0).forEach(t => t.remove());
      blobs.splice(0).forEach(url => URL.revokeObjectURL(url));
      const track = document.createElement('track');
      track.kind = 'subtitles'; track.srclang = 'en'; track.label = label;
      track.src = URL.createObjectURL(new Blob([window.SourceLabCore.toVtt(text)], {type: 'text/vtt'}));
      blobs.push(track.src); tracks.push(track);
      track.addEventListener('load', () => {
        if (disposed || !track.isConnected) return;
        refresh(); field('track').value = nativeKey(track.track);
        choose(); offset(); say(`已加载 ${label}；如不同步，可调整延迟或选择其他版本。`);
      }, {once: true});
      track.addEventListener('error', () => say('字幕无法读取，请尝试其他版本或导入 SRT / VTT。'), {once: true});
      video.append(track); track.track.mode = 'hidden';
      say('正在加载字幕…');
    }
    function button(label, action) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn secondary'; b.textContent = label;
      b.onclick = action; results.append(b); return b;
    }
    async function search(event) {
      event?.preventDefault();
      const token = ++request; ++download;
      results.replaceChildren(); say('正在匹配影片和英文字幕…');
      try {
        const data = await api({action: 'subtitles', query: field('query').value.trim(), year: field('year').value || undefined});
        if (!current(token)) return;
        if (data.films?.length) {
          say(data.message || '请确认影片和年份。');
          for (const film of data.films) button(`${film.name} · ${film.year}`, () => { field('query').value = film.id; field('year').value = film.year || ''; search(); });
          return;
        }
        const list = data.list || [];
        say(list.length ? `${data.film ? data.film.name + ' · ' + data.film.year + '：' : ''}找到 ${list.length} 个英文字幕版本，请按发行版本选择；可切换比较。` : data.message || '未找到字幕，可修改片名或导入本地 SRT / VTT。');
        for (const file of list) button(file.label + (file.fps ? ` · ${file.fps} fps` : ''), async event => {
          const selection = ++download, b = event.currentTarget; b.disabled = true; say('正在下载字幕…');
          try {
            const result = await api({action: 'subtitle-download', fileId: file.id, provider: file.provider, imdbId: file.imdbId});
            if (current(token) && selection === download) add(result.text, file.label);
          } catch (e) { if (current(token) && selection === download) say(e.message); }
          finally { b.disabled = false; }
        });
      } catch (e) { if (current(token)) say(e.message); }
    }
    panel.querySelector('form').onsubmit = search;
    field('track').onchange = choose;
    field('offset').oninput = offset;
    updateOffsetLabels();
    field('file').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      const selection = ++download;
      try {
        if (file.size > 2e6) throw Error('请选择 2 MB 以内的字幕文件');
        const text = await file.text();
        if (!disposed && selection === download) add(text, file.name);
      } catch (e) { say(e.message); }
      finally { event.target.value = ''; }
    };
    const hideNativeCaptions=()=>{
      if(!caption||disposed)return;
      for(const track of Array.from(video.textTracks))if((track.kind==='subtitles'||track.kind==='captions')&&track.mode==='showing')track.mode='hidden';
      paintCaption();
    };
    video.textTracks.addEventListener('change',hideNativeCaptions);
    video.textTracks.addEventListener('addtrack', refresh);
    video.addEventListener('loadedmetadata', refresh);
    // HLS is created after the panel, so bind when its manifest becomes available.
    function bindHls(){
      const hls=getHls();if(hls===hlsBound)return;
      hlsListeners.splice(0).forEach(([instance,event,handler])=>instance.off(event,handler));cueTracks.clear();hlsBound=hls;
      if(!hls)return;
      const listen=(name,handler)=>{const event=window.Hls?.Events?.[name];if(event){hls.on(event,handler);hlsListeners.push([hls,event,handler]);}};
      listen('SUBTITLE_TRACKS_UPDATED',refresh);listen('MANIFEST_PARSED',refresh);
      listen('CUES_PARSED',(_,data)=>{
        if(disposed||data?.type!=='subtitles')return;
        const id=/subtitles(\d+)/.exec(String(data.track||''));
        if(!id&&data.track!=='default')return;
        const sourceId=id?Number(id[1]):-1;
        let index=id?hls.subtitleTracks.findIndex((track,i)=>Number(track.id??i)===sourceId):hls.subtitleTracks.findIndex(track=>track.default);
        if(index<0)index=id&&sourceId<hls.subtitleTracks.length?sourceId:!id?hls.subtitleTrack:-1;
        if(index<0)return;
        const existing=cueTracks.get(index)||[],keys=new Set(existing.map(c=>`${c.startTime}|${c.endTime}|${c.text}`));
        for(const cue of data.cues||[]){const key=`${cue.startTime}|${cue.endTime}|${cue.text}`;if(!keys.has(key)){existing.push(cue);keys.add(key);}}
        cueTracks.set(index,existing);paintCaption();
      });
      refresh();
    }
    const timer=setInterval(bindHls,250);bindHls();
    if(sourceManifestUrl&&/\.m3u8(?:[?#]|$)/i.test(sourceManifestUrl))loadStandalone();
    refresh();
    return () => {
      disposed = true; ++request; ++download; abort.abort(); clearInterval(timer);
      video.removeEventListener('timeupdate',paintCaption);video.removeEventListener('seeked',paintCaption);
      frame?._captionResize?.disconnect();frame?.querySelector('.subtitle-settings-dock')?.remove();caption?.remove();
      document.removeEventListener('pointerdown', onOutsideCC); document.removeEventListener('keydown', onEscapeCC);
      ccButton?.removeEventListener('click', toggleCCMenu);
      video.textTracks.removeEventListener('addtrack', refresh); video.removeEventListener('loadedmetadata', refresh);
      video.textTracks.removeEventListener('change',hideNativeCaptions);
      cueListeners.forEach((handler,track)=>track.removeEventListener('cuechange',handler));
      hlsListeners.splice(0).forEach(([hls,event,handler])=>hls.off(event,handler));cueTracks.clear();
      ccButton?.remove();ccMenu?.remove();frame?.classList.remove('sf-movie-custom-caption','subtitle-settings-open');
      tracks.forEach(t => t.remove()); blobs.forEach(url => URL.revokeObjectURL(url)); panel.remove();
    };
  }
};
