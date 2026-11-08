window.SiteAnnouncements = {
  key: 'storyfox-announcements-preview-v1',
  types: { notice:'特别通知', activity:'活动公告', greeting:'节日祝福' },
  local() { return ['localhost','127.0.0.1'].includes(location.hostname); },
  e(value) { const node=document.createElement('span'); node.textContent=String(value??''); return node.innerHTML.replace(/"/g,'&quot;'); },
  active(row, now=Date.now()) { return row.published && (!row.starts_at||Date.parse(row.starts_at)<=now) && (!row.ends_at||Date.parse(row.ends_at)>now); },
  readKey(){return 'storyfox-announcements-read:'+ (window.SFCloud?.user?.id||'guest');},
  readState(){try{return JSON.parse(localStorage.getItem(this.readKey())||'{}');}catch{return {};}},
  signature(row){return JSON.stringify([row.created_at,row.title,row.body,row.reward_note]);},
  markRead(rows){const state=this.readState();for(const row of rows)state[row.id]=this.signature(row);localStorage.setItem(this.readKey(),JSON.stringify(state));this.refreshUnread(true);},
  async refreshUnread(force=false){
    const key=this.readKey();
    if(this.unreadOwner!==key){this.unreadOwner=key;this.unreadLast=0;this.unreadPending=null;window.UtilityCounts?.badge('navAnnouncements',null,'公告：正在读取');}
    if(this.unreadPending===key||(!force&&Date.now()-(this.unreadLast||0)<30000))return;
    this.unreadPending=key;
    try{const rows=(await this.rows()).filter(row=>this.active(row));if(key!==this.readKey())return;const state=this.readState(),count=rows.filter(row=>state[row.id]!==this.signature(row)).length;window.UtilityCounts?.badge('navAnnouncements',count,`公告：${count} 条未读`);this.unreadLast=Date.now();}
    catch{if(key===this.readKey())window.UtilityCounts?.badge('navAnnouncements',null,'公告：数量暂不可用');}
    finally{if(this.unreadOwner===key)this.unreadPending=null;}
  },
  async rows(admin=false) {
    if(this.local()) { try { const rows=JSON.parse(localStorage.getItem(this.key)||'[]'); return Array.isArray(rows)?rows:[]; } catch { return []; } }
    const client=window.SFCloud?.client;
    if(!client) return [];
    let query=client.from('site_announcements').select('*').order('pinned',{ascending:false}).order('created_at',{ascending:false});
    if(!admin) query=query.eq('published',true);
    const {data,error}=await query; if(error)throw new Error('公告服务暂不可用，请稍后重试。'); return data||[];
  },
  async save(row) {
    if(!window.SFCloud?.isAdmin?.())throw new Error('仅管理员可以发布公告。');
    if(this.local()) { const rows=await this.rows(true); const i=rows.findIndex(r=>r.id===row.id); const next={...row,id:row.id||crypto.randomUUID(),created_at:rows[i]?.created_at||new Date().toISOString()}; if(i<0)rows.unshift(next);else rows[i]=next;localStorage.setItem(this.key,JSON.stringify(rows));return; }
    const {error}=await window.SFCloud.client.from('site_announcements').upsert(row.id?row:Object.fromEntries(Object.entries(row).filter(([k])=>k!=='id')));
    if(error)throw new Error('公告保存失败，请检查管理员权限或后台配置。');
  },
  mount() {
    const host=document.getElementById('siteAnnouncements');
    if(host){host.replaceChildren();host.hidden=true;}
    this.refreshUnread();
    if(this.bound)return;
    this.bound=true;
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href="#/announcements"]');
      if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();this.open();
    });
  },
  async open() {
    if(this.dialog?.open){this.dialog.focus();return;}
    const dialog=document.createElement('dialog');dialog.className='announcement-dialog';
    dialog.setAttribute('aria-labelledby','announcementDialogTitle');
    dialog.innerHTML='<header><h2 id="announcementDialogTitle">网站公告</h2><button type="button" aria-label="关闭公告">×</button></header><div class="announcement-dialog-content" role="status">正在加载公告…</div>';
    document.body.append(dialog);this.dialog=dialog;
    const close=()=>dialog.close();dialog.querySelector('button').onclick=close;
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
    dialog.addEventListener('close',()=>{dialog.remove();if(this.dialog===dialog)this.dialog=null;},{once:true});
    dialog.showModal();
    const content=dialog.querySelector('.announcement-dialog-content'),owner=this.readKey();
    try{
      const rows=(await this.rows()).filter(r=>this.active(r)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)),row=rows[0];
      if(!dialog.isConnected)return;
      if(owner!==this.readKey()){dialog.close();return;}
      const e=value=>this.e(value);
      content.innerHTML=row?`<article class="announcement-card"><small>${e(this.types[row.kind]||'公告')}</small><h3>${e(row.title)}</h3><p>${e(row.body)}</p>${row.reward_note?`<p class="announcement-reward">🏅 ${e(row.reward_note)}</p>`:''}</article>`:'<p>暂无公告。</p>';
      if(row)this.markRead([row]);
      const read=this.readState();
      if(rows.some(r=>read[r.id]!==this.signature(r))){const all=document.createElement('button');all.type='button';all.className='btn secondary';all.textContent='全部标为已读';all.onclick=()=>{if(owner!==this.readKey())return;this.markRead(rows);all.remove();};content.append(all);}
      if(window.SFCloud?.isAdmin?.())content.insertAdjacentHTML('beforeend','<a href="#/announcement-admin" class="btn secondary">管理公告</a>');
      content.querySelector('a')?.addEventListener('click',close);
    }catch(error){if(dialog.isConnected)content.textContent=error.message;}
  },
  async render(app, admin=false) {
    if(!admin){app.el().innerHTML='<section class="announcements-page"><h1>网站公告</h1><a href="#/announcements">查看最新公告</a></section>';this.mount();await this.open();return;}
    if(admin&&!window.SFCloud?.isAdmin?.()){app.el().innerHTML='<div class="empty">仅管理员可以管理公告。</div>';return;}
    const route=location.hash, e=v=>this.e(v);
    const shell=document.createElement('section');shell.className='announcements-page';
    app.el().replaceChildren(shell);shell.innerHTML='<h1>'+ (admin?'管理员公告':'网站公告')+'</h1>';
    if(this.local())shell.insertAdjacentHTML('beforeend','<p class="announcement-preview">本地预览：公告仅保存在当前浏览器，不会发送给线上用户。</p>');
    let rows;try{rows=await this.rows(admin);}catch(error){shell.insertAdjacentHTML('beforeend',`<p role="alert">${e(error.message)}</p>`);return;}
    if(route!==location.hash)return;
    if(admin){
      shell.insertAdjacentHTML('beforeend',`<form id="announcementForm"><input name="id" type="hidden"><label>公告类型<select name="kind">${Object.entries(this.types).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>标题<input name="title" required maxlength="120"></label><label>正文<textarea name="body" required maxlength="5000" rows="5"></textarea></label><label>活动奖励说明（可选）<textarea name="reward_note" maxlength="500" placeholder="例如：本周完成 5 天打卡，可获得活动勋章"></textarea></label><p class="muted">奖励说明用于公告展示；实际勋章发放请使用现有奖励管理功能。</p><label>开始展示时间（可选）<input name="starts_at" type="datetime-local"></label><label>结束展示时间（可选）<input name="ends_at" type="datetime-local"></label><label><input name="pinned" type="checkbox">置顶</label><label><input name="published" type="checkbox">向全体用户发布（不勾选则保存草稿）</label><p role="status" id="announcementStatus"></p><button type="submit" class="btn">保存公告</button> <button type="reset" class="btn secondary">新建 / 清空</button></form>`);
      const form=shell.querySelector('form'),field=name=>form.elements.namedItem(name),status=shell.querySelector('[role=status]');
      form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{
        const date=name=>field(name).value?new Date(field(name).value).toISOString():null;
        const row={id:field('id').value||undefined,title:field('title').value.trim(),body:field('body').value.trim(),kind:field('kind').value,reward_note:field('reward_note').value.trim(),starts_at:date('starts_at'),ends_at:date('ends_at'),pinned:field('pinned').checked,published:field('published').checked};
        if(!row.title||!row.body)throw new Error('请填写标题和正文。');if(row.starts_at&&row.ends_at&&row.ends_at<=row.starts_at)throw new Error('结束时间须晚于开始时间。');
        await this.save(row);await this.refreshUnread(true);await this.mount();if(location.hash===route)await this.render(app,true);
      }catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
      shell.addEventListener('click',event=>{const button=event.target.closest('[data-edit-announcement]');if(!button)return;const row=rows.find(r=>r.id===button.dataset.editAnnouncement);if(!row)return;
        for(const key of ['id','title','body','kind','reward_note'])field(key).value=row[key]||'';
        for(const key of ['pinned','published'])field(key).checked=!!row[key];
        for(const key of ['starts_at','ends_at']){const d=row[key]?new Date(row[key]):null;field(key).value=d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
        status.textContent='正在编辑；取消“向全体用户发布”并保存即可撤下。';form.scrollIntoView({block:'start'});
      });
    }
    const shown=(admin?rows:rows.filter(r=>this.active(r))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Date.parse(b.created_at)-Date.parse(a.created_at));
    shell.insertAdjacentHTML('beforeend',shown.length?shown.map(r=>`<article class="announcement-card"><small>${e(this.types[r.kind]||'公告')}${r.pinned?' · 置顶':''}${admin?' · '+(r.published?(this.active(r)?'展示中':'未到展示时间或已结束'):'草稿'):''}</small><h2>${e(r.title)}</h2><p>${e(r.body)}</p>${r.reward_note?`<p class="announcement-reward">🏅 ${e(r.reward_note)}</p>`:''}${admin?`<button class="btn secondary" data-edit-announcement="${e(r.id)}">编辑 / 撤下</button>`:''}</article>`).join(''):'<p>暂无公告。</p>');
  }
};
