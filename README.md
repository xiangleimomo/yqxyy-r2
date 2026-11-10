# 影仓 · TMDB OneClick Player v3.0

本项目使用 **TMDB 原网站** 作为唯一的电影、电视剧、海报、搜索与分类导航来源。Chrome/Edge 浏览器插件只增加播放能力和可切换的外观简化层，不建立新的影视库，也不修改 yqxyy 网站或 TMDB 服务端。

## 三种模式（默认精简）

- **原版**：不修改 TMDB 的布局和内容，仅增加海报播放和详情页播放入口。
- **精简**：隐藏部分社区导航和页脚、收紧常见影视卡片，同时保留 TMDB 搜索、榜单、排序、分类、影视详情和电视剧季集导航。
- **海报**：在常见影视卡片中隐藏文字说明、突出海报。TMDB 不同页面的 HTML 结构可能不同，因此并非所有页面都能完全变成纯海报墙。

在 TMDB 网页左下角通过“影仓 · 精简 ▾”即时切换，设置同步保存。插件设置页亦可修改。

## 基础播放

点击海报 → 自动读取 TMDB ID → 在 **TMDB 当前网页弹窗** 打开 HLS 播放器。普通文字标题仍可点击进入 TMDB 详情页。详情页右下角额外提供“▶ 播放本片”。

电影：https://api.obj2.top/hls/movie/{id}/master.m3u8

电视剧：https://api.obj2.top/hls/tv/{id}/{season}/{episode}/master.m3u8

电视剧可选择季、集。内置 HLS.js 1.5.20，字幕轨道由播放器自动检测并优先选择英文，可关闭或切换。所给地址属于播放规则，**不代表每部影片的源都实际存在或可访问**。

## 安装

1. 下载 **tmdb-oneclick-player-v3** 分支的 ZIP，并解压到固定目录。
2. Chrome 打开 chrome://extensions，Edge 打开 edge://extensions。
3. 开启开发者模式，选择“加载已解压的扩展程序”，指向包含 manifest.json 的文件夹。
4. 访问 https://www.themoviedb.org/ ，查看左下角显示模式控制器，点击电影海报试播。
5. 安装 v3 前最好先禁用或删除旧 v2，防止同一网页重复注入。

插件 ZIP 包含独立的 vendor/hls.min.js 和 LICENSE，无需另外运行 setup_hls.bat。

## 实现依据

- yqxyy-r2/js/movie-library.js：TMDB ID 到播放直链的拼接规则。
- yqxyy-r2/js/movie-subtitles.js：HLS 字幕轨道识别与切换的实现思路。
- yqxyy-r2/assets/vendor/hlsjs-1.5.20/：现成的 HLS.js 内核，Apache-2.0。
- v2 现有播放器、弹窗、字幕控制、故障提示完整继承；v3 新增 display-mode.js/css，并支持三模式保存。

## 测试与限制

代码已作构建结构核对，**尚无真实 TMDB 页面与 api.obj2.top 的端到端播放测试结果**。源站 403/404、跨域、浏览器媒体格式和 TMDB 网页结构变化仍可能导致播放或布局问题。原版模式可一键恢复布局。

这不是 APK，也不支持安卓版 Chrome 安装扩展。插件仅用于播放合法授权或有权访问的资源。
