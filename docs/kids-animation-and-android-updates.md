# 儿童动画栏目、TMDB 季集数及安卓版本更新

## 栏目
- 视听页新增 **儿童动画**，链接 `#/movies/kids`；动画故事、动画大电影、纪录片继续保留。
- 管理员影视资源管理的“发布栏目”新增 `kids`，使用已有 `movie_library` Supabase 表、RLS 权限、海报和单集播放源，无新账号体系。
- 电视剧在书架按 TMDB 系列合并为一张海报，进入后显示季集列表。
- 移动首页新增儿童动画精选：从已发布的 kids 剧集中优先选择《海绵宝宝》《布鲁伊》《小猪佩奇》《汪汪队立大功》，最多 4 项；没有真实可播放条目时仅显示“待上架”推荐，不提供假的播放地址。
- 已应用 Supabase 迁移 `20261113163140_add_children_animation_category.sql`；原影片数据和 RLS 未删除或重建。

## TMDB 季集数
- `netlify/functions/movie-tv-seasons.js` 使用 TMDB 官方 `GET /3/tv/{id}` 的 `seasons[].episode_count`，排除“第 0 季”和没有集数的季度。
- 搜索并选择电视剧后，前端自动尝试查询集数并填入当前季的**终止集**，支持切换季数后更新，也可以手动改写或使用“读取 TMDB 本季集数”按钮。
- 在编辑已存在的单集时，不会擅自将终止集扩展为整季，避免编辑一集时意外覆盖其余剧集。
- 该接口需要在站点服务端运行，并设置 **`TMDB_READ_ACCESS_TOKEN`**（v4 Read Access Token）或 **`TMDB_API_KEY`**（v3 API Key），作用域包含 Netlify Functions。绝不能把密钥放入公开 GitHub 仓库、网页 JavaScript 或 APK 中。
- 如果凭据未配置、Netlify 尚未部署该函数或 TMDB 无法访问，管理页面会提示无法自动查询，仍然支持手填集数，不推测终止集，也不阻止手动发布。
- TMDB 剧集资料表示存在对应条目，不保证第三方播放源一定有视频可用。

## 安卓更新
- `android/app/build.gradle` 定义显示版本号；GitHub Actions 每次发布时，将 `Version: vX.Y.Z`、`Commit: SHA` 写入 `android-app-latest` GitHub Release。
- APK 提供只读版本与构建 SHA 接口；“我的”底部自动请求 GitHub Releases 的**公开**元数据，发现新版时提供官方发布页。更新由用户自主点击下载，不执行静默安装。
- 网页版显示“网页版”，并提供安卓版官方链接。
- 目前 CI 使用 **Android Debug 签名**，不同构建可能签名不同，因此覆盖安装时可能出现签名不兼容：先卸载旧测试包再装新版。Supabase 云端进度仍保留，但本机登录状态需要重新登录。将来正式分发应配置持久化的签名密钥，才能保证直接覆盖升级。
- APK 嵌入 GitHub 构建当时的网站静态前端；当前尚未部署的 Netlify 函数**不会自动出现在 APK 内**。网站资源和云端服务迁移需另行测试，不应提前关闭 Netlify。

## 验证
- `node --test tests/kids-update.test.cjs tests/tmdb-tv-seasons.test.cjs`
- `node tests/movie-source-editor.browser.cjs`
- `node tests/movie-tv-admin.browser.cjs`
- GitHub Actions `Build YQXYY Android APK` 同时运行上述验证及 APK 编译。
