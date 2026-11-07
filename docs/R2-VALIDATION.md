# 迁移验证记录

原仓库基线：`639d843067b4eab173f1ec9c26bab16a77d9a1dd`。

- 原仓库 data：13,519 个文件。
- 桌面待迁移 data：逐文件以 Git blob SHA-1 对比原仓库，13,519 个全部一致，0 个缺失，0 个内容不同。
- 页面 JS、CSS、HTML、固定 assets 原样复制，Supabase 公共配置及数据库迁移文件原样保留。
- 新仓库采用独立 Git 历史，不继承旧仓库 data 对象；`.gitignore` 忽略整个 `/data/`。
- `npm run build`、`npm test`（8 项代理/签名测试）及应用和服务器语法检查通过。
- 新签名读取客户端已实际读取 R2 `data/books.json` 成功。

部署验收仍需在新 Netlify 账户接入后进行；本文不表示网站已上线或全量 R2 上传已完成。旧站测试中直接读取本地 data 的测试不会在新 CI 中运行。
