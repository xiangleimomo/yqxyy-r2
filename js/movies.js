/* Movie catalogue supports media URLs and explicitly embedded player pages. */
window.MovieClassroom = {
  player: null, frame: null, hls: null, libraryPromise: null, generation: 0,
  // Backdrops are discovered automatically by TMDB ID; share requests across episodes.
  backdropRequests:new Map(), backdropMemory:new Map(),
  seriesCovers: {
    'harry-potter':'https://media.themoviedb.org/t/p/w500/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg',
    'fantastic-beasts':'https://media.themoviedb.org/t/p/w500/h6NYfVUyM6CDURtZSnBpz647Ldd.jpg',
    'narnia':'https://media.themoviedb.org/t/p/w500/iREd0rNCjYdf5Ar0vfaW32yrkm.jpg',
    'paddington':'https://media.themoviedb.org/t/p/w500/wpchRGhRhvhtU083PfX2yixXtiw.jpg',
    'toy-story':'https://media.themoviedb.org/t/p/w500/sfQtVlIHljToOwYjhe21KPGzZWK.jpg',
    'how-to-train-your-dragon':'https://media.themoviedb.org/t/p/w500/53dsJ3oEnBhTBVMigWJ9tkA5bzJ.jpg',
    'kung-fu-panda':'https://media.themoviedb.org/t/p/w500/wWt4JYXTg5Wr3xBW2phBrMKgp3x.jpg',
    'zootopia':'https://media.themoviedb.org/t/p/w500/hlK0e0wAQ3VLuJcsfIYPvb4JVud.jpg',
    'inside-out':'https://media.themoviedb.org/t/p/w500/2H1TmgdfNtsKlU9jKdeNyYL5y8T.jpg',
    'finding-nemo':'https://media.themoviedb.org/t/p/w500/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg',
    'the-incredibles':'https://media.themoviedb.org/t/p/w500/2LqaLgk4Z226KkgPJuiOQ58wvrm.jpg',
    'monsters':'https://media.themoviedb.org/t/p/w500/wFSpyMsp7H0ttERbxY7Trlv8xry.jpg',
    'cars':'https://media.themoviedb.org/t/p/w500/2Touk3m5gzsqr1VsvxypdyHY5ci.jpg',
    'frozen':'https://media.themoviedb.org/t/p/w500/itAKcobTYGpYT8Phwjd8c9hleTo.jpg',
    'wreck-it-ralph':'https://media.themoviedb.org/t/p/w500/nrEupcBwf4O1zihCM34NoXusZDq.jpg',
    'despicable-me':'https://media.themoviedb.org/t/p/w500/b1BT309QWjtFUlJPLmXmrcHOWEL.jpg',
    'sing':'https://media.themoviedb.org/t/p/w500/rwopfpHqPCYBSgBuZwkaXXqHp14.jpg',
    'secret-life-of-pets':'https://media.themoviedb.org/t/p/w500/s9xg4V5EDKiphgIksVJ9gewBM11.jpg',
    'hotel-transylvania':'https://media.themoviedb.org/t/p/w500/eJGvzGrsfe2sqTUPv5IwLWXjVuR.jpg',
    'the-croods':'https://media.themoviedb.org/t/p/w500/27zvjVOtOi5ped1HSlJKNsKXkFH.jpg',
    'trolls':'https://media.themoviedb.org/t/p/w500/9VlK2j0THZWzhQPq0W3Oc0IIdBB.jpg',
    'the-bad-guys':'https://media.themoviedb.org/t/p/w500/7qop80YfuO0BwJa1uXk1DXUUEwv.jpg',
    'peter-rabbit':'https://media.themoviedb.org/t/p/w500/lugOvdaNpbVGQK9TyMRDiUbLtY6.jpg',
    'sonic':'https://media.themoviedb.org/t/p/w500/aQvJ5WPzZgYVDrxLX4R6cLJCEaQ.jpg',
    'ice-age':'https://media.themoviedb.org/t/p/w500/gLhHHZUzeseRXShoDyC4VqLgsNv.jpg'
  },
  filmCovers: {
    'harry-potter-philosophers-stone':'https://media.themoviedb.org/t/p/w500/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg','harry-potter-chamber-of-secrets':'https://media.themoviedb.org/t/p/w500/sdEOH0992YZ0QSxgXNIGLq1ToUi.jpg','harry-potter-prisoner-of-azkaban':'https://media.themoviedb.org/t/p/w500/aWxwnYoe8p2d2fcxOqtvAtJ72Rw.jpg','harry-potter-goblet-of-fire':'https://media.themoviedb.org/t/p/w500/fECBtHlr0RB3foNHDiCBXeg9Bv9.jpg','harry-potter-order-of-phoenix':'https://media.themoviedb.org/t/p/w500/5aOyriWkPec0zUDxmHFP9qMmBaj.jpg','harry-potter-half-blood-prince':'https://media.themoviedb.org/t/p/w500/z7uo9zmQdQwU5ZJHFpv2Upl30i1.jpg','harry-potter-deathly-hallows-part-1':'https://media.themoviedb.org/t/p/w500/iGoXIpQb7Pot00EEdwpwPajheZ5.jpg','harry-potter-deathly-hallows-part-2':'https://media.themoviedb.org/t/p/w500/c54HpQmuwXjHq2C9wmoACjxoom3.jpg',
    'fantastic-beasts-1':'https://media.themoviedb.org/t/p/w500/h6NYfVUyM6CDURtZSnBpz647Ldd.jpg','fantastic-beasts-2':'https://media.themoviedb.org/t/p/w500/fMMrl8fD9gRCFJvsx0SuFwkEOop.jpg','fantastic-beasts-3':'https://media.themoviedb.org/t/p/w500/3c5GNLB4yRSLBby0trHoA1DSQxQ.jpg','narnia-1':'https://media.themoviedb.org/t/p/w500/iREd0rNCjYdf5Ar0vfaW32yrkm.jpg','narnia-2':'https://media.themoviedb.org/t/p/w500/qxz3WIyjZiSKUhaTIEJ3c1GcC9z.jpg','narnia-3':'https://media.themoviedb.org/t/p/w500/pP27zlm9yeKrCeDZLFLP2HKELot.jpg',
    'paddington-1':'https://media.themoviedb.org/t/p/w500/wpchRGhRhvhtU083PfX2yixXtiw.jpg','paddington-2':'https://media.themoviedb.org/t/p/w500/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg','paddington-3':'https://media.themoviedb.org/t/p/w500/1ffZAucqfvQu36x1C49XfOdjuOG.jpg','toy-story-1':'https://media.themoviedb.org/t/p/w500/sfQtVlIHljToOwYjhe21KPGzZWK.jpg','toy-story-2':'https://media.themoviedb.org/t/p/w500/4rbcp3ng8n1MKHjpeqW0L7Fnpzz.jpg','toy-story-3':'https://media.themoviedb.org/t/p/w500/AbbXspMOwdvwWZgVN0nabZq03Ec.jpg','toy-story-4':'https://media.themoviedb.org/t/p/w500/w9kR8qbmQ01HwnvK4alvnQ2ca0L.jpg','toy-story-5':'https://media.themoviedb.org/t/p/w500/sfQtVlIHljToOwYjhe21KPGzZWK.jpg',
    'dragon-1':'https://media.themoviedb.org/t/p/w500/53dsJ3oEnBhTBVMigWJ9tkA5bzJ.jpg','dragon-2':'https://media.themoviedb.org/t/p/w500/d13Uj86LdbDLrfDoHR5aDOFYyJC.jpg','dragon-3':'https://media.themoviedb.org/t/p/w500/xvx4Yhf0DVH8G4LzNISpMfFBDy2.jpg','kung-fu-panda-1':'https://media.themoviedb.org/t/p/w500/wWt4JYXTg5Wr3xBW2phBrMKgp3x.jpg','kung-fu-panda-2':'https://media.themoviedb.org/t/p/w500/mtqqD00vB4PGRt20gWtGqFhrkd0.jpg','kung-fu-panda-3':'https://media.themoviedb.org/t/p/w500/oajNi4Su39WAByHI6EONu8G8HYn.jpg','kung-fu-panda-4':'https://media.themoviedb.org/t/p/w500/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
    'zootopia-1':'https://media.themoviedb.org/t/p/w500/hlK0e0wAQ3VLuJcsfIYPvb4JVud.jpg','zootopia-2':'https://media.themoviedb.org/t/p/w500/oJ7g2CifqpStmoYQyaLQgEU32qO.jpg','inside-out-1':'https://media.themoviedb.org/t/p/w500/2H1TmgdfNtsKlU9jKdeNyYL5y8T.jpg','inside-out-2':'https://media.themoviedb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg','finding-nemo':'https://media.themoviedb.org/t/p/w500/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg','finding-dory':'https://media.themoviedb.org/t/p/w500/3UVe8NL1E2ZdUZ9EDlKGJY5UzE.jpg','incredibles-1':'https://media.themoviedb.org/t/p/w500/2LqaLgk4Z226KkgPJuiOQ58wvrm.jpg','incredibles-2':'https://media.themoviedb.org/t/p/w500/9lFKBtaVIhP7E2Pk0IY1CwTKTMZ.jpg',
    'monsters-inc':'https://media.themoviedb.org/t/p/w500/wFSpyMsp7H0ttERbxY7Trlv8xry.jpg','monsters-university':'https://media.themoviedb.org/t/p/w500/y7thwJ7z5Bplv6vwl6RI0yteaDD.jpg','cars-1':'https://media.themoviedb.org/t/p/w500/2Touk3m5gzsqr1VsvxypdyHY5ci.jpg','cars-2':'https://media.themoviedb.org/t/p/w500/okIz1HyxeVOMzYwwHUjH2pHi74I.jpg','cars-3':'https://media.themoviedb.org/t/p/w500/zg5RDxvIIAKsucjuU2EZJIHEIvz.jpg','frozen-1':'https://media.themoviedb.org/t/p/w500/itAKcobTYGpYT8Phwjd8c9hleTo.jpg','frozen-2':'https://media.themoviedb.org/t/p/w500/mINJaa34MtknCYl5AjtNJzWj8cD.jpg','wreck-it-ralph-1':'https://media.themoviedb.org/t/p/w500/nrEupcBwf4O1zihCM34NoXusZDq.jpg','wreck-it-ralph-2':'https://media.themoviedb.org/t/p/w500/iVCrhBcpDaHGvv7CLYbK6PuXZo1.jpg',
    'despicable-me-1':'https://media.themoviedb.org/t/p/w500/b1BT309QWjtFUlJPLmXmrcHOWEL.jpg','despicable-me-2':'https://media.themoviedb.org/t/p/w500/5Fh4NdoEnCjCK9wLjdJ9DJNFl2b.jpg','despicable-me-3':'https://media.themoviedb.org/t/p/w500/e72KCMHNkbZ6USRJmABeqwmaJ5n.jpg','despicable-me-4':'https://media.themoviedb.org/t/p/w500/wWba3TaojhK7NdycRhoQpsG0FaH.jpg','minions-1':'https://media.themoviedb.org/t/p/w500/4LwvU9SZc8QQzW1X1FAPhNbXnEU.jpg','minions-2':'https://media.themoviedb.org/t/p/w500/wKiOkZTN9lUUUNZLmtnwubZYONg.jpg','sing-1':'https://media.themoviedb.org/t/p/w500/rwopfpHqPCYBSgBuZwkaXXqHp14.jpg','sing-2':'https://media.themoviedb.org/t/p/w500/aWeKITRFbbwY8txG5uCj4rMCfSP.jpg',
    'pets-1':'https://media.themoviedb.org/t/p/w500/s9xg4V5EDKiphgIksVJ9gewBM11.jpg','pets-2':'https://media.themoviedb.org/t/p/w500/s9xg4V5EDKiphgIksVJ9gewBM11.jpg','hotel-transylvania-1':'https://media.themoviedb.org/t/p/w500/eJGvzGrsfe2sqTUPv5IwLWXjVuR.jpg','hotel-transylvania-2':'https://media.themoviedb.org/t/p/w500/3nFnrivNgipSKZ8LZJJbRSlAcTR.jpg','hotel-transylvania-3':'https://media.themoviedb.org/t/p/w500/lzE5BwGQea1nek7TPXUuC5AZ6rq.jpg','hotel-transylvania-4':'https://media.themoviedb.org/t/p/w500/teCy1egGQa0y8ULJvlrDHQKnxBL.jpg','croods-1':'https://media.themoviedb.org/t/p/w500/27zvjVOtOi5ped1HSlJKNsKXkFH.jpg','croods-2':'https://media.themoviedb.org/t/p/w500/tbVZ3Sq88dZaCANlUcewQuHQOaE.jpg',
    'trolls-1':'https://media.themoviedb.org/t/p/w500/9VlK2j0THZWzhQPq0W3Oc0IIdBB.jpg','trolls-2':'https://media.themoviedb.org/t/p/w500/7W0G3YECgDAfnuiHG91r8WqgIOe.jpg','trolls-3':'https://media.themoviedb.org/t/p/w500/3ySgD2xwasTHOK6R9bNZiEwKgYo.jpg','bad-guys-1':'https://media.themoviedb.org/t/p/w500/7qop80YfuO0BwJa1uXk1DXUUEwv.jpg','bad-guys-2':'https://media.themoviedb.org/t/p/w500/26oSPnq0ct59l07QOXZKyzsiRtN.jpg','peter-rabbit-1':'https://media.themoviedb.org/t/p/w500/lugOvdaNpbVGQK9TyMRDiUbLtY6.jpg','peter-rabbit-2':'https://media.themoviedb.org/t/p/w500/cycDz68DtTjJrDJ1fV8EBq2Xdpb.jpg',
    'sonic-1':'https://media.themoviedb.org/t/p/w500/aQvJ5WPzZgYVDrxLX4R6cLJCEaQ.jpg','sonic-2':'https://media.themoviedb.org/t/p/w500/6DrHO1jr3qVrViUO6s6kFiAGM7.jpg','sonic-3':'https://media.themoviedb.org/t/p/w500/d8Ryb8AunYAuycVKDp5HpdWPKgC.jpg','ice-age-1':'https://media.themoviedb.org/t/p/w500/gLhHHZUzeseRXShoDyC4VqLgsNv.jpg','ice-age-2':'https://media.themoviedb.org/t/p/w500/zDduhCHasKQ9YOTvlOreHem7Wbi.jpg','ice-age-3':'https://media.themoviedb.org/t/p/w500/cXOLaxcNjNAYmEx1trZxOTKhK3Q.jpg','ice-age-4':'https://media.themoviedb.org/t/p/w500/dfp1BZF7FxbBUyzHvMOI9t8NWDD.jpg','ice-age-5':'https://media.themoviedb.org/t/p/w500/tFzUkdhPOForVrEfvxydXfPLrZR.jpg','ice-age-buck-wild':'https://media.themoviedb.org/t/p/w500/9ginbMWmt9y7PIHW1c9hnbIVWPm.jpg'
  },
  // Genuine landscape backdrops; VidFast's poster toggle is not an image API.
  // These are TMDB backdrop images, keyed by the same numeric TMDB movie ID.
  tmdbBackdrops: {
    671:'https://image.tmdb.org/t/p/w1280/bfh9Z3Ghz4FOJAfLOAhmc3ccnHU.jpg',
    9502:'https://image.tmdb.org/t/p/w1280/364B8ohneoQSgIuYNRYZhjOCcEL.jpg',
    49444:'https://image.tmdb.org/t/p/w1280/7BdxZXbSkUiVeCRXKD3hi9KYeWm.jpg',
    140300:'https://image.tmdb.org/t/p/w1280/uT5G4fA7jKxlJNfwYPMm353f5AI.jpg'
  },
  cleanup() {
    this.generation++;
    this.disposeControls?.(); this.disposeControls=null;
    this.disposeSources?.(); this.disposeSources=null;
    this.disposeEmbedMessages?.();this.disposeEmbedMessages=null;
    this.player?._disposeShelf?.();
    this.disposeSubtitles?.(); this.disposeSubtitles = null;
    if (this.nativeStartTimer) { clearTimeout(this.nativeStartTimer); this.nativeStartTimer = null; }
    this.disposeAdSkip?.(); this.disposeAdSkip = null;
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (this.frame) { this.frame.src = 'about:blank'; this.frame.remove(); this.frame = null; }
    if (this.player) { this.player.pause(); this.player.removeAttribute('src'); this.player.load(); this.player = null; }
  },
  // These public provider endpoints use a TMDB numeric ID, never a scraped
  // filename or a fabricated .m3u8 URL. Keep this fallback list APK-only so
  // the deployed web site and R2 provider catalogue remain unchanged.
  androidTmdbProviders(){
    if(!/YQXYYAndroid\//i.test(navigator.userAgent||''))return [];
    return [
      {id:'android-111movies',name:'111Movies',mode:'embed',movieUrl:'https://111movies.net/movie/{tmdbId}',tvUrl:'https://111movies.net/tv/{tmdbId}/{seasonNumber}/{episodeNumber}'},
      {id:'android-vidfast',name:'VidFast',mode:'embed',movieUrl:'https://vidfast.vc/movie/{tmdbId}?autoPlay=false&sub=en',tvUrl:'https://vidfast.vc/tv/{tmdbId}/{seasonNumber}/{episodeNumber}?autoPlay=false&sub=en'},
      {id:'android-vidlink',name:'VidLink',mode:'embed',movieUrl:'https://vidlink.pro/movie/{tmdbId}',tvUrl:'https://vidlink.pro/tv/{tmdbId}/{seasonNumber}/{episodeNumber}'},
      {id:'android-vidsrc',name:'VidSrc',mode:'embed',movieUrl:'https://vidsrc.sh/embed/movie/{tmdbId}',tvUrl:'https://vidsrc.sh/embed/tv/{tmdbId}/{seasonNumber}/{episodeNumber}'},
      {id:'android-vidcore',name:'VidCore',mode:'embed',movieUrl:'https://vidcore.org/embed/movie/{tmdbId}',tvUrl:'https://vidcore.org/embed/tv/{tmdbId}/{seasonNumber}/{episodeNumber}'},
      {id:'android-vidrock',name:'VidRock',mode:'embed',movieUrl:'https://vidrock.net/movie/{tmdbId}',tvUrl:'https://vidrock.net/tv/{tmdbId}/{seasonNumber}/{episodeNumber}'},
      {id:'android-2embed',name:'2Embed',mode:'embed',movieUrl:'https://www.2embed.cc/embed/{tmdbId}',tvUrl:'https://www.2embed.cc/embedtv/{tmdbId}&s={seasonNumber}&e={episodeNumber}'},
      {id:'android-autoembed',name:'AutoEmbed',mode:'embed',movieUrl:'https://autoembed.me/movie/tmdb/{tmdbId}',tvUrl:'https://autoembed.me/tv/tmdb/{tmdbId}-{seasonNumber}-{episodeNumber}'}
    ];
  },
  providerSource(provider,metadata,automatic=false){
    const tmdb=Number(metadata.tmdb),tv=metadata.mediaType==='tv';
    if(!Number.isSafeInteger(tmdb)||tmdb<1)return null;
    const template=tv?provider.tvUrl:provider.movieUrl;
    if(provider.mode!=='embed'||typeof template!=='string')return null;
    const raw=template.replaceAll('{tmdbId}',String(tmdb)).replaceAll('{seasonNumber}',String(metadata.season||1)).replaceAll('{episodeNumber}',String(metadata.episode||1));
    try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||/[{}]/.test(raw))return null;
      if(automatic&&url.hostname==='player.vidmario.net')url.searchParams.delete('server');
      return {url:url.href,label:automatic?'第三方播放器（自动选线）':provider.name||'第三方线路',embedded:true};
    }catch{return null;}
  },
  async getLibrary(app) {
    const [catalog,settings,hub,configuredProviders,posters,dynamicRows,managedProviders]=await Promise.all([app.getJSON('data/movie-series.json'),app.getJSON('data/movie-playback.json',{refresh:true}),app.getJSON('data/movie-hub-catalog.json'),app.getJSON('data/movie-hub-providers.json',{refresh:true}),app.getJSON('data/movie-posters.json').catch(()=>({})),window.MovieLibrary?.published?.().catch(()=>[])||[],window.MovieSourceAdmin?.providers?.()||Promise.resolve([])]);
    const series = await Promise.all(catalog.map(async item => ({
      ...item,
      ...(await app.getJSON(`data/movies/${item.id}/movies.json`))
    })));
    const dynamicGroups=window.MovieLibrary?.asGroups?.(dynamicRows)||[],allSeries=[...dynamicGroups,...series],dynamicInfo=window.MovieLibrary?.info?.(dynamicRows)||new Map();
    const builtInProviders=this.androidTmdbProviders();
    const autoEmbedProvider={id:'autoembed',name:'AutoEmbed',mode:'embed',movieUrl:'https://autoembed.me/movie/tmdb/{tmdbId}',tvUrl:'https://autoembed.me/tv/tmdb/{tmdbId}-{seasonNumber}-{episodeNumber}'};
    const providers=[...managedProviders,...builtInProviders.filter(provider=>!managedProviders.some(extra=>extra.name===provider.name||extra.movieUrl===provider.movieUrl)),...configuredProviders.filter(provider=>![...managedProviders,...builtInProviders].some(extra=>extra.name===provider.name||extra.movieUrl===provider.movieUrl))];
    if(!providers.some(provider=>provider.name==='AutoEmbed'||provider.movieUrl===autoEmbedProvider.movieUrl))providers.push(autoEmbedProvider);
    const legacy=settings.mode==='legacy'&&settings.legacyPrimaryEnabled===true,ids=new Map([...hub.films,...dynamicRows.map(row=>({id:row.id,tmdbId:Number(row.tmdb_id)}))].map(film=>[film.id,film.tmdbId])),useVidMario=settings.mode==='vidmario',embedProviders=providers.filter(provider=>provider.mode==='embed');
    const playable=legacy?allSeries.flatMap(item=>item.sources||[]).filter(item=>this.playbackSource(item).url):allSeries.flatMap(group=>group.films.map(([id,title,titleZh,year])=>{
      const dynamic=dynamicInfo.get(id),tmdb=ids.get(id),validTmdb=Number.isSafeInteger(tmdb)&&tmdb>0,mediaType=dynamic?.media_type==='tv'?'tv':'movie',seasonNumber=Math.max(1,Number(dynamic?.season_number)||1),episodeNumber=Math.max(1,Number(dynamic?.episode_number)||1);
      if(useVidMario){
        const embeddedSources=validTmdb?embedProviders.map(provider=>this.providerSource(provider,{tmdb,mediaType,season:seasonNumber,episode:episodeNumber},true)).filter(Boolean):[];
        return {...(group.sources||[]).find(item=>item.id===id),id,title,titleZh,year,cover:dynamic?.poster_url||posters[id]||'',description:dynamic?.overview||'',playerMode:'embed-fallback',embedUrl:embeddedSources[0]?.url||'',sourceLabel:embeddedSources[0]?.label||'嵌入播放源',backupSources:[]};
      }
      return {...(group.sources||[]).find(item=>item.id===id),id,title,titleZh,year,cover:dynamic?.poster_url||posters[id]||'',description:dynamic?.overview||'',playerMode:'dulo',embedUrl:validTmdb?'https://dulo.mov/watch/movie/'+tmdb:'',sourceLabel:'Dulo 播放器'};
    })).filter(item=>item.embedUrl);
    for(const movie of playable){
      const source=allSeries.flatMap(group=>group.sources||[]).find(item=>item.id===movie.id)||movie;
      const metadata=dynamicInfo.get(movie.id)||source;
      const tmdb=Number(ids.get(movie.id)||metadata.tmdbId||metadata.tmdb_id);
      const tv=(metadata.media_type||metadata.mediaType)==='tv';
      const season=Number(metadata.season_number||metadata.seasonNumber||1),episode=Number(metadata.episode_number||metadata.episodeNumber||1);
      const apiUrl=Number.isSafeInteger(tmdb)&&tmdb>0&&(!tv||(Number.isSafeInteger(season)&&season>0&&Number.isSafeInteger(episode)&&episode>0))
        ? `https://api.obj2.top/hls/${tv?`tv/${tmdb}/${season}/${episode}`:`movie/${tmdb}`}/master.m3u8` : '';
      const savedSources=Array.isArray(metadata.playback_sources)?metadata.playback_sources:[];
      const providerSources=apiUrl?providers.map(provider=>this.providerSource(provider,{tmdb,mediaType:tv?'tv':'movie',season,episode})).filter(Boolean):[];
      movie.tmdbId=tmdb;
      movie.mediaType=tv?'tv':'movie';
      movie.tmdbTitle=String(metadata.title||source.title||movie.title||'').trim();
      movie.backdropUrl=metadata.backdropUrl||metadata.backdrop_url||source.backdropUrl||source.backdrop_url||this.tmdbBackdrops[tmdb]||'';
      movie.embeddedSources=[...savedSources.filter(source=>source.kind==='embed'),...providerSources].filter((source,index,all)=>{try{const url=new URL(source.url);return url.protocol==='https:'&&!url.username&&!url.password&&source.url!==movie.embedUrl&&all.findIndex(item=>item.url===source.url)===index;}catch{return false;}});
      const preferredTvSource=tv?savedSources.filter(source=>source.kind==='direct'&&source.label==='本集播放地址'):[];
      const candidates=[...preferredTvSource,{url:apiUrl,label:'直链播放'},...savedSources.filter(source=>source.kind==='direct'&&!preferredTvSource.includes(source)),{url:source.fullHlsUrl||source.hlsUrl,label:'原有备用直链'},...(source.backupSources||[]),{url:source.backupHlsUrl,label:'备用直链'}];
      movie.directSources=candidates.filter((item,index)=>{
        try{const url=new URL(item.url);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password&&/\.(m3u8|mp4)$/i.test(url.pathname)&&candidates.findIndex(other=>other.url===item.url)===index;}catch{return false;}
      }).map((item,index)=>({...item,label:item.label||`备用直链 ${index}`}));
    }
    return { series:allSeries, playable, playableById: new Map(playable.map(item => [item.id, item])) };
  },
  stars(rating) { return '★'.repeat(rating) + '☆'.repeat(5 - rating); },
  backupSources(movie) {
    if(['dulo','dulo-direct','catalog-direct'].includes(movie.playerMode))return [];
    const sources = [...(movie.backupSources || [])];
    if (movie.backupHlsUrl) sources.push({url: movie.backupHlsUrl});
    return sources.filter((item, index) => {
      try { const url = new URL(item.url); return /^https?:$/.test(url.protocol) && !url.username && !url.password && item.url !== movie.hlsUrl && sources.findIndex(other => other.url === item.url) === index; }
      catch { return false; }
    });
  },
  playbackSource(movie, backup = false) {
    const selected = backup && typeof backup === 'object' ? backup : null;
    const embed = selected ? selected.embedded && selected.url : !backup && movie.embedUrl;
    const raw = String(selected ? selected.url : embed || (backup ? movie.backupHlsUrl : movie.hlsUrl) || '').trim();
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return {url: '', embedded: false};
      // Older catalogue entries stored parser HTML pages in hlsUrl.
      const parserPage = /\/parse\/?$/i.test(url.pathname) && url.searchParams.has('url');
      return {url: window.SourceLabCore?.duloMediaUrl?.(url.href) || url.href, embedded: !!embed || parserPage};
    } catch { return {url: '', embedded: false}; }
  },
  mediaUrl(sourceUrl) {
    // Compatibility fallback for browsers that cannot play HLS natively.
    // HLS.js needs same-origin playlists and assets when upstream lacks CORS.
    try {
      const migrated=window.SourceLabCore?.duloMediaUrl?.(sourceUrl);
      if(migrated){const u=new URL(migrated);return '/_movie-media/bluevelvet/'+u.pathname.slice('/play/'.length)+u.search;}
      const url = new URL(sourceUrl);
      if (url.protocol === 'https:' && url.hostname === 'zcdn.bluevelvet.space' && !url.port && !url.username && !url.password && url.pathname.startsWith('/play/')) {
        return '/_movie-media/bluevelvet/' + url.pathname.slice('/play/'.length) + url.search;
      }
    } catch {}
    return sourceUrl;
  },
  escape(app, value) { return app.escapeHtml(String(value || '')); },
  poster(app, item, label, className='movie-poster') {
    const e = value => this.escape(app, value);
    const cover = item.cover || this.filmCovers[item.id] || this.seriesCovers[item.id];
    if (cover) return `<div class="${className}"><img src="${e(cover)}" alt="${e(label)}海报" loading="lazy" referrerpolicy="no-referrer"></div>`;
    return `<div class="${className} movie-poster-fallback" aria-label="${e(label)}待补充官方海报"><span>🎬</span><strong>${e(label)}</strong><small>Official poster coming soon</small></div>`;
  },
  seriesCard(app, series, playableById) {
    return window.MediaShelf.card(app,window.MediaShelf.movieSeries(series));
  },
  movieCard(app, series, film, playableById) {
    return window.MediaShelf.card(app,window.MediaShelf.movieFilm(series,film,playableById));
  },
  async renderList(app, query='', level='all') {
    return window.MediaShelf.render(app,'movies',{query,level});
  },
  async renderSeries(app, id) {
    const generation = this.generation;
    const { series, playableById } = await this.getLibrary(app);
    if (generation !== this.generation) return;
    const group = series.find(item => item.id === id);
    if (!group) { app.el().innerHTML = '<div class="empty">系列不存在。<p><a class="btn" href="#/movies">返回光影课堂</a></p></div>'; return; }
    const e = value => this.escape(app, value);
    app.el().innerHTML = window.MediaShelf.nav('movies') + `<div class="breadcrumb"><a href="#/movies">光影课堂</a> › ${e(group.titleZh)}</div><section class="media-catalog"><div class="book-grid">${group.films.map(film => this.movieCard(app, group, film, playableById)).join('')}</div></section>`;
    window.MediaShelf.bindCards(app);
  },
  async renderWatch(app, id, sourceChoice = 'primary', transportChoice = 'auto') {
    const generation = this.generation;
    const { series, playableById } = await this.getLibrary(app);
    if (generation !== this.generation) return;
    let movie = playableById.get(id);
    const group = series.find(item => item.films.some(([filmId]) => filmId === id));
    if (!movie || !group) { app.el().innerHTML = '<div class="empty">这部影片暂未添加授权播放源。<p><a class="btn" href="#/movies">返回光影课堂</a></p></div>'; return; }
    const directSources=movie.directSources||[];
    const embeddedAlternatives=movie.embeddedSources||[];
    const providerIndex=/^provider-\d+$/.test(sourceChoice)?Number(sourceChoice.slice(9)):-1;
    if(transportChoice==='embed'&&embeddedAlternatives[providerIndex])movie={...movie,embedUrl:embeddedAlternatives[providerIndex].url,sourceLabel:embeddedAlternatives[providerIndex].label,backupSources:[],playerMode:'embed-fallback'};
    const embedSources=(movie.backupSources||[]).map((source,index)=>({...source,index})).filter(source=>source.embedded);
    const directIndex=/^direct-\d+$/.test(sourceChoice)?Number(sourceChoice.slice(7)):0;
    const direct=transportChoice!=='embed'&&transportChoice!=='dulo-direct'&&directSources[directIndex];
    if(direct)movie={...movie,embedUrl:'',hlsUrl:direct.url,backupHlsUrl:'',backupSources:[],playerMode:'catalog-direct',sourceLabel:direct.label};
    if(transportChoice==='dulo-direct'){
      app.el().innerHTML='<section class="empty"><p role="status">正在获取本片当前可用线路…</p></section>';
      try{
        const response=await fetch('/.netlify/functions/movie-stream?id='+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await response.json();
        if(generation!==this.generation)return;
        if(!response.ok||!data.url)throw Error(data.error||'暂未获取到播放线路');
        movie={...movie,embedUrl:'',hlsUrl:data.url,playerMode:'dulo-direct',sourceLabel:'Dulo 实时直链'};
      }catch(error){
        if(generation!==this.generation)return;
        app.el().innerHTML=`<section class="empty"><h2>暂未获取到影片线路</h2><p>${this.escape(app,error.message)}</p><button type="button" class="btn" id="movieResolveRetry">重试获取</button> <button type="button" class="btn secondary" id="movieReturnDulo">使用 Dulo 播放器</button></section>`;
        document.getElementById('movieResolveRetry').onclick=()=>{this.cleanup();this.renderWatch(app,id,'primary','dulo-direct');};
        document.getElementById('movieReturnDulo').onclick=()=>{this.cleanup();this.renderWatch(app,id);};return;
      }
    }
    const backups = this.backupSources(movie);
    const hasBackup = backups.length > 0;
    const index = sourceChoice === 'backup' ? 0 : /^backup-\d+$/.test(sourceChoice) ? Number(sourceChoice.slice(7)) : -1;
    const usingBackup = index >= 0 && index < backups.length;
    const selectedChoice = direct ? `direct-${directIndex}` : usingBackup ? (index === 0 ? 'backup' : `backup-${index}`) : 'primary';
    const {url: sourceUrl, embedded} = this.playbackSource(movie, usingBackup ? backups[index] : false);
    const e = value => this.escape(app, value);
    const sourceControl = '';
    const directLink = !embedded && this.mediaUrl(sourceUrl) !== sourceUrl ? `<a class="btn secondary" href="${e(sourceUrl)}" target="_blank" rel="noopener noreferrer">直接打开播放</a>` : '';
    const subtitleTrack = movie.subtitleUrl ? `<track kind="subtitles" src="${e(movie.subtitleUrl)}" srclang="${e(movie.subtitleLang || 'en')}" label="${e(movie.subtitleLabel || 'English')}" default>` : '';
    app.el().innerHTML = `<div class="movie-watch-frame"><video controls playsinline preload="metadata" aria-label="${e(movie.titleZh)}">${subtitleTrack}</video></div><div class="movie-player-status" id="moviePlayerStatus" role="status" aria-live="polite"></div><div class="movie-section-heading"><h2>同系列影片</h2></div><div class="book-grid media-related-grid">${group.films.filter(([filmId]) => filmId !== id).map(film => this.movieCard(app, group, film, playableById)).join('')}</div>`;
    const player = app.el().querySelector('video');
    const lines=document.createElement('div');lines.className='movie-source-menu';lines.setAttribute('role','menu');lines.setAttribute('aria-label','播放源');lines.hidden=true;
    const heading=document.createElement('div');heading.className='movie-source-heading';heading.innerHTML='<strong>播放源</strong><button type="button" aria-label="关闭播放源">×</button>';lines.append(heading);
    directSources.forEach((source,n)=>{
      const button=document.createElement('button');button.type='button';button.className='btn secondary';button.textContent=source.label;
      button.setAttribute('aria-pressed',String(!!direct&&directIndex===n));
      button.onclick=()=>{this.cleanup();this.renderWatch(app,id,`direct-${n}`);};lines.append(button);
    });
    const embedButton=document.createElement('button');embedButton.type='button';embedButton.className='btn secondary';embedButton.textContent='第三方播放器';embedButton.setAttribute('aria-pressed',String(embedded&&!usingBackup&&providerIndex<0));
    embedButton.onclick=()=>{this.cleanup();this.renderWatch(app,id,'primary','embed');};
    const primaryDirect=lines.querySelector(':scope > button');
    (primaryDirect||heading).after(embedButton);
    embedSources.forEach(source=>{const button=document.createElement('button');button.type='button';button.textContent=source.label||`第三方备用 ${source.index+1}`;button.setAttribute('aria-pressed',String(embedded&&index===source.index));button.onclick=()=>{this.cleanup();this.renderWatch(app,id,source.index===0?'backup':`backup-${source.index}`,'embed');};lines.append(button);});
    embeddedAlternatives.forEach((source,n)=>{const button=document.createElement('button');button.type='button';button.textContent=source.label||`第三方线路 ${n+1}`;button.setAttribute('aria-pressed',String(embedded&&providerIndex===n));button.onclick=()=>{this.cleanup();this.renderWatch(app,id,`provider-${n}`,'embed');};lines.append(button);});
    window.MediaShelf.bindCards(app);
    const report = (message, failed=false) => { if (generation !== this.generation) return; const status = document.getElementById('moviePlayerStatus'); if (status) { status.textContent = message; status.classList.toggle('failed', failed); } };
    if (embedded) {
      const frame = document.createElement('iframe');
      frame.title = `${movie.titleZh} · 本站嵌入播放器`;
      frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'no-referrer';
      // Do not sandbox this iframe: the verified 111Movies test player refuses sandboxed embedding.
      const stage=app.el().querySelector('.movie-watch-frame');
      stage.replaceChildren(frame);
      this.attachSourceMenu(stage,lines,true);
      this.frame=frame;
      const nextEmbeddedSource=()=>{
        if(generation!==this.generation)return;
        if(hasBackup&&index+1<backups.length){
          const next=index+1,choice=next===0?'backup':`backup-${next}`;
          report(`当前嵌入线路未能加载，正在自动尝试 ${backups[next].label||'下一条备用线路'}…`);
          this.cleanup();this.renderWatch(app,id,choice,'embed').catch(()=>{});
        }else if(providerIndex+1<embeddedAlternatives.length){
          const next=providerIndex+1;this.cleanup();this.renderWatch(app,id,`provider-${next}`,'embed').catch(()=>{});
        }else{
          report('第三方线路未能加载，请使用画面内的“播放源”切换其他线路。',true);
        }
      };
      const onMessage=event=>{
        if(generation!==this.generation||event.source!==frame.contentWindow||event.origin!==new URL(sourceUrl).origin||event.data?.type!=='PLAYER_EVENT')return;
        const state=event.data.data?.event;
        if(state==='unavailable'||state==='error'){
          report('第三方报告本片暂不可用，请尝试备用线路。',true);
          if((hasBackup&&index+1<backups.length)||providerIndex+1<embeddedAlternatives.length)nextEmbeddedSource();
        }
        if(['play','playing','timeupdate'].includes(state))report('第三方播放器正在播放。');
      };
      window.addEventListener('message',onMessage);this.disposeEmbedMessages=()=>window.removeEventListener('message',onMessage);
      let frameLoaded=false;
      frame.addEventListener('load',()=>{
        if(generation!==this.generation)return;
        frameLoaded=true;
        if(this.nativeStartTimer){clearTimeout(this.nativeStartTimer);this.nativeStartTimer=null;}
        report(`${usingBackup?(backups[index].label||'备用线路'):movie.sourceLabel}页面已打开，请在画面内播放。若持续停在获取视频，请使用“播放源”切换线路。`);
        if(generation===this.generation)window.MediaShelf.record('film-'+id,{href:'#/movie/'+id});
      });
      frame.addEventListener('error',nextEmbeddedSource);
      report('正在加载本站嵌入播放器…');
      this.nativeStartTimer=setTimeout(()=>{if(generation===this.generation&&!frameLoaded)nextEmbeddedSource();},18000);
      frame.src=sourceUrl;
      return;
    }
    this.player = player;
    window.MediaShelf.bindPlayer(player,'film-'+id,{href:'#/movie/'+id},{resume:!usingBackup});
    this.disposeSubtitles = window.MovieSubtitles?.mount(app.el(), player, movie, () => this.hls, app, sourceUrl);
    this.attachMovieControls(app,player,movie,group);
    this.attachSourceMenu(player.closest('.movie-watch-frame'),lines,false);
    this.attachDirectPoster(player,movie);
    const mediaUrl = movie.playerMode==='dulo-direct'?sourceUrl:this.mediaUrl(sourceUrl);
    const native = player.canPlayType('application/vnd.apple.mpegurl');
    const safari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/i.test(navigator.userAgent);
    // Native media requests do not need fetch/XHR CORS access. On supported
    // browsers keep these sources direct, avoiding the overseas relay hop.
    const directNative = !!native && mediaUrl !== sourceUrl && transportChoice !== 'relay';
    const clearNativeTimer = () => {
      if (generation !== this.generation) return;
      if (this.nativeStartTimer) { clearTimeout(this.nativeStartTimer); this.nativeStartTimer = null; }
    };
    const nextAfterDirectFailure = () => {
      if (generation !== this.generation || !player.isConnected) return;
      // One bad direct source must not strand the user. Continue through
      // saved direct URLs, then the TMDB iframe providers. Do not loop.
      const nextIndex=directIndex+1;
      if (direct && nextIndex<directSources.length) {
        report('当前直链不可用，正在尝试下一条直链…');
        this.cleanup();
        this.renderWatch(app,id,'direct-'+nextIndex).catch(()=>{});
      } else if (embeddedAlternatives.length) {
        report('直链播放失败，正在尝试 TMDB 备用播放器…');
        this.cleanup();
        this.renderWatch(app,id,'provider-0','embed').catch(()=>{});
      } else report('所有已配置播放线路均不可用，请稍后重试。',true);
    };
    const fallback = () => {
      if (generation !== this.generation || !player.isConnected) return;
      this.cleanup();
      this.renderWatch(app, id, selectedChoice, 'relay').catch(() => {});
    };
    player.addEventListener('loadedmetadata', () => {
      clearNativeTimer();
      report(usingBackup ? '备用片源已就绪，点击播放开始观看。' : '影片已就绪，点击播放开始观看。');
    });
    player.addEventListener('playing', () => report('正在播放 · 可使用播放器控制倍速、音量和全屏。'));
    player.addEventListener('waiting', () => { if (!player.paused) report(directLink ? '正在缓冲，请稍候；若持续转圈，可点击“直接打开播放”。' : '正在缓冲，请稍候…'); });
    player.addEventListener('error', () => {
      if (directNative) { fallback(); return; }
      report('当前视频无法加载，尝试备用线路…',true);
      if(movie.playerMode!=='dulo-direct')nextAfterDirectFailure();
    });
    const useNative = url => { player.src = url; this.disposeAdSkip = window.DyttAdSkip?.attach(player, sourceUrl); };
    if(/\.mp4(?:$|[?#])/i.test(sourceUrl)){useNative(sourceUrl);return;}
    if (directNative) {
      report('正在直连加载影片，请稍候…');
      this.nativeStartTimer = setTimeout(fallback, 15000);
      useNative(sourceUrl);
      return;
    }
    // Retain the previous playback path for other upstreams and old backups.
    if (native && (safari || movie.playerMode==='dulo-direct')) { useNative(mediaUrl); return; }
    try {
      if (!window.Hls) {
        if (!this.libraryPromise) this.libraryPromise = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'assets/vendor/hlsjs-1.5.20/hls.min.js'; script.onload = resolve; script.onerror = () => reject(new Error('播放器组件加载失败')); document.head.append(script); }).catch(error => { this.libraryPromise = null; throw error; });
        await this.libraryPromise;
      }
      if (generation !== this.generation || !player.isConnected) return;
      if (!window.Hls?.isSupported()) {
        if (native) { useNative(mediaUrl); return; }
        throw new Error('当前浏览器不支持 HLS 播放');
      }
      const hls = new window.Hls(movie.playerMode==='dulo-direct'?{renderTextTracksNatively:false,xhrSetup:(xhr,url)=>{try{const source=new URL(sourceUrl),target=new URL(url,sourceUrl),token=source.searchParams.get('_rb'),prefix=source.pathname.slice(0,source.pathname.lastIndexOf('/')+1);if(token&&target.origin===source.origin&&target.pathname.startsWith(prefix)){target.searchParams.set('_rb',token);if(target.href!==url)xhr.open('GET',target.href,true);}}catch{}}}:{renderTextTracksNatively:false}); this.hls = hls;
      hls.on(window.Hls.Events.ERROR, (_event, data) => { if (data.fatal) { hls.stopLoad(); report('当前视频线路加载失败，尝试备用线路…',true); if(movie.playerMode!=='dulo-direct')nextAfterDirectFailure(); } });
      this.disposeAdSkip = window.DyttAdSkip?.attach(player, sourceUrl, hls);
      hls.loadSource(mediaUrl); hls.attachMedia(player);
    } catch (error) { report(error.message + '，请点击重新加载。', true); }
  },
  attachSourceMenu(stage,menu,embedded){
    const controller=new AbortController(),buttons=[];
    const toggle=()=>{menu.hidden=!menu.hidden;buttons.forEach(b=>b.setAttribute('aria-expanded',String(!menu.hidden)));stage.classList.add('subtitle-settings-visible');if(!menu.hidden){stage.classList.remove('subtitle-settings-open');stage.querySelector('.subtitle-settings-trigger')?.setAttribute('aria-expanded','false');}};
    const close=()=>{menu.hidden=true;buttons.forEach(b=>b.setAttribute('aria-expanded','false'));};
    const hosts=embedded?[stage]:[stage.querySelector('.sf-desktop-player-controls'),stage.closest('.sf-full-movie-player')?.querySelector('.sf-lesson-toolbar')].filter(Boolean);
    for(const host of hosts){const button=document.createElement('button');button.type='button';button.className='movie-source-trigger';button.setAttribute('aria-label','播放源');button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.title='播放源';button.innerHTML=host.classList.contains('sf-lesson-toolbar')?'<span>▤</span><small>播放源</small>':'▤';button.onclick=toggle;host.append(button);buttons.push(button);}
    stage.append(menu);menu.querySelector('[aria-label="关闭播放源"]').onclick=close;
    document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!buttons.some(b=>b.contains(event.target)))close();},{signal:controller.signal});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')close();},{signal:controller.signal});
    this.disposeSources=()=>controller.abort();
  },

  // VidFast-style loading artwork for the first-party HLS player. This is
  // presentation only: the selected media URL, HLS instance and controls are
  // unchanged. Use known cover art rather than downloading frames from a stream.
  attachDirectPoster(player,movie){
    const stage=player.closest('.movie-watch-frame');
    if(!stage)return;
    const showArtwork=raw=>{
      if(!stage.isConnected || !player.isConnected || !player.paused)return;
      let url;
      try{
        url=new URL(String(raw||'').trim());
        if(url.protocol!=='https:'||url.username||url.password)return;
      }catch{return;}
      player.poster=url.href;
      stage.querySelector('.movie-start-poster')?.remove();
      const overlay=document.createElement('div');overlay.className='movie-start-poster';
      const image=document.createElement('img');image.className='movie-start-artwork';
      image.src=url.href;image.alt='';image.decoding='async';
      image.onerror=()=>{overlay.remove();player.removeAttribute('poster');};
      const shade=document.createElement('div');shade.className='movie-start-shade';
      const title=document.createElement('strong');title.className='movie-start-title';
      title.textContent=movie.titleZh||movie.title||'';
      const start=document.createElement('button');start.type='button';
      start.className='movie-start-play';start.textContent='▶';
      start.setAttribute('aria-label','播放'+(movie.titleZh||movie.title||'影片'));
      start.onclick=()=>{player.play()?.catch?.(()=>{});};
      overlay.append(image,shade,title,start);stage.append(overlay);
      const hide=()=>overlay.remove();
      player.addEventListener('play',hide,{once:true});
      player.addEventListener('playing',hide,{once:true});
    };
    // Never stretch a vertical catalogue poster into a 16:9 video frame.
    // Explicit editorial background takes precedence. The old fixed image
    // mappings are only fallback artwork; ALL TMDB titles are auto-looked-up.
    const explicit=movie.backdropUrl||movie.backdrop_url;
    if(explicit){showArtwork(explicit);return;}
    const fallback=this.tmdbBackdrops[movie.tmdbId]||'';
    const id=Number(movie.tmdbId),type=movie.mediaType==='tv'?'tv':'movie';
    if(!Number.isSafeInteger(id)||id<1){if(fallback)showArtwork(fallback);return;}
    const key=type+':'+id;
    const cacheKey='sf-movie-backdrop-v1-'+key;
    const cached=this.backdropMemory.get(key);
    if(cached?.url && cached.expires>Date.now()){showArtwork(cached.url);return;}
    try{
      const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(saved?.expires>Date.now() && /^https:\/\/image\.tmdb\.org\/t\/p\/w1280\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(saved.url||'')){
        this.backdropMemory.set(key,saved);showArtwork(saved.url);return;
      }
    }catch{}
    // Avoid a blank first view while refreshing legacy backgrounds.
    if(fallback)showArtwork(fallback);
    const title=String(movie.tmdbTitle||movie.title||'').trim().slice(0,160);
    const existing=this.backdropRequests.get(key);
    const request=existing||fetch('/.netlify/functions/movie-backdrop?'+new URLSearchParams({
      id:String(id),type,title
    }),{cache:'force-cache',signal:AbortSignal.timeout(10000)})
      .then(response=>response.ok?response.json():null)
      .then(data=>{
        // Accept only the TMDB image CDN, never an arbitrary remote image host.
        const value=String(data?.url||'');
        if(!/^https:\/\/image\.tmdb\.org\/t\/p\/w1280\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(value))return null;
        const entry={url:value,expires:Date.now()+14*24*60*60*1000};
        this.backdropMemory.set(key,entry);
        try{localStorage.setItem(cacheKey,JSON.stringify(entry));}catch{}
        return value;
      }).catch(()=>null).finally(()=>this.backdropRequests.delete(key));
    if(!existing)this.backdropRequests.set(key,request);
    request.then(url=>{if(url)showArtwork(url);});
  },
  attachMovieControls(app,player,movie,group){
    const stage=player.closest('.movie-watch-frame');
    const panel=document.createElement('section');panel.className='direct-video-panel sf-movie-lesson-player sf-full-movie-player';
    stage.before(panel);panel.append(stage);stage.classList.add('video-wrap');
    const bar=document.createElement('div');bar.className='sf-lesson-toolbar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','电影播放操作');
    const actions=[['prev','⏮','上一部'],['play','▶','播放'],['next','⏭','下一部'],['speed','⚡','1x'],['quiz','📖','分集学习'],['captions','CC','字幕'],['mute','🔊','声音'],['fullscreen','⛶','全屏']];
    bar.innerHTML=actions.map(([act,icon,label])=>`<button type="button" data-act="${act}"><span>${icon}</span><small>${label}</small></button>`).join('');panel.append(bar);
    const button=act=>bar.querySelector(`[data-act="${act}"]`);
    const films=group.films,index=films.findIndex(([id])=>id===movie.id);
    for(const [act,delta] of [['prev',-1],['next',1]]){const target=films[index+delta];button(act).disabled=!target;button(act).onclick=()=>{if(target){this.cleanup();location.hash='#/movie/'+target[0];}};}
    if(group.dynamicTv){
      panel.classList.add('sf-tv-player');
      panel._sfMovieNav={
        prev:!button('prev').disabled?()=>button('prev').click():null,
        next:!button('next').disabled?()=>button('next').click():null
      };
    }
    button('play').onclick=()=>player.paused?player.play().catch(()=>{}):player.pause();
    const update=()=>{button('play').querySelector('span').textContent=player.paused?'▶':'⏸';button('play').querySelector('small').textContent=player.paused?'播放':'暂停';button('speed').querySelector('small').textContent=player.playbackRate+'x';button('mute').querySelector('span').textContent=player.muted?'🔇':'🔊';};
    for(const event of ['play','pause','ratechange','volumechange'])player.addEventListener(event,update);
    button('speed').onclick=()=>{const speeds=[1,1.25,1.5,2,.75];player.playbackRate=speeds[(speeds.indexOf(player.playbackRate)+1)%speeds.length];};
    button('mute').onclick=()=>{player.muted=!player.muted;};
    button('quiz').disabled=!movie.studyCourse?.seriesId;button('quiz').onclick=()=>{this.cleanup();location.hash='#/series/'+movie.studyCourse.seriesId;};
    button('captions').onclick=()=>stage.querySelector('.subtitle-settings-trigger,.movie-cc-button')?.click();
    let timer;
    const show=()=>{clearTimeout(timer);stage.classList.add('subtitle-settings-visible');};
    const hideLater=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!stage.matches(':focus-within')&&!stage.classList.contains('subtitle-settings-open')&&!stage.querySelector('.movie-source-menu:not([hidden])'))stage.classList.remove('subtitle-settings-visible');},2200);};
    for(const event of ['pointerenter','pointermove','pointerdown','keydown'])stage.addEventListener(event,()=>{show();hideLater();});
    stage.addEventListener('pointerleave',hideLater);
    window.SFCaptionFullscreen?.attach({stage:panel,player,trigger:button('fullscreen'),showControls:show});
    if(!window.SFCaptionFullscreen)button('fullscreen').onclick=()=>panel.requestFullscreen?.().catch(()=>{});
    window.SFDesktopPlayer?.attach({stage,player,showControls:show,hideControlsLater:hideLater,lesson:{seriesId:'full-movie',ep:{episodeId:1}}});
    // Full movies use the in-picture controls on touch devices as well.
    if(stage.querySelector('.sf-desktop-player-controls')){player.controls=false;player.addEventListener('pause',()=>{player.controls=false;});}
    for(const act of ['captions','settings']){const control=stage.querySelector(`[data-desktop-act="${act}"]`);if(control)control.onclick=()=>{if(act==='captions'&&stage.querySelector('.subtitle-toggle'))stage.querySelector('.subtitle-toggle').click();else button('captions').click();};}
    const study=stage.querySelector('[data-desktop-act="quiz"]');if(study){study.title='分集学习';study.setAttribute('aria-label','分集学习');study.disabled=button('quiz').disabled;}
    const fullscreenControl=stage.querySelector('[data-desktop-act="fullscreen"]');
    if(fullscreenControl)fullscreenControl.onclick=()=>button('fullscreen').click();
    // Do not leave a lesson toolbar in the full-film DOM: fullscreen styles
    // can reveal hidden lesson controls on both phone orientations.
    bar.remove();
    this.disposeControls=()=>clearTimeout(timer);update();
  }
};
