# Story Fox English — R2 版

基于 [xiangleimomo/yqxyy](https://github.com/xiangleimomo/yqxyy) 的 `639d843067b4eab173f1ec9c26bab16a77d9a1dd`。页面、样式、播放和 Supabase 配置保持原样；新仓库及其 Git 历史不包含 `data/`。

## 结构

- GitHub：网站代码、样式、固定界面资源。
- R2 `yqxyy-resources`：原 `data/` 全部文件，保持 `data/相对路径`。
- Netlify：静态网站 + `/data/*` 流式读取代理；R2 桶无需公开，也无需跨域设置。
- Supabase：继续使用原项目、登录、数据库和权限规则。

浏览器访问地址保持 `/data/...`，JSON、字幕、PDF、图片和相对 HLS 路径都不用改。代理只允许 GET/HEAD，支持 Range、条件请求、中文文件名；找不到对象返回 404，不回退成首页。电影目录及课程字幕函数也在请求时读取 R2，不再把 JSON 打包到函数。

## 部署到新的 Netlify 账户

已创建站点：[yqxyy-r2.netlify.app](https://yqxyy-r2.netlify.app)，归属 `hanzhimin888`。GitHub Actions 中已配置新账户的部署授权与站点 ID；推送 main 后检查成功会自动部署，R2 内容更新本身不需要运行部署。自动部署入口在 `.github/workflows/deploy.yml`，无需额外连接 Netlify GitHub App。

1. 确认团队为 **hanzhimin888**，导入本 GitHub 仓库。
2. 构建命令 `npm run build`，发布目录 `dist`，Node.js 22 或以上。根目录 `netlify.toml` 已配置。
3. 在 Netlify 环境变量中配置以下四项（范围必须包含 Functions）：
   - `R2_ENDPOINT`：从 Cloudflare R2 原始凭据复制 S3 endpoint，注意账户 ID 拼写。
   - `R2_BUCKET`：`yqxyy-resources`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
4. 凭据只保存在 Netlify 环境变量或本机 `.env`；不要填进 GitHub 文件。建议网站使用限定本桶的只读凭据。
5. 旧站额外的服务器环境变量（如字幕服务账号）如需继续使用，在新站单独配置。仓库内原 Supabase 公共连接参数已保留。
6. 等 R2 上传完成后部署；先检查首页、课程、阅读、字幕、PDF、电影和登录，再切换正式域名。

新的域名若需要邮件登录/OAuth 回调，需在现有 Supabase Auth 的 Redirect URLs 中追加新站地址，保留原地址，无需迁移 Supabase 项目。

## 日后更新内容

在 R2 覆盖对应的 `data/...` 文件即可。目录中新加资源时同时更新相应的 `series-list.json`、`episodes.json` 等索引。仅上传一个没有被目录引用的文件不会自动生成栏目。

资源响应禁止浏览器/CDN 持久缓存；**刷新页面后**读取 R2 新内容，不必重新部署。已打开页面保留原站内存缓存，不会主动热刷新，也不会打断正在学习的内容。浏览器不会凭空感知 R2 上传完成。

上传一批互相关联文件时，先传资源、最后传目录索引，避免页面读取到尚未上传的文件。旧站自动生成并提交 data 的 GitHub Actions 已存档在 `docs/legacy-workflows/`，不会在新仓库自动运行。原脚本及历史测试保留供维护参考，其中依赖本地 data 的检查需在本机准备数据后单独运行，不属于新站部署步骤。

## 开发与验证

### 在本机 Chrome 中测试

用 VS Code 打开本仓库根目录，终端运行 `npm run dev`，然后在谷歌浏览器打开 `http://localhost:8888`。也可以按 F5 选择“谷歌浏览器本地测试”。修改 HTML、CSS、JS 后会自动重新生成本地预览，刷新浏览器查看；按 Ctrl+C 停止服务。

本地 `.env` 中的 R2 连接仅保留在电脑上。此站需要运行 R2 代理，请使用上述启动方式，不要用 Live Server 或直接双击 HTML。当前改动不会自动上传 GitHub。

```sh
npm ci
npm test
npm run build
npx netlify-cli dev
```

本地 Netlify 开发需配置上述变量；纯 `python -m http.server` 无法执行 R2 代理。`dist/` 只包含网站资源，不发布服务器代码、密钥或 data。新增测试验证代理、签名、范围请求、错误隔离及代码包边界。

原站维护说明存档见 `docs/ORIGINAL-README.md`。

## 在 VS Code 中提交和上传

1. 打开仓库根目录，按 F5 在 Chrome 本地测试。
2. 按 Ctrl+Shift+G 打开“源代码管理”，检查修改，点击要上传文件旁的“＋”暂存。
3. 填写本次修改说明，点击“提交”，再点击“同步更改”上传 GitHub。同步会先拉取远端提交，再推送本地提交；遇到冲突时先处理冲突。
4. 也可按 Ctrl+Shift+P →“任务: 运行任务”→“推送已提交代码到 GitHub”，检查和构建成功后推送 main。此任务只上传已经提交的代码，不会自动提交文件。

GitHub 上检查成功后会自动触发 Netlify 部署；代码推送成功与网站部署完成是两个阶段。`.env`、`data/`、`node_modules/` 和 `dist/` 已忽略，不会上传。R2 资源更新仍在 R2 完成。

## 管理员公告

管理员登录后，点击“公告”，再点击弹窗中的“管理公告”，或访问 `#/announcement-admin`。支持通知、活动、节日祝福，标题、正文、奖励说明、置顶、展示起止时间、草稿和撤下。游客与普通用户只能阅读当前已发布且在有效期内的公告；奖励说明不会自动发放勋章。

localhost / 127.0.0.1 使用浏览器本地预览数据，页面会显示提示，不会向线上用户发布。正式启用前需执行 `supabase/migrations/20261108151748_site_announcements.sql`；该迁移已在现有 Supabase 项目启用；本地预览仍使用浏览器数据。正式站点使用 Supabase `site_announcements` 表，RLS 以现有 `app_metadata.site_admin` 控制写入，禁止普通用户发布、修改或读取草稿。

公告内容不在页面顶部展示；用户点击“公告”才打开弹窗，只显示最近创建且处于有效展示期的一条已发布公告，置顶不会覆盖最新公告的选择。
