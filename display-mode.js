(() => {
  "use strict";
  if (window.__tmdbOneClickModesV3) return;
  window.__tmdbOneClickModesV3 = true;
  const modes = {original:"原版",simple:"精简",poster:"海报"};
  const root = document.documentElement;
  let mode="simple", toolbar=null, scanTimer=0;
  function apply(next, save=false) {
    mode=Object.hasOwn(modes,next)?next:"simple";
    root.dataset.tmdbocMode=mode;
    if(toolbar){
      const trigger=toolbar.querySelector(".tmdboc-mode-toggle");
      if(trigger)trigger.textContent="影仓 · "+modes[mode]+" ▾";
      toolbar.querySelectorAll("[data-mode]").forEach(button=>{
        button.setAttribute("aria-pressed",String(button.dataset.mode===mode));
      });
    }
    if(save)chrome.storage.sync.set({displayMode:mode}).catch(console.warn);
  }
  function makeToolbar(){
    if(toolbar?.isConnected || !document.body)return;
    toolbar=document.createElement("aside");
    toolbar.className="tmdboc-mode-toolbar";
    toolbar.setAttribute("aria-label","影仓网页显示模式");
    const toggle=document.createElement("button");
    toggle.className="tmdboc-mode-toggle";
    toggle.type="button";
    toggle.setAttribute("aria-expanded","false");
    const menu=document.createElement("div");
    menu.className="tmdboc-mode-menu";
    menu.hidden=true;
    Object.entries(modes).forEach(([key,label])=>{
      const button=document.createElement("button");
      button.type="button";
      button.textContent=label+"模式";
      button.dataset.mode=key;
      button.onclick=()=>{
        apply(key,true);
        menu.hidden=true;
        toggle.setAttribute("aria-expanded","false");
      };
      menu.append(button);
    });
    toggle.onclick=()=>{
      menu.hidden=!menu.hidden;
      toggle.setAttribute("aria-expanded",String(!menu.hidden));
    };
    toolbar.append(toggle,menu);
    document.body.append(toolbar);
    apply(mode);
  }
  function markSecondary(){
    document.querySelectorAll("header a[href],nav a[href],.dropdown_menu a[href],.k-menu a[href],.k-popup a[href]").forEach(anchor=>{
      try{
        const url=new URL(anchor.href,location.href);
        if(!["www.themoviedb.org","themoviedb.org"].includes(url.hostname))return;
        if(/^\/(?:discussion|discuss|leaderboard|contribute|edit|settings)(?:\/|$)/i.test(url.pathname)){
          anchor.dataset.tmdbocSecondary="1";
        }
      }catch{}
    });
  }
  function scan(){
    makeToolbar();
    markSecondary();
  }
  const observer=new MutationObserver(()=>{
    if(scanTimer)return;
    scanTimer=setTimeout(()=>{scanTimer=0;scan();},300);
  });
  apply("simple");
  observer.observe(root,{childList:true,subtree:true});
  scan();
  chrome.storage.sync.get({displayMode:"simple"})
    .then(settings=>apply(settings.displayMode))
    .catch(()=>apply("simple"));
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==="sync"&&changes.displayMode)apply(changes.displayMode.newValue);
  });
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape"||!toolbar)return;
    const menu=toolbar.querySelector(".tmdboc-mode-menu");
    if(menu&&!menu.hidden){
      menu.hidden=true;
      toolbar.querySelector(".tmdboc-mode-toggle")?.setAttribute("aria-expanded","false");
    }
  },true);
  window.addEventListener("pagehide",()=>observer.disconnect(),{once:true});
})();
