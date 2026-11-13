window.MovieLibrary={
  categories:{animated:'动画大电影',documentary:'纪录片',animation:'动画故事',kids:'儿童动画'},
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
  // Search by exact programme name when the site's TMDB Functions endpoint
  // has not yet been deployed. TVmaze's public API supports CORS without keys.
  normalizeSeriesTitle(value){
    return String(value||'').normalize('NFKC').toLowerCase()
      .replace(/&/g,'and').replace(/[^\\p{L}\\p{N}]+/gu,'').trim();
  },
  matchTvmazeShows(results,titles,year){
    const names=[...new Set(titles.map(t=>this.normalizeSeriesTitle(t)).filter(Boolean))];
    const exact=(Array.isArray(results)?results:[])
      .map(item=>item?.show).filter(show=>Number.isSafeInteger(show?.id)&&show.id>0)
      .filter(show=>names.includes(this.normalizeSeriesTitle(show.name)));
    if(!exact.length)return null;
    const published=Number(year);
    const candidates=(published>=1888&&published<=2200)
      ? exact.filter(show=>{
          const y=Number(String(show.premiered||'').slice(0,4));
          return Number.isInteger(y)&&Math.abs(y-published)<=2;
        }):exact;
    const unique=(candidates.length?candidates:exact).filter((show,index,array)=>array.findIndex(other=>other.id===show.id)===index);
    if(unique.length!==1)return null;
    return unique[0];
  },
  summarizeTvmazeEpisodes(episodes){
    if(!Array.isArray(episodes))throw Error('剧集数据暂时无效');
    const groups=new Map();
    for(const ep of episodes){
      const season=Number(ep?.season),number=Number(ep?.number);
      if(!Number.isSafeInteger(season)||season<1||!Number.isSafeInteger(number)||number<1)continue;
      if(!groups.has(season))groups.set(season,new Set());
      groups.get(season).add(number);
    }
    const seasons=[...groups].map(([season,all])=>({
      season_number:season,episode_count:Math.max(...all),
      known_episodes:all.size,season_name:'Season '+season
    })).sort((a,b)=>a.season_number-b.season_number);
    return {seasons,total_episodes:seasons.reduce((sum,s)=>sum+s.known_episodes,0)};
  },
  async tvSeasons(tmdbId,metadata={}){
    const id=Number(tmdbId);
    if(!Number.isSafeInteger(id)||id<1)throw Error('请选择正确的 TMDB 电视剧');
    const titles=[metadata.title,metadata.title_zh].filter(value=>String(value||'').trim());
    // This APK reads the public TVmaze REST API directly; no Netlify
    // deployment, TMDB credentials or custom serverless endpoint is needed.
    // TVmaze and TMDB can differ in episode numbering, so label the source.
    if(!titles.length)throw Error('请先选择带有电视剧名称的搜索结果，才能自动采集集数。');
    let candidates=[];
    let show=null;
    let lastError=null;
    for(const title of [...new Set(titles)]){
      if(!title.trim())continue;
      try{
        const url='https://api.tvmaze.com/search/shows?q='+encodeURIComponent(title);
        const response=await fetch(url,{headers:{Accept:'application/json'},
          signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('HTTP '+response.status);
        const data=await response.json();
        candidates.push(...(Array.isArray(data)?data:[]));
        show=this.matchTvmazeShows(candidates,titles,metadata.year);
        if(show)break;
      }catch(error){lastError=error;}
    }
    if(!show){
      throw Error(candidates.length
        ? '已搜索公开剧集资料，但未能唯一匹配该电视剧；请核对英文片名、首播年份或手动输入集数。'
        : '在线集数资料暂不可用'+(lastError?'（网络请求失败）':'（未找到同名电视剧）')+'；请手动填写。');
    }
    const response=await fetch('https://api.tvmaze.com/shows/'+show.id+'/episodes',{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(14000)});
    if(!response.ok)throw Error('剧集列表暂时无法读取（HTTP '+response.status+'）');
    const data=this.summarizeTvmazeEpisodes(await response.json());
    if(!data.seasons.length)throw Error('公开剧集库尚未收录可识别的分集记录，请手动填写。');
    return {...data,source:'TVmaze',title:show.name,source_url:show.url||'https://www.tvmaze.com/',
      matchedYear:String(show.premiered||'').slice(0,4)};
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
  adminListHtml(rows,app){
    const e=value=>this.e(app,value);
    const card=row=>`<article data-id="${e(row.id)}"><img src="${e(row.poster_url||'')}" alt="" referrerpolicy="no-referrer"><div><strong>${e(row.media_type==='tv'?'第'+row.season_number+'季 · 第'+row.episode_number+'集':row.title_zh||row.title)}</strong><span>${e(this.categories[row.category]||row.category)} · TMDB ${e(row.tmdb_id)}</span></div><button class="btn secondary movie-edit">编辑</button><button class="btn secondary movie-delete">删除</button></article>`;
    const films=rows.filter(row=>row.media_type!=='tv');
    const grouped=new Map();
    for(const row of rows.filter(item=>item.media_type==='tv')){
      const key=String(row.tmdb_id);
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push(row);
    }
    const shows=[...grouped.values()].map(entries=>{
      entries.sort((a,b)=>a.season_number-b.season_number||a.episode_number-b.episode_number);
      const show=entries[0];
      return `<details class="movie-tv-admin-group"><summary><img src="${e(show.poster_url||'')}" alt="" referrerpolicy="no-referrer"><span><strong>${e(show.title_zh||show.title)}</strong><small>电视剧 · TMDB ${e(show.tmdb_id)} · ${entries.length} 集（点此展开编辑）</small></span></summary><div class="movie-tv-admin-episodes">${entries.map(card).join('')}</div></details>`;
    });
    return [...films.map(card),...shows].join('')||'<p class="muted">尚未发布影视资源。</p>';
  },
  async renderAdmin(app){
    if(!this.admin()){app.el().innerHTML='<section class="empty"><h2>仅管理员可管理影视资源</h2><a href="#/movies">返回光影课堂</a></section>';return;}
    const e=value=>this.e(app,value);let rows=await this.rows(true),selected=null,cover='',tvSeasons=[],tvSummary=null,tvRequest=0,editingExisting=false;
    const formHtml=()=>`<section class="book-admin movie-library-admin"><header><h1>影视资源管理</h1><p>先选择电影或电视剧。电影为一张海报对应一个播放地址；电视剧为一张海报对应多集，可按 TMDB 规律生成或一次粘贴整季播放链接。</p></header><div class="movie-admin-search"><input id="movieMetaSearch" maxlength="80" placeholder="输入中英文影片名称"><button class="btn" id="movieMetaSearchButton">搜索影片</button></div><div id="movieMetaResults" class="movie-meta-results"></div><form id="movieLibraryForm"><input name="id" type="hidden"><div class="book-admin-columns"><div><label>发布栏目<select name="category">${Object.entries(this.categories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>影片名称<input name="title" required maxlength="220"></label><label>中文名称<input name="title_zh" maxlength="220"></label><label>上映年份<input name="year" type="number" min="1888" max="2200"></label><label>TMDB ID<input name="tmdb_id" type="number" min="1" required readonly></label><label>影片类型<select name="media_type"><option value="movie">电影</option><option value="tv">电视剧</option></select></label><div class="movie-tv-fields" hidden><label>第几季<input name="season_number" type="number" min="1" value="1"></label><label>起始集<input name="episode_number" type="number" min="1" value="1"></label><label>终止集（自动采集，可修改）<input name="episode_end" type="number" min="1" max="9999" value="1"></label><button type="button" class="btn secondary" id="movieTvLoadCount">自动采集本剧集数</button><p class="movie-tv-auto-info" role="status">选择电视剧后自动查询整剧各季集数；播放地址仍使用 TMDB ID。</p><label>批量播放链接（每行一集，可留空自动生成）<textarea name="tv_episode_urls" rows="6" placeholder="https://example.com/episode1.m3u8&#10;https://example.com/episode2.m3u8&#10;或 S2E1|https://example.com/episode1.m3u8"></textarea></label><p class="muted">按顺序粘贴网址会从起始集连续编号；也支持 S1E1|网址、S2E1|网址，跨季一次导入。留空则按 TMDB 编号和起止集数生成，每批最多 200 集。</p><div class="movie-tv-preview" role="status"></div></div><label>影片简介<textarea name="overview" maxlength="4000"></textarea></label><label>封面地址<input name="poster_url" type="url" maxlength="2048"></label><label>手动上传封面<input name="cover_file" type="file" accept="image/jpeg,image/png,image/webp"></label><label>排序<input name="sort_order" type="number" value="0"></label><label><input name="published" type="checkbox" checked> 立即发布</label></div><aside><h2>封面预览</h2><div id="movieLibraryPreview"></div></aside></div><p id="movieLibraryStatus" role="status" aria-live="polite"></p><button class="btn" type="submit">发布影片</button> <button class="btn secondary" type="button" id="movieLibraryReset">新建</button></form></section><section class="book-admin movie-library-admin"><h2>已发布资源</h2><div class="movie-admin-list">${this.adminListHtml(rows,app)}</div></section>`;
    app.el().innerHTML=formHtml();const form=app.el().querySelector('#movieLibraryForm'),field=name=>form.elements.namedItem(name),status=form.querySelector('#movieLibraryStatus'),publishButton=form.querySelector('button[type="submit"]');form.noValidate=true;const show=(message,kind='')=>{status.textContent=message;status.className='movie-library-status '+kind;};
    const applyTvCount=(force=false)=>{
      const season=Number(field('season_number').value)||1;
      const seasonMeta=tvSeasons.find(item=>Number(item.season_number)===season);
      const info=form.querySelector('.movie-tv-auto-info');
      if(!seasonMeta){
        if(tvSeasons.length)info.textContent='未采集到第 '+season+' 季的集数，请核实后填写。';
        return;
      }
      const total=Number(tvSummary?.total_episodes)||
        tvSeasons.reduce((n,item)=>n+Number(item.known_episodes||item.episode_count||0),0);
      const count=Number(seasonMeta.known_episodes||seasonMeta.episode_count);
      const last=Number(seasonMeta.episode_count);
      const source=tvSummary?.source||'公开剧集库';
      info.textContent='已找到《'+(tvSummary?.title||field('title').value)+'》：'+
        tvSeasons.length+' 季，共 '+total+' 集；第 '+season+' 季收录 '+count+
        ' 集，最后集号 '+last+'。数据来自 '+source+
        '；播放地址仍使用 TMDB ID '+field('tmdb_id').value+
        '。不同资料库的分集编号可能不同，请核对。';
      if((force||!editingExisting)&&!field('tv_episode_urls').value.trim()){
        const first=Number(field('episode_number').value)||1;
        if(first<=last)field('episode_end').value=String(last);
        else info.textContent+=' 起始集超过本季最后集号。';
      }
    };
    const loadTvSeasons=async(force=false)=>{
      const tmdbId=Number(field('tmdb_id').value);
      if(field('media_type').value!=='tv'||!Number.isSafeInteger(tmdbId)||tmdbId<1)return;
      const req=++tvRequest;
      const info=form.querySelector('.movie-tv-auto-info');
      info.textContent='正在自动查询该电视剧全部季数与集数…';
      try{
        const data=await this.tvSeasons(tmdbId,{
          title:field('title').value.trim(),
          title_zh:field('title_zh').value.trim(),
          year:field('year').value
        });
        if(req!==tvRequest||Number(field('tmdb_id').value)!==tmdbId)return;
        tvSummary=data;tvSeasons=data.seasons;
        applyTvCount(force);syncType();
        if(!tvSeasons.length)info.textContent='该剧暂无可用集数，请手动填写。';
      }catch(error){
        if(req!==tvRequest)return;
        tvSummary=null;tvSeasons=[];
        info.textContent=error.message+'（仍可手动填写终止集，视频链接保留 TMDB ID）';
      }
    };
    const syncType=()=>{
      const tv=field('media_type').value==='tv';
      const tvFields=form.querySelector('.movie-tv-fields');
      tvFields.hidden=!tv;
      const start=Math.max(1,Number(field('episode_number').value)||1);
      const end=Math.max(start,Number(field('episode_end').value)||start);
      const raw=field('tv_episode_urls').value.trim();
      const multiple=tv&&(end>start||raw.includes('\n')||raw.length>0);
      form.querySelector('.movie-source-editor').hidden=multiple;
      // Hidden, legacy manual-source inputs must not block a TV bulk submit.
      form.querySelectorAll('.movie-source-entry input,.movie-source-entry select').forEach(input=>{input.disabled=multiple;});
      const preview=form.querySelector('.movie-tv-preview');
      if(tv){
        try{
          const tmdb=Number(field('tmdb_id').value);
          const entries=Number.isSafeInteger(tmdb)&&tmdb>0
            ? this.planTvEpisodes({tmdb_id:tmdb,season_number:Number(field('season_number').value)||1,episode_number:start},end,raw):[];
          preview.textContent=entries.length
            ? '将保存 '+entries.length+' 集 · '+entries.slice(0,3).map(entry=>'S'+entry.season+'E'+entry.episode).join('、')+(entries.length>3?'…':'')
            : '选择电视剧后，设置季数、集数，或粘贴各集播放网址。';
        }catch(error){preview.textContent=error.message;}
      }else preview.textContent='';
      publishButton.textContent=tv?'批量发布剧集':'发布影片';
    };
    const preview=()=>{const url=field('poster_url').value.trim()||cover;app.el().querySelector('#movieLibraryPreview').innerHTML=url?`<img src="${e(url)}" alt="封面预览" referrerpolicy="no-referrer">`:'<p class="muted">选择影片或上传封面后显示预览。</p>';};
    this.sourceEditor(form);
    syncType();
    const fill=row=>{selected=row;editingExisting=rows.some(item=>item.id===row.id);tvSeasons=[];tvSummary=null;tvRequest++;cover=row.posterUrl||row.poster_url||'';field('id').value=row.id||`tmdb-${row.mediaType||row.media_type}-${row.tmdbId||row.tmdb_id}`;field('category').value=row.category||'animated';field('title').value=row.title||'';field('title_zh').value=row.titleZh||row.title_zh||'';field('year').value=row.year||'';field('tmdb_id').value=row.tmdbId||row.tmdb_id||'';field('media_type').value=row.mediaType||row.media_type||'movie';field('season_number').value=row.seasonNumber||row.season_number||1;field('episode_number').value=row.episodeNumber||row.episode_number||1;field('episode_end').value=row.episodeNumber||row.episode_number||1;field('tv_episode_urls').value='';field('overview').value=row.overview||'';field('poster_url').value=cover;field('sort_order').value=row.sort_order||0;field('published').checked=row.published!==false;this.sourceEditor(form,row.playback_sources||[]);syncType();preview();if(field('media_type').value==='tv')void loadTvSeasons();};
    const reset=()=>{form.reset();selected=null;editingExisting=false;tvSeasons=[];tvSummary=null;tvRequest++;cover='';field('id').value='';field('published').checked=true;this.sourceEditor(form);syncType();preview();};
    app.el().querySelector('#movieLibraryReset').onclick=reset;form.oninput=()=>{preview();form.querySelector('.movie-source-editor')?._update?.();syncType();};
    field('media_type').addEventListener('change',()=>{syncType();if(field('media_type').value==='tv')void loadTvSeasons();});
    field('season_number').addEventListener('change',()=>{applyTvCount();syncType();});
    form.querySelector('#movieTvLoadCount').addEventListener('click',()=>{if(tvSeasons.length){applyTvCount(true);syncType();}else void loadTvSeasons(true);});
    field('cover_file').onchange=async()=>{try{cover=await this.uploadCover(field('cover_file').files[0],status);field('poster_url').value=cover;status.textContent='封面已上传，可继续发布。';preview();}catch(error){status.textContent=error.message;}};
    const drawResults=list=>{const box=app.el().querySelector('#movieMetaResults');box.innerHTML=list.map((row,index)=>`<button type="button" class="movie-meta-result" data-index="${index}">${row.posterUrl?`<img src="${e(row.posterUrl)}" alt="" referrerpolicy="no-referrer">`:''}<span><strong>${e(row.title)}</strong><small>${e(row.mediaType==='tv'?'电视剧':'电影')} · ${e(row.year||'年份未知')} · TMDB ${e(row.tmdbId)}</small></span></button>`).join('')||'<p class="muted">没有找到可用影片资料。</p>';box.querySelectorAll('[data-index]').forEach(button=>button.onclick=()=>fill(list[Number(button.dataset.index)]));};
    const search=async()=>{const query=app.el().querySelector('#movieMetaSearch').value.trim();if(!query)return;status.textContent='正在搜索影片资料…';try{const list=await this.search(query);drawResults(list);status.textContent=`找到 ${list.length} 条结果，请选择正确影片。`;}catch(error){status.textContent=error.message;}};app.el().querySelector('#movieMetaSearchButton').onclick=search;app.el().querySelector('#movieMetaSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search();}};
    form.onsubmit=async event=>{
      event.preventDefault();
      if(!this.admin()){show('管理员登录状态已失效，请重新登录。','error');return;}
      if(!form.checkValidity()){show('请先填写必填资料。','error');form.reportValidity();return;}
      const type=field('media_type').value,tmdb=Number(field('tmdb_id').value);
      if(!Number.isSafeInteger(tmdb)||tmdb<1){show('请从搜索结果中选择有效影片。','error');return;}
      const row={
        id:selected?.media_type===type?field('id').value:`tmdb-${type}-${tmdb}`,
        category:field('category').value,media_type:type,tmdb_id:tmdb,
        title:field('title').value.trim(),title_zh:field('title_zh').value.trim(),
        year:Number(field('year').value)||null,
        season_number:type==='tv'?Number(field('season_number').value)||1:1,
        episode_number:type==='tv'?Number(field('episode_number').value)||1:1,
        poster_url:field('poster_url').value.trim(),overview:field('overview').value.trim(),
        sort_order:Number(field('sort_order').value)||0,published:field('published').checked,
        created_by:window.SFCloud.user.id,updated_at:new Date().toISOString()
      };
      if(!row.title){show('请填写影片名称。','error');return;}
      publishButton.disabled=true;
      try{
        const directEditor=Array.from(form.querySelectorAll('.movie-source-entry'));
        let payload;
        if(type==='tv'){
          const plans=this.planTvEpisodes(row,field('episode_end').value,field('tv_episode_urls').value);
          if(plans.length>1&&directEditor.length&&!form.querySelector('.movie-source-editor').hidden)
            throw Error('电视剧批量播放地址请填写在「批量播放链接」中。');
          payload=this.tvBatchRows(row,plans,rows);
          // Editing one historical TV episode still supports manually saved
          // direct and iframe alternate playback sources.
          if(plans.length===1&&!field('tv_episode_urls').value.trim())
            payload[0].playback_sources=this.editorSources(form,payload[0]);
        }else{
          row.id=row.id||`tmdb-movie-${tmdb}`;
          row.playback_sources=this.editorSources(form,row);
          payload=[row];
        }
        show('准备发布 '+payload.length+' 项，正在检查并保存…','loading');
        await this.verifyPlayback(tmdb);
        const table=window.SFCloud.client.from('movie_library');
        const query=table.upsert(payload.length===1?payload[0]:payload,{onConflict:'id'})
          .select('id,published,playback_sources');
        const {data,error}=payload.length===1?await query.single():await query;
        if(error)throw error;
        const saved=Array.isArray(data)?data:[data];
        if(saved.length!==payload.length)throw Error('后台返回的条目数量不完整，请核对后重试。');
        for(const expected of payload){
          const actual=saved.find(item=>item?.id===expected.id);
          if(!actual||!Array.isArray(actual.playback_sources)||
             actual.playback_sources.length!==expected.playback_sources.length||
             actual.playback_sources.some((source,i)=>
               ['kind','url','label'].some(key=>source[key]!==expected.playback_sources[i][key])))
            throw Error('后台未确认保存：'+expected.id);
        }
        this.invalidate();
        show('已保存 '+payload.length+' 项，正在刷新资源列表…','success');
        rows=await this.rows(true);
        await this.renderAdmin(app);
      }catch(error){show('发布失败：'+error.message,'error');}
      finally{publishButton.disabled=false;}
    };
    app.el().querySelectorAll('.movie-edit').forEach(button=>button.onclick=()=>fill(rows.find(row=>row.id===button.closest('[data-id]').dataset.id)));app.el().querySelectorAll('.movie-delete').forEach(button=>button.onclick=async()=>{const id=button.closest('[data-id]').dataset.id,row=rows.find(item=>item.id===id);if(!window.confirm(`确认删除《${row.title_zh||row.title}》吗？删除后前台将不再显示。`))return;const {error}=await window.SFCloud.client.from('movie_library').delete().eq('id',id);if(error){status.textContent='删除失败：'+error.message;return;}this.invalidate();await this.renderAdmin(app);});preview();
  }
};
