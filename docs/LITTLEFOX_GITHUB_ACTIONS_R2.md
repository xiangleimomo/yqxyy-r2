# yqxyy · Little Fox 工作日自动增量制课（GitHub Actions → R2）

生效规则：**网站前端代码、Netlify 部署、Supabase 数据库一律不参与日常制课同步**。本功能专门运行在 GitHub Actions 计算环境中，代码路径为 `automation/littlefox-daily/`，工作流为 `.github/workflows/littlefox-daily-r2.yml`。大文件使用已有的 Pone 托管方案，课程结构及索引在 R2。

## 执行时间、职责与存储

- `schedule`：周一至周五北京时间 **14:00**，即 GitHub cron `0 6 * * 1-5`（UTC）。GitHub 的定时器不是精确到秒的 SLA，偶尔会延迟。保留 `workflow_dispatch` 供手动演练/重跑。
- **GitHub**：保存程序、执行临时 Node.js 计算；不提交新课件 JSON 到 Git，整个 `data/` 不进仓库。
- **R2**：存放 `data/series-list.json`、`data/<seriesId>/episodes.json`、`reading-lessons.json`、`vocabulary.json`、`quiz.json`、`series.json`、`subtitles/NNN.vtt` 和原始官方字幕 XML；备份与运行报告存于 `data/__littlefox-sync/`。
- **Pone**：当有合法可托管的大文件时输出文件直链；已有 HLS 源只记录已经核验的官方播放直链，不重新下载、转存整个视频。可选的 PDF 托管通过 `LF_ALLOW_PONE_BOOK_MIRROR=1` 启用，默认关闭，需先确认许可、文件类型和服务端实际支持。Pone 不存用户资料。
- **Supabase**：完全不触碰，继续仅负责用户、登录、学习记录、徽章等。
- **Netlify**：不触发构建、不改页面、不配置定时函数；现有网站 `/data/*` 路由每次读取 R2 新索引，用户刷新后看到新增内容。

## 每天实际处理

1. 只请求 Little Fox 当月**发布日程**，找出北京时间当天的新集，不调用旧720P/1080P批量扫描器。
2. 对照 R2 当前全站系列清单、该系列的 `episodes.json` 去重；根据官方系列列表 `FSxxxx`/`SRVxxxx` 中 `data-fcid`（C 编号）与标题精确匹配，缺失时仅尝试少量现存连续 C 编号的下一个，且必须再由官网播放器返回相同 C ID 和正确标题验证。绝不批量猜测 C 号。
3. 获取 **Video/m3u8**，核对有效 HLS 清单及对应源域名；**Storybook** 通过 `load_pdf/C` 链接验证；**Text** 通过 `https://cn.littlefox.com/cn/supplement/org/C` 和 `/trans/C` 获得英文原文及逐段中文译文；**Caption XML** 通过 `contents/caption/C.xml` 解析时间轴。
4. 依据本集可靠原文和中文译文生成阅读、词汇、Quiz，遵循 `docs/LITTLE_FOX_QUIZ_V2_STANDARD.md` 的五道剧情题、四选一、逐题原文证据、中文解析规则；独立第二轮 AI 审核不通过即停。0–2级不自动创建原本没有的 Quiz。
5. 确认 R2 目前没有该 C ID 和集数；对将修改的 JSON 先做备份，再上传字幕、阅读及词汇、Quiz、系列信息，并逐项读回校验；**最后**写 `episodes.json`、`series-list.json`。现有课程内容不会被自动覆盖。
6. 读回 R2 后，通过 `https://yqxyy-r2.netlify.app/data/<seriesId>/episodes.json` 验证正式网站的只读代理是否可见。该 HTTP 请求不产生 Netlify 部署。
7. 输出 GitHub Actions Step Summary；R2 `data/__littlefox-sync/reports/YYYY-MM-DD.json` 存当日报告，另将小型运行报告作为 GitHub Actions Artifact 保存7天。失败记录包含系列、C 编号、具体阶段。

## GitHub 配置

仓库 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 用途 |
|---|---|---|
| Secrets | `R2_ENDPOINT` | 现有 R2 S3 接口 |
| Secrets | `R2_BUCKET` | 现有 `yqxyy-resources` |
| Secrets | `R2_ACCESS_KEY_ID` | R2 上传身份，已有其他 R2 工作流复用 |
| Secrets | `R2_SECRET_ACCESS_KEY` | R2 上传身份，已有其他 R2 工作流复用 |
| Secrets | `LF_OPENAI_API_KEY` | **必需（正式自动制课时）**：可用的 OpenAI API 密钥；与 ChatGPT Plus 订阅分别计费；没有则仅验证官方资料并报告，不发布课程 |
| Variables | `LF_COURSE_MODEL` | 可选：具备 JSON 模式的 API 模型；默认 `gpt-4o-mini`，需要根据实际 API 权限和质量调整 |
| Variables | `LF_ALLOW_PONE_BOOK_MIRROR` | 可选，默认 `0`。确认托管许可后才设 `1` |

**不要把凭据写在代码或 R2 公有目录。** 需要单独考虑官网教材自动抓取与再发布的合法使用权限。缺少 `LF_OPENAI_API_KEY` 或官网材料不完整时，流水线仍报告发现的新剧集及资源核验情况，但禁止发布不完整课件。**GitHub Models 已于 2026-07-30 全面退役，`GITHUB_TOKEN` 的 `models:read` 权限不再提供模型推理；GitHub Actions 免费运行额度不等于免费的模型服务。**

## 使用方式及安全开关

- 正常工作日的定时触发：依程序环境变量 `LF_DRY_RUN=0` 与 `LF_ALLOW_PUBLISH=1` 运行；只有在每个来源和质检关卡全部通过后才实际写课程。官方资源缺失 / C 编号冲突 / AI API 未配置 / 题目证据有问题，都不会写新课程索引。
- GitHub Actions → `Little Fox Daily Incremental Course to R2` → `Run workflow`：默认 `publish=false` 为干跑演练；勾选才发布。执行结果和详细失败原因查看该工作流运行页面的 Summary。
- 本地测试（不接触线上数据）：`node --test automation/littlefox-daily/*.test.mjs`。

## 当前已经完成与尚待真实验收

- 已编写自动定时工作流、增量内容解析、视频/字幕/Text/Quiz质量检查、Pone可选接口、R2备份/发布/验收、日志报告及模拟测试；**不需要部署 Netlify**。
- 由于对话环境无法直接连接 Little Fox 官网及用户 R2 Secret，本地模拟测试通过不代表已经成功获取当日真实集数。第一次工作流运行需查看日志，验证当月官网日程页面的 HTML、`/org/`和`/trans/`段落布局、XML 时间轴和实际 R2 数据兼容性。
- GitHub 定时任务无法由 ChatGPT 的普通对话后台持续执行，只能由仓库中的 GitHub Actions 工作流承担。
- 日常无需让 AI 聊天模型持续待命；只有剧集内容生成依赖 API 调用，其费用与 ChatGPT 产品订阅独立。

## 风险与恢复

- 只有 `episodes.json` 已成功读回，才会更新最终全局索引；上线后曾成功写入的对象不应因后续重试被直接覆盖。
- 每次发布改写的 JSON 存原版备份；需要修复时先从备份恢复受损对象，再按顺序重试索引。仓库没有用户数据库写入权限。
- 若官网当天没有匹配记录，运行状态为 `no_release_detected` 而非编造成功；可与官网公告交叉核查。
- 历史资料提升1080P、电影V2、WhisperX、已完成的Quiz批量修复 **不属于** 本工作流，旧 Actions 的禁用状态不改。