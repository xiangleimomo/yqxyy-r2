(() => {
  "use strict";
  if (window.__tmdbOneClickV2) return;
  window.__tmdbOneClickV2 = true;
  const validHost = new Set(["www.themoviedb.org", "themoviedb.org"]);
  const decode = (href) => {
    try {
      const u = new URL(href, location.href);
      const m = u.pathname.match(/^\/(movie|tv)\/([1-9]\d*)(?:[-/]|$)/);
      return validHost.has(u.hostname) && m ? {type:m[1],id:m[2]} : null;
    } catch { return null; }
  };
  let overlay=null,frame=null,previousFocus=null,previousPath="";
  const el=(tag,klass,text)=>{
    const e=document.createElement(tag);
    if(klass)e.className=klass;
    if(text!==undefined)e.textContent=text;
    return e;
  };
  const close=()=>{
    if(!overlay)return;
    if(frame)frame.src="about:blank";
    overlay.remove();overlay=null;frame=null;
    document.documentElement.classList.remove("tmdboc-open");
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  };
  const open=(item,title)=>{
    close();previousFocus=document.activeElement;
    overlay=el("div","tmdboc-overlay");
    overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");
    overlay.setAttribute("aria-label","TMDB OneClick Player");
    const panel=el("div","tmdboc-panel");
    const head=el("header","tmdboc-head");
    const heading=el("strong","tmdboc-heading",title||((item.type==="movie"?"电影":"电视剧")+" · TMDB "+item.id));
    const id=el("span","tmdboc-id","TMDB "+item.id);
    const x=el("button","tmdboc-close","✕ 关闭");
    x.type="button";x.addEventListener("click",close);
    head.append(heading,id,x);
    frame=el("iframe","tmdboc-frame");
    frame.title="yqxyy HLS 播放器";
    frame.allow="autoplay; fullscreen; picture-in-picture";
    frame.allowFullscreen=true;
    const url=new URL(chrome.runtime.getURL("player.html"));
    url.searchParams.set("type",item.type);
    url.searchParams.set("id",item.id);
    if(title)url.searchParams.set("title",title.slice(0,120));
    frame.src=url.href;
    panel.append(head,frame);
    overlay.append(panel);
    overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
    document.documentElement.classList.add("tmdboc-open");
    (document.body||document.documentElement).append(overlay);
    x.focus();
  };
  document.addEventListener("click",e=>{
    if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
    const node=e.target instanceof Element?e.target:null;
    if(!node||node.closest(".tmdboc-overlay,.tmdboc-detail-trigger"))return;
    const img=node.closest("img,picture,.tmdboc-indicator");
    const anchor=img?.closest("a[href]");
    if(!anchor)return;
    const item=decode(anchor.href);
    if(!item)return;
    e.preventDefault();e.stopImmediatePropagation();
    const poster=anchor.querySelector("img");
    const title=poster?.alt||anchor.getAttribute("aria-label")||"";
    open(item,title);
  },true);
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&overlay){e.preventDefault();close();}
  },true);
  let task=null;
  const scan=()=>{
    if(!document.body)return;
    const current=decode(location.href),key=current?current.type+":"+current.id:"";
    const prior=document.getElementById("tmdboc-detail-trigger");
    if(!current)prior?.remove();
    else if(prior?.dataset.key!==key){
      prior?.remove();
      const b=el("button","tmdboc-detail-trigger","▶ 播放本片");
      b.id="tmdboc-detail-trigger";b.dataset.key=key;b.type="button";
      b.addEventListener("click",()=>open(current,document.querySelector("h2 a,h2")?.textContent?.trim()||""));
      document.body.append(b);
    }
    document.querySelectorAll("a[href]").forEach(a=>{
      const item=decode(a.href);
      if(!item||a.dataset.tmdbocV2||!a.querySelector("img"))return;
      a.dataset.tmdbocV2="1";
      a.classList.add("tmdboc-poster");
      if(getComputedStyle(a).position==="static")a.style.position="relative";
      const tag=el("span","tmdboc-indicator","▶");
      tag.setAttribute("aria-hidden","true");a.append(tag);
    });
  };
  const observer=new MutationObserver(()=>{
    if(task)return;
    task=setTimeout(()=>{
      task=null;
      if(location.href!==previousPath){
        previousPath=location.href;
        if(overlay)close();
      }
      scan();
    },350);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  previousPath=location.href;scan();
})();