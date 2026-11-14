/* Shared administrator-managed TMDB embed providers for web and Android WebView. */
window.MovieSourceAdmin = {
  admin() { return window.SFCloud?.isAdmin?.() === true && !!window.SFCloud?.client; },
  async rows(includeDisabled = false) {
    const client = window.SFCloud?.client;
    if (!client) return [];
    let request = client.from('movie_source_providers')
      .select('id,name,movie_url,tv_url,enabled,sort_order')
      .order('sort_order', { ascending: true }).order('id', { ascending: true });
    if (!includeDisabled) request = request.eq('enabled', true);
    const { data, error } = await request;
    if (error) throw error;
    return data || [];
  },
  async providers() {
    try {
      const rows = await this.rows(false);
      return rows.map(row => ({
        id: 'managed-' + row.id, name: row.name, mode: 'embed',
        movieUrl: row.movie_url, tvUrl: row.tv_url || '',
      }));
    } catch (error) {
      console.warn('Managed playback sources unavailable; using existing sources.', error);
      return [];
    }
  },
  validate(value) {
    const name = String(value.name || '').trim();
    const movie = String(value.movie_url || '').trim();
    const tv = String(value.tv_url || '').trim();
    const check = (raw, fields) => {
      if (!raw) return false;
      try {
        const url = new URL(raw);
        const tokens = raw.match(/\{[^}]*\}/g) || [];
        return url.protocol === 'https:' && !url.username && !url.password &&
          !/\s/.test(raw) && raw.length <= 2048 &&
          fields.every(field => tokens.includes('{' + field + '}')) &&
          tokens.every(token => fields.includes(token.slice(1,-1)));
      } catch (_) { return false; }
    };
    if (!name || name.length > 80) throw Error('线路名称需为1–80个字符。');
    if (!check(movie, ['tmdbId'])) throw Error('电影地址需为 HTTPS，且包含 {tmdbId}。');
    if (tv && !check(tv, ['tmdbId','seasonNumber','episodeNumber'])) {
      throw Error('剧集地址需为 HTTPS，且包含 {tmdbId}、{seasonNumber}、{episodeNumber}。');
    }
    return {
      name, movie_url: movie, tv_url: tv,
      enabled: !!value.enabled,
      sort_order: Math.max(-10000, Math.min(10000, Number(value.sort_order) || 100))
    };
  },
  async render(app) {
    if (!this.admin()) {
      app.el().innerHTML = '<section class="empty"><h2>仅管理员可管理播放源</h2><a href="#/movie-admin">返回影视资源管理</a></section>';
      return;
    }
    const shell = document.createElement('section');
    shell.className = 'book-admin movie-source-admin';
    shell.innerHTML = '<header><h1>全站播放源管理</h1><p>添加按 TMDB ID 匹配电影、电视剧的第三方嵌入播放器。保存后网站与使用本站网页的 APK 均可读取，无需每次修改 GitHub。原有线路保持不变。</p></header>'
      + '<p><a class="btn secondary" href="#/movie-admin">返回影视资源管理</a></p>'
      + '<form id="providerEditor"><input type="hidden" name="id">'
      + '<div class="movie-source-fields"><label>线路名称<input name="name" maxlength="80" required placeholder="例如：AutoEmbed 备用"></label>'
      + '<label>电影嵌入地址模板<input name="movie_url" required placeholder="https://example.com/movie/{tmdbId}"></label>'
      + '<label>电视剧嵌入地址模板（可留空）<input name="tv_url" placeholder="https://example.com/tv/{tmdbId}/{seasonNumber}/{episodeNumber}"></label>'
      + '<label>排序值（小的排前面）<input name="sort_order" type="number" min="-10000" max="10000" value="100"></label>'
      + '<label class="movie-provider-check"><input name="enabled" type="checkbox" checked> 启用这条线路</label></div>'
      + '<p class="muted">输入服务商公开提供的嵌入地址模板，不是其主页网址。支持电影变量 {tmdbId}，剧集变量 {tmdbId}、{seasonNumber}、{episodeNumber}。只添加有使用或嵌入授权的来源。</p>'
      + '<p role="status" id="providerStatus" aria-live="polite"></p>'
      + '<button type="submit" class="btn" id="providerSave">保存线路</button> <button type="button" class="btn secondary" id="providerReset">清空表单</button></form>'
      + '<section><h2>已管理的播放源</h2><p class="muted">停用的线路不会进入播放器；系统原有固定线路仍保留。</p><div id="providerList">正在加载…</div></section>';
    app.el().replaceChildren(shell);
    if (!document.getElementById('movieProviderAdminStyle')) {
      const style = document.createElement('style');
      style.id = 'movieProviderAdminStyle';
      style.textContent = '.movie-source-admin{max-width:900px;margin:20px auto;padding:22px}.movie-source-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.movie-source-fields label{display:grid;gap:6px}.movie-source-fields input{width:100%;min-width:0;box-sizing:border-box}.movie-source-fields .movie-provider-check{display:flex;align-items:center}.movie-source-fields .movie-provider-check input{width:auto}.movie-source-admin #providerList article{border-top:1px solid #ddd;padding:14px 0;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.movie-source-admin #providerList article small{display:block;overflow-wrap:anywhere;max-width:610px}.movie-source-admin .provider-actions{display:flex;gap:6px;flex-wrap:wrap}';
      document.head.append(style);
    }
    const form = shell.querySelector('#providerEditor');
    const field = name => form.elements.namedItem(name);
    const status = shell.querySelector('#providerStatus');
    const list = shell.querySelector('#providerList');
    const show = text => { status.textContent = text; };
    let rows = [];
    const reset = () => { form.reset(); field('id').value = ''; field('sort_order').value = '100'; field('enabled').checked = true; };
    shell.querySelector('#providerReset').onclick = reset;
    const button = (label, callback) => {
      const element = document.createElement('button');
      element.type = 'button'; element.className = 'btn secondary';
      element.textContent = label; element.onclick = callback; return element;
    };
    const refresh = async () => {
      rows = await this.rows(true);
      list.replaceChildren();
      if (!rows.length) { list.textContent = '暂无自定义线路。'; return; }
      rows.forEach(row => {
        const article = document.createElement('article');
        const detail = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = row.name + (row.enabled ? ' · 已启用' : ' · 已停用');
        const url = document.createElement('small');
        url.textContent = row.movie_url;
        detail.append(title,url);
        const actions = document.createElement('div');
        actions.className = 'provider-actions';
        actions.append(button('编辑', () => {
          ['id','name','movie_url','tv_url','sort_order'].forEach(name => field(name).value = row[name] ?? '');
          field('enabled').checked = row.enabled; show('正在编辑：' + row.name);
          form.scrollIntoView({behavior:'smooth',block:'start'});
        }));
        actions.append(button(row.enabled ? '停用' : '启用', async () => {
          try {
            const {error} = await window.SFCloud.client.from('movie_source_providers')
              .update({enabled: !row.enabled, updated_at: new Date().toISOString()}).eq('id',row.id);
            if(error) throw error; await refresh(); show('线路状态已更新。');
          } catch (error) { show('操作失败：' + error.message); }
        }));
        actions.append(button('删除', async () => {
          if (!window.confirm('确定删除「' + row.name + '」吗？')) return;
          try {
            const {error} = await window.SFCloud.client.from('movie_source_providers').delete().eq('id',row.id);
            if(error) throw error; await refresh(); reset(); show('线路已删除。');
          } catch (error) { show('删除失败：' + error.message); }
        }));
        article.append(detail, actions); list.append(article);
      });
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (!this.admin()) { show('管理员登录已过期，请重新登录。'); return; }
      const save = shell.querySelector('#providerSave');
      try {
        const payload = this.validate({
          name: field('name').value, movie_url: field('movie_url').value,
          tv_url: field('tv_url').value, sort_order: field('sort_order').value,
          enabled: field('enabled').checked
        });
        save.disabled = true; show('正在保存…');
        const id = Number(field('id').value);
        const query = window.SFCloud.client.from('movie_source_providers');
        const {error} = id > 0
          ? await query.update({...payload,updated_at:new Date().toISOString()}).eq('id',id)
          : await query.insert(payload);
        if(error) throw error;
        await refresh(); reset(); show('已保存，重新打开影视播放器即可加载新线路。');
      } catch (error) { show('保存失败：' + error.message); }
      finally { save.disabled = false; }
    };
    try { await refresh(); } catch(error) { show('加载线路失败：' + error.message); list.textContent = '请检查数据库权限及网络连接。'; }
  }
};
