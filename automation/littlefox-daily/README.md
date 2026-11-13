# Little Fox incremental worker

**Only scheduled GitHub Actions -> official current episodes -> verified lessons -> R2.** No Netlify build, Supabase queries, video rehosting, old 720p scanning, or repository data commits.

Entrypoint: `node automation/littlefox-daily/run.mjs`.
Tests: `node --test automation/littlefox-daily/*.test.mjs`.
The schedule and secrets are declared in `.github/workflows/littlefox-daily-r2.yml`.
Full runbook: `docs/LITTLEFOX_GITHUB_ACTIONS_R2.md`.

Manual dispatch defaults to dry-run. Scheduled dispatch can publish only after resource verification, bilingual paragraph alignment, evidence-bound quizzes, an independent model review, R2 readback, and public site verification. Secrets are never written to source control.

Pone is an optional large-file adapter (`pone.mjs`), not the destination for JSON/HTML/VTT/XML; HLS streaming source links are referenced rather than mirrored. It is disabled unless approved and configured.

> **AI credentials:** GitHub Models retired on July 30, 2026. For real V2 course generation, configure a separately billed GitHub Actions secret `LF_OPENAI_API_KEY` (or implement and verify another current provider). Without it, the pipeline fails closed and never publishes partial lessons.
## C ID lookup (2026-11-10)

- Use the monthly calendar only to identify the release date, series and title. Its `Chapter N` / local label is NOT necessarily the absolute episode number across a multi-arc series.
- Resolve the exact title in the official full-series catalog (`contents_list_v2/FSxxxx`) and use that entry's one-based position as the canonical `seriesEpisodeNumber`. Keep the calendar's number separately as `calendarEpisodeNumber` for traceability. If the exact title cannot be found uniquely in the official catalog, stop; never silently substitute the calendar label.
- Prefer a confirmed official first-episode Text C ID (or an unambiguous episode-1 entry in the official series catalog); calculate `firstCId + (episodeNumber - 1)`. The confirmed Happy Prince example is episode 1 `C0013521` -> episode 16 `C0013536`.
- The official catalog/calendar may also provide the target C ID directly. Every candidate must be verified against the official player response and expected episode title; a successful HTTP response alone is insufficient.
- If the first-episode path is unavailable or fails validation, use the latest earlier recorded episode in R2 `data/<seriesId>/episodes.json` and add the episode-number gap. No last-three-consecutive rule.
- If both fail, stop that episode and report attempted IDs with `manual assistance required`; do not publish or invent a C ID. Additional series' first-episode anchors must be obtained from official sources and explicitly vetted, never guessed.
- The current preverified first-episode anchor is kept in `core.mjs`. This change does not create or update the live R2 catalog, website, Supabase or Netlify. Existing GitHub Actions remain in their current enabled/disabled state.

Validation: `node --test automation/littlefox-daily/core.test.mjs` in a normal Node.js checkout. The repository unit tests use mock official responses and do not prove live website/R2 connectivity.

## Official catalog C-ID discovery (2026-11-13)

The scheduled GitHub collector reads the official monthly calendar, then matches the exact episode title in the official full-series catalog `contents_list_v2/FSxxxx`. That catalog entry supplies both the absolute series episode position and its `data-fcid` C-ID. The collector uses this official C-ID directly, then verifies the official player title, M3U8, English Text, Storybook and caption XML before handing off the source artifact. It does not discard the catalog C-ID or depend on third-party search results. If the exact catalog title is missing or ambiguous, the episode remains blocked; no C-ID is guessed. ChatGPT receives only the verified source artifact and handles the teaching materials; GitHub then handles R2 publishing.
