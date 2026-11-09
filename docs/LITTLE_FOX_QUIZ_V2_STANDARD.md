# yqxyy · Little Fox V2 Quiz 质量标准（2026-11-09）

## 发布硬约束

每一集适合剧情理解测验的 Little Fox 故事课程均应具有独立 Quiz：

1. **5 道原创英文剧情理解题**，考查本集事件、人物、因果、细节、动机、推断、结尾，不得重复问同一内容。
2. 每题均为英文 **A、B、C、D 四个不重复选项**，**仅有一个可辩护的正确答案**，且答案与 `answer` 字母一致。
3. 题目附**具体中文解析**，写清剧情事实与判断依据，拒绝“请根据本集阅读内容作答”类万能解析。
4. 必须匹配该集 `episodes.json[].sourceContentId` 与 `reading-lessons.json[episodeId].sourceId`，从该集官方 Read、官方字幕/文本实际内容出题；**不能把别的集或原著的情节混进本集**。
5. 为便于溯源，给每道题留存 `evidence.paragraphIds`、`evidence.quote` 及 `evidence.sourceContentId`。抽象推断题需能够由本集具体语句支持。
6. 严禁以下机械题替代剧情理解：`Which word appears in this lesson?`、`Complete the sentence`、`Fill in the blank`、简单词义测试、无依据的剧情猜测、含两个正确答案的选项。
7. 5 道题必须覆盖**不止一个情节点**，适量涵盖开端、发展、冲突与结尾；避免绝大多数正确答案固定为同一字母。
8. 歌曲、自然拼读等非叙事材料的适用测验类型**单独评估**；不能假设缺 Quiz 就必然违反剧情理解出题要求。

## 统一 JSON 示范

```json
{
  "episodeId": 1,
  "title": "Example Episode Quiz",
  "styleReference": "yqxyy-v2-story-comprehension",
  "revision": "2026-11-09",
  "questions": [
    {
      "id": "q1",
      "type": "single-choice",
      "category": "reading",
      "question": "Why did the character leave the house?",
      "options": [
        { "key": "A", "text": "Because the door was locked" },
        { "key": "B", "text": "Because she wanted to find her friend" },
        { "key": "C", "text": "Because she had lost her book" },
        { "key": "D", "text": "Because it started to rain" }
      ],
      "answer": "B",
      "explanation": "示例：本集原文明确提到角色为了寻找朋友离开住所。",
      "source": "editorial-official-read",
      "evidence": {
        "paragraphIds": ["p2"],
        "quote": "（在实际发布时填写该集官方文本原句）",
        "sourceContentId": "C0000000"
      }
    }
  ]
}
```

以上只是结构示例；不能复制到任何真实剧情课程，也不能直接复制示例答案。每个真实 Quiz 必须有本集可核实的文本。

## 发布执行顺序

1. 获取 R2 实时 `episodes.json`、`reading-lessons.json`、`quiz.json`，而非仅用旧 GitHub 里的归档文件。
2. 对照 **同集 content ID**，根据官方 Read 人工编制及校核 5 道剧情题，并分别指向该集原文证据。
3. 检查选项数量、答案唯一性、英文语言、中文解析、题目覆盖、原创性和情节准确性。
4. 将旧 R2 `quiz.json`（以及若调整课程 Quiz 开关的 `episodes.json`）备份至 `__course-backups/`。
5. 只合并所改集数，不覆盖未审查的好题或其他课程；上传 R2 后立即读回校验。
6. 通过正式 Netlify `/data/<seriesId>/quiz.json` 公共路由复检；正式网页中的 Quiz 标题和选项也需抽检。
7. 已完成的一次性 GitHub Actions 发布工作流要关闭，避免后续重复覆盖。

## 2026-11-09 审计及修复

只读基线审计：158 个系列、6,215 集、19,874 道 Quiz 题；7,529 道是机械式单词识别题；19,869 道未达到四选一结构；1,844 集无 Quiz 条目（含待排除的歌曲类内容）。

**已完成 R2 上线并通过公有路由验证：**
- Alice's Adventures in Wonderland（24 集 × 5 = 120 题），原题库有备份；
- Nero the Talking Dog（11 集 × 5 = 55 题），第 11 集原已合格并完整保留，原题库有备份；
- Romance of the Three Kingdoms（三国演义，14 集 × 5 = 70 题），旧题补齐第四选项，词义题改剧情题，第 13、14 集补课。

原始问题清单与剩余系列优先级见 `audits/quiz-quality-audit-2026-11-09.json`。

**重要：** 只读脚本发现的结构问题并不自动构成剧情题。未逐集审核的系列不得宣称全部已修复，更不能用自动抽词模板回填。
