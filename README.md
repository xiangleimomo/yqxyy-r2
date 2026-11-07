# Story Fox English — R2 版

基于 [xiangleimomo/yqxyy](https://github.com/xiangleimomo/yqxyy) 的 `639d843067b4eab173f1ec9c26bab16a77d9a1dd`。页面、样式、播放和 Supabase 配置保持原样；新仓库及其 Git 历史不包含 `data/`。

## 结构

- GitHub：网站代码、样式、固定界面资源。
- R2 `yqxyy-resources`：原 `data/` 全部文件，保持 `data/相对路径`。
- Netlify：静态网站 + `/data/*` 流式读取代理；R2 桶无需公开，也无需跨域设置。
- Supabase：继续使用原项目、登录、数据库和权限规则。

浏览器访问地址保持 `/data/...`，JSON、字幕、PDF、图片和相对 HLS 路径都不用改。代理只允许 GET/HEAD，支持 Range、条件请求、中文文件名；找不到对象返回 404，不回退成首页。电影目录及课程字幕函数也在请求时读取 R2，不再把 JSON 打包到函数。

## 部署到新的 Netlify 账户

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

```sh
npm ci
npm test
npm run build
npx netlify-cli dev
```

本地 Netlify 开发需配置上述变量；纯 `python -m http.server` 无法执行 R2 代理。`dist/` 只包含网站资源，不发布服务器代码、密钥或 data。新增测试验证代理、签名、范围请求、错误隔离及代码包边界。

原站维护说明存档见 `docs/ORIGINAL-README.md`。
