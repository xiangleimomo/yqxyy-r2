window.MovieLibrary={
  categories:{animated:'动画大电影',documentary:'纪录片',animation:'动画故事'},
  cache:null,
  e(app,value){return app.escapeHtml(String(value??''));},
  admin(){return !!window.SFCloud?.isAdmin?.()&&!!window.SFCloud?.client;},
  async rows(includeDrafts=false){
    const client=window.SFCloud?.client;if(!client)return [];
    let query=client.from('movie_library').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false});
    if(!includeDrafts)query=query.eq('published',true);
    const {data,error}=await query;if(error)throw error;return data||[];
  },
  async published(){
    // Do not permanently cache an empty response when the cloud client has not initialized.
    if(!window.SFCloud?.client){this.cache=null;return [];}
    // Refresh published catalogue on every shelf navigation; admin updates must appear immediately.
    try{return await this.rows(false);}catch(error){console.warn('Published movie library unavailable',error);throw error;}
  },
  invalidate(){this.cache=null;},
  asGroups(rows){
    // A television show is one shelf cover with separate playable episodes.
    // Existing single-episode TV rows and new batch rows share this layout.
    const movieGroups=Object.keys(this.categories).map(category=>({
      id:'library-'+category,title:this.categories[category],titleZh:this.categories[category],
      level:'',rating:0,genre:'动态影视',dynamicCategory:category,
      films:rows.filter(row=>row.category===category&&row.media_type!=='tv')
        .map(row=>[row.id,row.title,row.title_zh,row.year])
    })).filter(group=>group.films.length);
    const shows=new Map();
    for(const row of rows.filter(item=>item.media_type==='tv')){
      const id=Number(row.tmdb_id),key=String(id)+'|'+String(row.category);
      if(!Number.isSafeInteger(id)||id<1)continue;
      if(!shows.has(key))shows.set(key,{
        id:'library-tv-'+id+'-'+row.category,
        title:row.title,titleZh:row.title_zh||row.title,
        cover:row.poster_url||'',level:'',rating:0,genre:'电视剧',
        dynamicTv:true,libraryCategory:row.category,films:[],_episodes:[]
      });
      const show=shows.get(key);
      show._episodes.push(row);
      if(!show.cover&&row.poster_url)show.cover=row.poster_url;
    }
    for(const group of shows.values()){
      group._episodes.sort((a,b)=>Number(a.season_number||1)-Number(b.season_number||1)||Number(a.episode_number||1)-Number(b.episode_number||1));
      group.films=group._episodes.map(row=>[
        row.id,
        'Season '+(row.season_number||1)+' Episode '+(row.episode_number||1),
        '第'+(row.season_number||1)+'季 · 第'+(row.episode_number||1)+'集',
        row.year
      ]);
      delete group._episodes;
    }
    return [...movieGroups,...shows.values()];
  },
  info(rows){return new Map(rows.map(row=>[row.id,row]));},
  automaticSource(row){
    const id=Number(row.tmdb_id??row.tmdbId),tv=(row.media_type??row.mediaType)==='tv';
    const season=Number(row.season_number??row.seasonNumber??1),episode=Number(row.episode_number??row.episodeNumber??1);
    if(!Number.isSafeInteger(id)||id<1||tv&&(!Number.isSafeInteger(season)||season<1||!Number.isSafeInteger(episode)||episode<1))return null;
    return {kind:'auto',label:'直链播放',url:`https://api.obj2.top/hls/${tv?`tv/${id}/${season}/${episode}`:`movie/${id}`}/master.m3u8`};
  },
  planTvEpisodes(row,endValue,rawText=''){
    const tmdb=Number(row.tmdb_id),season=Number(row.season_number),start=Number(row.episode_number);
    const end=Number(endValue||start);
    if(![tmdb,season,start,end].every(Number.isSafeInteger)||tmdb<1||season<1||start<1||end<start||end>9999)
      throw Error('请填写有效的 TMDB、季数及起止集数。');
    const lines=String(rawText||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(lines.length>200||(!lines.length&&end-start+1>200))throw Error('每次最多批量添加 200 集，请分批发布。');
    const episodes=[];
    if(!lines.length){
      for(let number=start;number<=end;number++)episodes.push({season,episode:number,url:''});
    }else{
      let unnamed=0;
      for(const line of lines){
        // Either one URL per line in episode order, or S2E5|URL for
        // arbitrary seasons/episodes in a single paste.
        const tagged=line.match(/^S(\d{1,4})E(\d{1,5})\s*(?:\||:|,|\s)\s*(https:\/\/\S+)$/i);
        const ep=tagged?{season:Number(tagged[1]),episode:Number(tagged[2]),url:tagged[3]}:
          {season,episode:start+unnamed++,url:line};
        if(!Number.isSafeInteger(ep.season)||ep.season<1||!Number.isSafeInteger(ep.episode)||ep.episode<1||ep.episode>9999)
          throw Error('季数或集数无效：'+line.slice(0,50));
        // Reuse the same URL validator as the single-movie source editor.
        const auto=this.automaticSource({...row,season_number:ep.season,episode_number:ep.episode});
        if(ep.url!==auto.url)this.validateSources({...row,season_number:ep.season,episode_number:ep.episode},
          [{kind:'direct',label:'本集播放地址',url:ep.url}]);
        episodes.push(ep);
      }
      if(!lines.some(line=>/^S\d+E\d+/i.test(line))&&end>start&&episodes.length!==end-start+1)
        throw Error('粘贴地址数量与起止集数不一致，请检查后再发布。');
    }
    const seen=new Set();
    for(const item of episodes){
      const key=item.season+':'+item.episode;
      if(seen.has(key))throw Error('存在重复的电视剧集编号：S'+item.season+'E'+item.episode);
      seen.add(key);
    }
    return episodes;
  },
  tvBatchRows(row,plans,existing=[]){
    return plans.map((part,index)=>{
      const prior=existing.find(item=>item.media_type==='tv'&&Number(item.tmdb_id)===row.tmdb_id&&
        Number(item.season_number||1)===part.season&&Number(item.episode_number||1)===part.episode);
      const entry={...row,
        id:prior?.id||`tmdb-tv-${row.tmdb_id}-s${part.season}-e${part.episode}`,
        season_number:part.season,episode_number:part.episode,
        sort_order:row.sort_order+index
      };
      const auto=this.automaticSource(entry);
      entry.playback_sources=this.validateSources(entry,part.url&&part.url!==auto.url?
        [{kind:'direct',label:'本集播放地址',url:part.url}]:[]);
      // Re-publishing an automatically generated episode should not silently
      // delete its individually edited alternate playback sources.
      if(prior&&entry.playback_sources.length===1&&!part.url&&Array.isArray(prior.playback_sources)&&prior.playback_sources.length>1)
        entry.playback_sources=this.validateSources(entry,prior.playback_sources.filter(src=>src.kind!=='auto'));
      return entry;
    });
  },
  validateSources(row,manual){
    const automatic=this.automaticSource(row);if(!automatic)throw Error('请先选择有效的 TMDB 影片及季、集编号。');
    if(manual.length>20)throw Error('最多添加 20 条手动播放源。');
    const result=[automatic],seen=new Set([automatic.url]);
    for(const item of manual){
      const label=String(item.label||'').trim(),raw=String(item.url||'').trim(),kind=item.kind;
      if(!label||label.length>80)throw Error('每条播放源需要 1–80 字的名称。');
      let url;try{url=new URL(raw);}catch{throw Error('播放地址格式不正确：'+label);}
      if(!['direct','embed'].includes(kind)||url.protocol!=='https:'||url.username||url.password||raw.length>4096||/[\x00-\x20]/.test(raw))throw Error('请填写不含账号密码的 HTTPS 播放地址：'+label);
      if(kind==='direct'&&!/\.(m3u8|mp4)$/i.test(url.pathname))throw Error('直链需为 m3u8 或 mp4 地址：'+label);
      if(seen.has(raw))throw Error('播放地址重复：'+label);seen.add(raw);result.push({kind,label,url:raw});
    }
    return result;
  },
  sourceEditor(form,initial=[]){
    form.querySelector('.movie-source-editor')?.remove();
    const box=document.createElement('fieldset');box.className='movie-source-editor';box.innerHTML='<legend>播放源</legend><label>自动直链（随 TMDB、季数、集数更新）<input class="movie-auto-source" readonly aria-label="自动播放地址"></label><div class="movie-manual-sources"></div><button type="button" class="btn secondary movie-add-source">添加播放源</button><p>自动生成一条直链；可另外添加直链或第三方嵌入地址，发布后保存到后台。</p>';
    form.querySelector('#movieLibraryStatus').before(box);
    const update=()=>{const row=Object.fromEntries(['tmdb_id','media_type','season_number','episode_number'].map(key=>[key,form.elements.namedItem(key).value]));box.querySelector('.movie-auto-source').value=this.automaticSource(row)?.url||'选择影片后自动生成';};
    const add=item=>{
      if(box.querySelectorAll('.movie-source-entry').length>=20)return;
      const entry=document.createElement('div');entry.className='movie-source-entry';entry.innerHTML='<label>线路名称<input class="movie-source-label" maxlength="80" required aria-label="线路名称"></label><label>播放方式<select class="movie-source-kind" aria-label="播放方式"><option value="direct">直链（m3u8 / mp4）</option><option value="embed">第三方嵌入播放器</option></select></label><label>播放地址<input class="movie-source-url" type="url" required maxlength="4096" aria-label="播放地址" placeholder="https://"></label><button type="button" class="movie-remove-source">删除此播放源</button>';
      entry.querySelector('.movie-source-label').value=item?.label||'';entry.querySelector('.movie-source-url').value=item?.url||'';entry.querySelector('.movie-source-kind').value=item?.kind||'direct';entry.querySelector('button').onclick=()=>entry.remove();box.querySelector('.movie-manual-sources').append(entry);
    };
    initial.filter(item=>item.kind!=='auto').forEach(add);box.querySelector('.movie-add-source').onclick=()=>add();update();
    box._update=update;
  },
  editorSources(form,row){return this.validateSources(row,Array.from(form.querySelectorAll('.movie-source-entry')).map(entry=>({label:entry.querySelector('.movie-source-label').value,url:entry.querySelector('.movie-source-url').value,kind:entry.querySelector('.movie-source-kind').value})));},
  async search(query){
    const response=await fetch('/.netlify/functions/movie-library-metadata?q='+encodeURIComponent(query),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'搜索失败');return body.results||[];
  },
  async verifyPlayback(tmdbId){
    const response=await fetch('/.netlify/functions/movie-library-metadata?verify='+encodeURIComponent(tmdbId),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const body=await response.json().catch(()=>({}));if(!response.ok||!body.playbackAvailable)throw Error(body.error||'现有播放架构暂未匹配到本片。');
  },
  async uploadCover(file,status){
    if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片。');
    if(file.size>20*1024*1024)throw Error('封面图片不能超过 20 MB。');
    if(!this.admin())throw Error('请重新登录管理员账号。');
    const {data,error}=await window.SFCloud.client.auth.getSession();if(error||!data.session?.access_token)throw Error('登录已过期。');
    const body=new FormData();body.append('files[]',file);
    return await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest(),config=window.STORYFOX_SUPABASE;xhr.open('POST',config.url+'/functions/v1/pone-upload?kind=image');xhr.responseType='json';xhr.timeout=140000;xhr.setRequestHeader('Authorization','Bearer '+data.session.access_token);xhr.setRequestHeader('apikey',config.publishableKey);xhr.upload.onprogress=event=>status.textContent=event.lengthComputable?`正在上传封面… ${Math.min(99,Math.floor(event.loaded/event.total*100))}%`:'正在上传封面…';xhr.onload=()=>xhr.status===200&&xhr.response?.url?resolve(xhr.response.url):reject(Error(xhr.response?.error||'封面上传失败'));xhr.onerror=xhr.ontimeout=()=>reject(Error('封面上传连接失败'));xhr.send(body);});
  },
  async renderAdmin(app){
    if(!this.admin()){app.el().innerHTML='<section class="empty"><h2>仅管理员可管理影视资源</h2><a href="#/movies">返回光影课堂</a></section>';return;}
    const e=value=>this.e(app,value);let rows=await this.rows(true),selected=null,cover='';
    const formHtml=()=>`<section class="book-admin movie-library-admin"><header><h1>影视资源管理</h1><p>搜索影片资料后发布。系统按 TMDB 编号自动生成直链，也可以添加多个播放源并保存。</p></header><div class="movie-admin-search"><input id="movieMetaSearch" maxlength="80" placeholder="输入中英文影片名称"><button class="btn" id="movieMetaSearchButton">搜索影片</button></div><div id="movieMetaResults" class="movie-meta-results"></div><form id="movieLibraryForm"><input name="id" type="hidden"><div class="book-admin-columns"><div><label>发布栏目<select name="category">${Object.entries(this.categories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>影片名称<input name="title" required maxlength="220"></label><label>中文名称<input name="title_zh" maxlength="220"></label><label>上映年份<input name="year" type="number" min="1888" max="2200"></label><label>TMDB ID<input name="tmdb_id" type="number" min="1" required readonly></label><label>影片类型<select name="media_type"><option value="movie">电影</option><option value="tv">电视剧</option></select></label><div class="movie-tv-fields"><label>第几季<input name="season_number" type="number" min="1" value="1"></label><label>第几集<input name="episode_number" type="number" min="1" value="1"></label></div><label>影片简介<textarea name="overview" maxlength="4000"></textarea></label><label>封面地址<input name="poster_url" type="url" maxlength="2048"></label><label>手动上传封面<input name="cover_file" type="file" accept="image/jpeg,image/png,image/webp"></label><label>排序<input name="sort_order" type="number" value="0"></label><label><input name="published" type="checkbox" checked> 立即发布</label></div><aside><h2>封面预览</h2><div id="movieLibraryPreview"></div></aside></div><p id="movieLibraryStatus" role="status" aria-live="polite"></p><button class="btn" type="submit">发布影片</button> <button class="btn secondary" type="button" id="movieLibraryReset">新建</button></form></section><section class="book-admin movie-library-admin"><h2>已发布资源</h2><div class="movie-admin-list">${rows.map(row=>`<article data-id="${e(row.id)}"><img src="${e(row.poster_url)}" alt="" referrerpolicy="no-referrer"><div><strong>${e(row.title_zh||row.title)}</strong><span>${e(this.categories[row.category]||row.category)} · ${e(row.year||'年份未填')} · TMDB ${e(row.tmdb_id)}</span></div><button class="btn secondary movie-edit">编辑</button><button class="btn secondary movie-delete">删除</button></article>`).join('')||'<p class="muted">尚未发布影视资源。</p>'}</div></section>`;
    app.el().innerHTML=formHtml();const form=app.el().querySelector('#movieLibraryForm'),field=name=>form.elements.namedItem(name),status=form.querySelector('#movieLibraryStatus'),publishButton=form.querySelector('button[type="submit"]');form.noValidate=true;const show=(message,kind='')=>{status.textContent=message;status.className='movie-library-status '+kind;};
    const preview=()=>{const url=field('poster_url').value.trim()||cover;app.el().querySelector('#movieLibraryPreview').innerHTML=url?`<img src="${e(url)}" alt="封面预览" referrerpolicy="no-referrer">`:'<p class="muted">选择影片或上传封面后显示预览。</p>';};
    this.sourceEditor(form);
    const fill=row=>{selected=row;cover=row.posterUrl||row.poster_url||'';field('id').value=row.id||`tmdb-${row.mediaType||row.media_type}-${row.tmdbId||row.tmdb_id}`;field('category').value=row.category||'animated';field('title').value=row.title||'';field('title_zh').value=row.titleZh||row.title_zh||'';field('year').value=row.year||'';field('tmdb_id').value=row.tmdbId||row.tmdb_id||'';field('media_type').value=row.mediaType||row.media_type||'movie';field('season_number').value=row.seasonNumber||row.season_number||1;field('episode_number').value=row.episodeNumber||row.episode_number||1;field('overview').value=row.overview||'';field('poster_url').value=cover;field('sort_order').value=row.sort_order||0;field('published').checked=row.published!==false;this.sourceEditor(form,row.playback_sources||[]);preview();};
    const reset=()=>{form.reset();selected=null;cover='';field('id').value='';field('published').checked=true;this.sourceEditor(form);preview();};
    app.el().querySelector('#movieLibraryReset').onclick=reset;form.oninput=()=>{preview();form.querySelector('.movie-source-editor')?._update?.();};
    field('cover_file').onchange=async()=>{try{cover=await this.uploadCover(field('cover_file').files[0],status);field('poster_url').value=cover;status.textContent='封面已上传，可继续发布。';preview();}catch(error){status.textContent=error.message;}};
    const drawResults=list=>{const box=app.el().querySelector('#movieMetaResults');box.innerHTML=list.map((row,index)=>`<button type="button" class="movie-meta-result" data-index="${index}">${row.posterUrl?`<img src="${e(row.posterUrl)}" alt="" referrerpolicy="no-referrer">`:''}<span><strong>${e(row.title)}</strong><small>${e(row.mediaType==='tv'?'电视剧':'电影')} · ${e(row.year||'年份未知')} · TMDB ${e(row.tmdbId)}</small></span></button>`).join('')||'<p class="muted">没有找到可用影片资料。</p>';box.querySelectorAll('[data-index]').forEach(button=>button.onclick=()=>fill(list[Number(button.dataset.index)]));};
    const search=async()=>{const query=app.el().querySelector('#movieMetaSearch').value.trim();if(!query)return;status.textContent='正在搜索影片资料…';try{const list=await this.search(query);drawResults(list);status.textContent=`找到 ${list.length} 条结果，请选择正确影片。`;}catch(error){status.textContent=error.message;}};app.el().querySelector('#movieMetaSearchButton').onclick=search;app.el().querySelector('#movieMetaSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search();}};
    form.onsubmit=async event=>{event.preventDefault();if(!this.admin()){show('管理员登录状态已失效，请重新登录。','error');return;}if(!form.checkValidity()){show('请先填写标记为必填的影片资料。','error');form.reportValidity();return;}const type=field('media_type').value;const tmdb=Number(field('tmdb_id').value);if(!Number.isSafeInteger(tmdb)||tmdb<1){show('请从搜索结果中选择有效影片。','error');return;}const row={id:field('id').value||`tmdb-${type}-${tmdb}`,category:field('category').value,media_type:type,tmdb_id:tmdb,title:field('title').value.trim(),title_zh:field('title_zh').value.trim(),year:Number(field('year').value)||null,season_number:type==='tv'?Math.max(1,Number(field('season_number').value)||1):1,episode_number:type==='tv'?Math.max(1,Number(field('episode_number').value)||1):1,poster_url:field('poster_url').value.trim(),overview:field('overview').value.trim(),sort_order:Number(field('sort_order').value)||0,published:field('published').checked,created_by:window.SFCloud.user.id,updated_at:new Date().toISOString()};if(!row.title){show('请填写影片名称。','error');return;}publishButton.disabled=true;try{row.playback_sources=this.editorSources(form,row);show('正在发布影片，请稍候…','loading');await this.verifyPlayback(tmdb);show('正在写入影片资料…','loading');const {data,error}=await window.SFCloud.client.from('movie_library').upsert(row,{onConflict:'id'}).select('id,published,playback_sources').single();if(error)throw error;if(!data?.id||(!Array.isArray(data.playback_sources)||data.playback_sources.length!==row.playback_sources.length||data.playback_sources.some((source,i)=>['kind','url','label'].some(key=>source[key]!==row.playback_sources[i][key]))))throw Error('后台未确认播放源保存，请重试。');this.invalidate();show('保存成功，正在更新资源列表…','success');rows=await this.rows(true);app.el().innerHTML='';await this.renderAdmin(app);}catch(error){show('发布失败：'+error.message,'error');}finally{publishButton.disabled=false;}};
    app.el().querySelectorAll('.movie-edit').forEach(button=>button.onclick=()=>fill(rows.find(row=>row.id===button.closest('[data-id]').dataset.id)));app.el().querySelectorAll('.movie-delete').forEach(button=>button.onclick=async()=>{const id=button.closest('[data-id]').dataset.id,row=rows.find(item=>item.id===id);if(!window.confirm(`确认删除《${row.title_zh||row.title}》吗？删除后前台将不再显示。`))return;const {error}=await window.SFCloud.client.from('movie_library').delete().eq('id',id);if(error){status.textContent='删除失败：'+error.message;return;}this.invalidate();await this.renderAdmin(app);});preview();
  }
};
