# TMDB OneClick Player v2.0 (yqxyy adapter)

在 TMDB 官方网页中点击影片海报，按 TMDB ID 生成 HLS 直链，在当前网页弹窗播放。电视剧可选季数/集数；内置 HLS.js 1.5.20；自动检测 HLS 内置字幕，默认优先英文字幕，可手动关闭或切换。Chrome/Edge 桌面端使用。

## 安装

1. 下载此独立插件分支的 ZIP，并解压。
2. 在 Chrome 打开 chrome://extensions 或 Edge 打开 edge://extensions。
3. 开启开发者模式 → 加载已解压的扩展程序 → 选择包含 manifest.json 的文件夹。
4. 打开 https://www.themoviedb.org ，点击海报上的 ▶ 标记或影片详情页右下角的 ▶ 播放本片。

此分支的 ZIP 已包含 vendor/hls.min.js，无需额外脚本或 CDN 下载。

## 默认播放规则

电影 https://api.obj2.top/hls/movie/{id}/master.m3u8
电视剧 https://api.obj2.top/hls/tv/{id}/{season}/{episode}/master.m3u8

配置可在扩展选项中调整，但宿主权限默认仅允许 api.obj2.top。剧集为第 1 季第 1 集起，允许输入季、集。视频是否真实可播取决于源站、网络、跨域、编码和访问许可。

## 从 yqxyy-r2 复用的实现

- js/movie-library.js：automaticSource 的 TMDB ID / season / episode 拼接规则。
- js/movie-subtitles.js：基于 Hls.subtitleTracks、SUBTITLE_TRACKS_UPDATED 和 subtitleDisplay 的字幕轨道处理思想。
- js/movies.js、js/desktop-player.js：播放器状态与用户控制方式。
- assets/vendor/hlsjs-1.5.20/hls.min.js：仓库现成 HLS.js 播放内核，作为 Git blob 精确复用，随 ZIP 离线打包。

本插件没有导入网站的 SFCloud 登录态、App 对象或学习页数据，避免耦合正式网站和 Supabase。没有修改网站 main 分支。

## 测试建议

1. 电影 TMDB 9502（用户提供样例）。
2. 电视剧 TMDB 111474，第 1 季第 1 集。
3. 有字幕源时选择 English；无字幕时下拉只显示关闭字幕。
4. 关闭弹窗、切换剧集、播放失败报告。

本分支已检查源码结构；没有在真实 TMDB 和 api.obj2.top 网络环境下完成端到端播放测试，不保证样例源此刻仍可访问。

## 平台及合规

安卓 Google Chrome 不能安装此类扩展。仅用于访问你有权访问的影片源，不包含 DRM 绕过或下载破解功能。

HLS.js 遵循 Apache-2.0 许可，许可证位于 vendor/LICENSE。
