# Little Fox incremental worker

**Only scheduled GitHub Actions -> official current episodes -> verified lessons -> R2.** No Netlify build, Supabase queries, video rehosting, old 720p scanning, or repository data commits.

Entrypoint: `node automation/littlefox-daily/run.mjs`.
Tests: `node --test automation/littlefox-daily/*.test.mjs`.
The schedule and secrets are declared in `.github/workflows/littlefox-daily-r2.yml`.
Full runbook: `docs/LITTLEFOX_GITHUB_ACTIONS_R2.md`.

Manual dispatch defaults to dry-run. Scheduled dispatch can publish only after resource verification, bilingual paragraph alignment, evidence-bound quizzes, an independent model review, R2 readback, and public site verification. Secrets are never written to source control.

Pone is an optional large-file adapter (`pone.mjs`), not the destination for JSON/HTML/VTT/XML; HLS streaming source links are referenced rather than mirrored. It is disabled unless approved and configured.