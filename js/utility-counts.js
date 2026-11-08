window.UtilityCounts = {
  badge(id,count,label){
    const link=document.getElementById(id);if(!link)return;
    let badge=link.querySelector('.utility-count-badge');
    if(!badge){badge=document.createElement('span');badge.className='utility-count-badge';link.append(badge);}
    badge.hidden=count===null;
    badge.textContent=count===null?'':String(count);
    link.title=label;link.setAttribute('aria-label',label);
  },
  checkinDates(app){
    const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,today=key(new Date());
    const valid=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>today||Number(value.slice(0,4))<2000)return false;const date=new Date(value+'T12:00:00');return Number.isFinite(date.getTime())&&key(date)===value;};
    const dates=new Set((app.storage('checkins')||[]).filter(valid));
    for(const row of Object.values(app.storage('progress')||{})){const date=new Date(row.updatedAt);if(Number.isFinite(date.getTime())){const value=key(date);if(valid(value))dates.add(value);}}
    return dates;
  },
  totalHonors(state){
    const manual=[...new Map((state.manual_works||[]).map(row=>[row.template_id,row])).values()],ids=new Set(manual.map(row=>row.template_id));
    return [...(state.works||[]).filter(row=>!ids.has(row.template_id)),...manual].filter(row=>row.earned).length+(state.awards||[]).length;
  },
  refresh(app){
    const days=this.checkinDates(app).size;
    this.badge('navCheckin',days,`签到：累计 ${days} 天`);
    this.refreshHonors();
    window.SiteAnnouncements?.refreshUnread();
  },
  async refreshHonors(force=false){
    const uid=window.SFCloud?.user?.id||null,child=uid?sessionStorage.getItem('sf-medal-child:'+uid)||'':'';
    const key=JSON.stringify([uid,child]);
    if(this.owner!==key){this.owner=key;this.last=0;this.pending=null;this.badge('navHonors',uid?null:0,uid?'我的荣誉馆：正在读取':'我的荣誉馆：已获得 0 枚');}
    if(!uid||!window.SFCloud?.client)return;
    if(this.pending===key||(!force&&Date.now()-(this.last||0)<60000))return;
    this.pending=key;
    try{
      const rpc=async payload=>{const {data,error}=await window.SFCloud.client.rpc('sf_medals',{p_action:'dashboard',p_payload:payload});if(error)throw error;return data;};
      let state=await rpc({});
      if(state.role==='parent'&&state.children?.length){const target=state.children.find(c=>c.id===child)||state.children[0];state=await rpc({child_id:target.id});}
      if(this.owner!==key||window.SFCloud?.user?.id!==uid)return;
      const total=this.totalHonors(state);this.badge('navHonors',total,`我的荣誉馆：已获得 ${total} 枚徽章和荣誉纪念章`);this.last=Date.now();
    }catch{if(this.owner===key)this.badge('navHonors',null,'我的荣誉馆：数量暂不可用');}
    finally{if(this.owner===key)this.pending=null;}
  }
};
