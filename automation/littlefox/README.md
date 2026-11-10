# yqxyy · Little Fox Incremental Course Engine

This is a standalone back-end worker. **It is not part of the yqxyy website build and never requires editing site code or redeploying Netlify.** Published lesson data lives only in Cloudflare R2.

## Contract (2026-11-10)

- **When:** Monday–Friday, **14:00 Beijing time** (`06:00 UTC`, `0 6 * * 1-5`).
- **Scope:** only new Little Fox episodes published that day; never run historical 720P/1080P scan.
- **Inputs:** discover scheduled new episode, identify and validate its `Cxxxxxxx` ID. Read the actual player to obtain/verify m3u8; use matching official Storybook PDF, `/cn/supplement/org/{C}`, `/cn/supplement/trans/{C}`, and `/contents/caption/{C}.xml`.
- **Course:** use verified English + Chinese paragraph pairs as evidence for reading, vocabulary, and episode-specific questions. Under existing V2 level policy, new level 0–2 episodes do not automatically create missing quizzes; story-level 3–9 quizzes must be four-choice, 5 questions, with specific Chinese explanations and source citations.
- **Publish:** backup existing R2 JSON; write assets, read back and verify; write `data/{seriesId}/episodes.json` after assets; update `data/series-list.json` last; store a report at `data/__littlefox-sync/reports/YYYY-MM-DD.json`.
- **On failure:** report and leave that episode unannounced. Do not fabricate resource URLs, content IDs, or reading sentences.
- **Deployment:** independent Supabase Edge Function + Cron; **never deploy via Netlify** and **never restart the previously paused GitHub Actions**.

## Structure

- `core.mjs` – standalone, testable daily synchronization engine
- `run.mjs` – optional Node 22+ CLI for smoke tests or independent worker hosting
- `tests/core.test.mjs` – deterministic mocks and tests (no live R2 writes)
- `supabase/littlefox-daily/index.ts` – standalone Supabase Edge Function entrypoint
- `supabase/littlefox-daily/deno.json` – pins aws4fetch for Edge runtime
- `supabase/SCHEDULE.sql` – disabled-by-default reference for final Cron configuration

## Run tests

```sh
npm install
npm test
```

## Required secrets and gates

Configure **in the independent worker's secret environment**, not in the website:

| Name | Purpose |
| --- | --- |
| `R2_ENDPOINT` | Cloudflare S3 endpoint (no credentials in URLs) |
| `R2_BUCKET` | `yqxyy-resources` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 writer credentials restricted to required bucket/prefix |
| `LF_OPENAI_API_KEY` | Model API credential for course materials (not a ChatGPT subscription) |
| `LF_COURSE_MODEL` | Compatible model ID |
| `LF_RUN_ENABLED` | `1` only after live extraction is verified |
| `LF_DRY_RUN` | Default dry run unless explicitly `0` |
| `LF_ALLOW_PUBLISH` | `1` only after approved R2 staging test |

The HTTP Edge Function is deployed with `verify_jwt=true`. Its invocation token is a Supabase project JWT stored securely in Vault, never in source code. Schedule it with `pg_cron` + `pg_net` only after the function and credential configuration have been tested.

## Progress / production status

- Ready: fixed C-ID resource address rules, R2 JSON file layout, publication order, duplication safeguards, bilingual alignment guard, model generation interface, 15 automated mock tests.
- Not yet live-verified: real publishing calendar markup, C-ID player handshake on the host, official XML shape, `/org/` and `/trans/` HTML parsing, real AI API output, R2 credential permissions, actual website lesson rendering.
- **Do not claim this is fully automatic in production until a real full episode passes read-back and site inspection.**