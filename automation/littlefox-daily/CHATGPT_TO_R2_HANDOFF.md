# Little Fox V2: ChatGPT → GitHub Actions → R2

## Ownership (2026-11-10)

**ChatGPT daily scheduled task** owns release discovery and teaching material. It checks the official Little Fox calendar; determines title, series and episode; finds a C ID by verified first-episode Text anchor + offset, then R2 prior episode + gap, otherwise asks for manual help. It retrieves and checks the actual official English Text, Chinese Text, Storybook and subtitle XML, builds V2 reading/plot segmentation/vocabulary/Quiz, performs a separate content review and writes a **reviewed JSON** to `automation/littlefox-daily/outbox/Cxxxxxxx.json`.

**GitHub Actions** owns video resolution and publishing only. For an approved outbox, it re-fetches the official source by C ID using `readPlayer()`, validates playlist, checks the official Text and XML, checks Quiz evidence and R2 duplication, backs up changed R2 indexes, publishes and reads back results. It must not create AI lessons or call an AI model API. It may read metadata from the existing legacy `inbox/`, but must not require it for ChatGPT's daily task.

The previous `littlefox-collect-handoff.yml` is kept **manual only** to avoid duplicate scheduled discovery. The legacy `littlefox-daily-r2.yml` is also manual-only and must never be used as the new publisher without refactoring.

## Outbox protocol

Path: `automation/littlefox-daily/outbox/<contentId>.json`, once per **new, reviewed** C ID. Never edit an existing outbox item to replace already published content.

Minimum JSON shape (field names are normative; values shown are placeholders, not a real lesson):

```json
{
  "schemaVersion": 1,
  "status": "ready_for_publish",
  "reviewStatus": "approved",
  "seriesId": "little-fox-example-fs0000",
  "episodeNumber": 1,
  "contentId": "C0000000",
  "title": "Example Episode",
  "level": 4,
  "releaseDate": "2026-11-10",
  "officialSourceUrls": {
    "textOriginal": "https://cn.littlefox.com/cn/supplement/org/C0000000",
    "textTranslated": "https://cn.littlefox.com/cn/supplement/trans/C0000000",
    "caption": "https://cdn.littlefox.com/contents/caption/C0000000.xml",
    "storybook": "https://res.littlefox.com/en/supplement/load_pdf/C0000000"
  },
  "sourceVerification": {
    "englishText": true,
    "chineseText": true,
    "storybook": true,
    "subtitleXml": true,
    "episodeTitleMatched": true
  },
  "captionMetadata": {"cueCount": 0},
  "sections": [],
  "vocabulary": [],
  "quiz": {"questions": []},
  "reviewNotes": "Reviewed against this episode's official story, source and level."
}
```

For real courses, fields marked verified must reflect actual source reads. For level 0–2 where a new Quiz is not required by the current V2 policy, `quiz: null`. For level 3–9 narrative lessons, provide five reviewed story-comprehension questions with four distinct English choices, one answer, specific Chinese explanations and paragraph-ID evidence.

**Copyright and auditability:** Do not commit the full official English/Chinese Text, XML transcript, Storybook bytes or video. Do not fill the public outbox with full-text evidence quotes. Store paragraph IDs and optional *short* source excerpts; the publisher should re-fetch authoritative Text and regenerate full reading paragraphs and paragraph evidence in R2 after verification, applying applicable licensing requirements. Lesson materials authored by ChatGPT, including vocabulary, teacher explanations and original quiz questions, may be in outbox.

## Fail closed and status semantics

- Outbox is **not** evidence of R2 publication; `ready_for_publish` means it is a candidate only.
- A missing source, inconsistent title/C ID, incomplete quiz or wrong episode sequence blocks the item.
- Video resolution and R2 writes happen only in the **separate GitHub publisher** after schema and official-source verification. The publisher must not execute untrusted code from the outbox.
- Avoid overwriting existing lessons. Perform R2 deduplication by episode number and C ID; if already present, report `already_published` and stop.
- The publisher writes mutable indexes last, reads back the uploaded objects and performs website read-only checks without triggering a Netlify deployment.
- ChatGPT reports the GitHub commit SHA after a successful `fetch_file` readback. It never claims R2 publication until the GitHub publisher's report confirms it.
- Do not activate any paused historic GitHub Actions; do not modify the website, Netlify, Supabase or the full-site GitHub `data/` tree.

## Validation before live use

The new outbox-based R2 publisher is a **separate implementation** from the legacy GitHub AI-generation workflow. Until an actual outbox schema validator, publisher and isolated end-to-end dry run have been verified, the interface is a **documented handoff contract**, not a claim that R2 publishing is already operational.
