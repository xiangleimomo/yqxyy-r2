# yqxyy · Little Fox 每日增量制课流水线（2026-11-10）

## 不得更改的任务边界

- **北京时间周一至周五14:00**，只发现当天 Little Fox 官网新发布的课程；不扫描历史720P、不批量找1080P、不要求用户提供 m3u8。
- 以 `Cxxxxxxx` 为官方内容标识。仅针对经官网播放器数据**确认编号及本集标题均匹配**的内容采集资源。
- 四类输入：Video/m3u8（官方播放器返回，取其实际清晰度）、Storybook/PDF（官方固定路径）、Text/Read（C 编号对应的官方英文原文及中文译文，必须按段核对）、Caption/XML（官方字幕）。
- 依据官方 **Text 原文和逐段中文译文，而非仅字幕**制作阅读、词汇、Quiz；Quiz 采用 `docs/LITTLE_FOX_QUIZ_V2_STANDARD.md`（5题、四选一、中文解析、逐题原文证据）。对于没有足够文本、非叙事歌曲等不满足规则的内容保留失败记录，不造题。
- 用现有 `data/<seriesId>/episodes.json`、`reading-lessons.json`、`vocabulary.json`、`quiz.json`、`series.json` 与 `subtitles/NNN.vtt` 结构；资源上传与读回校验完成，最后更新 `data/series-list.json`。旧资源不修改、不重复上架。
- 不启用 GitHub Actions。更新 R2 数据不触发 Netlify 代码重新构建。

## 文件及调用方式

- `scripts/littlefox-daily-core.mjs`：官网日历解析、按 C 编号获取视频、M3U8验证、XML→VTT、Text抽取、基于 Text 的 AI 教学内容生成、Quiz严格校验、R2对象备份/写入/读回。
- `netlify/functions/littlefox-daily.mjs`：Netlify 定时器，`0 6 * * 1-5` UTC = 中国北京时间14:00。
- `netlify/functions/littlefox-job.mjs`：后台函数，最多15分钟，使用 `LF_JOB_TOKEN` 验证调用。单次只处理日历中当天新增。
- `tests/littlefox-daily.test.mjs`：无需联网的单元/集成模拟测试，`node --test tests/littlefox-daily.test.mjs`。

## 上线前必须配置的 Netlify 环境变量

已有且复用的：`R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。

新增：

| 名称 | 用途 |
| --- | --- |
| `LF_RUN_ENABLED=1` | 定时任务启用开关。上线验收之前**不要**设置为1 |
| `LF_JOB_TOKEN` | 长随机令牌，仅在 Netlify Functions 端可见，禁止写入 GitHub |
| 
| `LF_OPENAI_API_KEY` | 自动生成阅读配套词汇和5道剧情 Quiz 所需的 API Key；ChatGPT Plus 订阅额度不等于 API 调用额度 |
| `LF_COURSE_MODEL` | 具备 JSON 输出能力、可处理中文与英文的 API 模型名称。需先校验实际可用性和成本 |
| `LF_DRY_RUN=1` | 默认演练，不上传课程文件，只写审核报告 |
| `LF_ALLOW_PUBLISH=1` | 允许真的发布课程；必须与 `LF_DRY_RUN=0` 一起设置，才会更新课程 |

首次建议：仅部署代码，设置 `LF_RUN_ENABLED=1`、`LF_DRY_RUN=1`，执行一次验收后核查报告，再逐项通过资源及版权许可检查。随后才设置 `LF_DRY_RUN=0`、`LF_ALLOW_PUBLISH=1`。依赖官方站点可访问及合法使用权限。

## 当前代码边界与待验收点

1. **官方更新日程**：根据 `/en/forum/publishing_schedule/YYYYMM` 中当天的 `<td>`，与 R2 `series-list.json` 的英文标题精准匹配。若网页结构改变或只有歌曲/特殊分类，记录异常，不伪造条目。
2. **C 编号**：优先使用日历单元格中明确的 C 编号，否则仅在当前系列最后三集的编号连续时计算紧邻下一编号作为**待核验候选**；必须由官方播放器返回同一 ID 并验证标题匹配，才认定真实 C 编号。严禁按历史 C 号大范围扫描。
3. **Text 来源已明确**：英文原文 `https://cn.littlefox.com/cn/supplement/org/{C}`，含中文译文 `https://cn.littlefox.com/cn/supplement/trans/{C}`。程序固定按新集 C 编号构造两条 URL，分别获取并按英文原文对齐中文段落，最终存入 `reading-lessons.json` 的 `paragraphs[].text` 和 `paragraphs[].translation`。若响应不可访问、正文结构变更、段落对齐有歧义，则禁止发布并记录异常。已经通过模拟测试，但仍需在部署环境对当前官网 HTML 实测。
4. **字幕 XML 结构尚待与当前在线 XML 对照**：代码支持有 `start/end` 等时间属性的 XML；若实物结构不同，应按样本完善解析，再开启发布。
5. **Quiz 质量**：实现结构与证据硬校验，但 AI 产出的情节推断、翻译仍建议正式上线前抽查；无 AI API 凭据不自动生成，而是生成待处理报告。
6. **Netlify 配置、部署未由提交代码自动完成**；需要发布部署并在 Netlify Functions 中核查计划运行。官网资源访问可能有授权或地区限制，不绕过访问控制。
7. **幂等与失败恢复**：已存在 episodeId 时跳过；失败只写当日报告，不修改课程。发布中会先存储对象备份，读回验证后才写课程索引；遇到上传中断，下次可根据原始快照与备份处理。

## 验收标准

- [ ] 连续五个工作日，每日北京时间14:00定时函数触发，后台在限时内运行。
- [ ] 确认当天官网发布的实际标题、系列、C编号；无新集时不多报。
- [ ] C编号通过官网播放器真实验证，实际 m3u8 可读取。
- [ ] Storybook、Text和Caption XML分别测试官方可访问性，XML能转成时间正确的VTT。
- [ ] 根据 Text 建立 `reading-lessons.json` 对应集条目，词汇和 Quiz 都具备真实来源，Quiz 5×4选、中文解析与原文证据。
- [ ] R2 更新后从正式 `https://yqxyy-r2.netlify.app/data/<seriesId>/...` 校验资源，并在移动端检查课程。
- [ ] 缺资源、页面结构变化、AI质量失败、上传失败时不标记完成，不破坏已发布内容。

## R2 结果报告

`data/__littlefox-sync/reports/YYYY-MM-DD.json` 包含新增、已收录、待处理、已发布状态及失败原因。新系统启动后可通过该报告检查真实进度；报告成功写入不代表新课程发布成功，必须看 `published_verified`。