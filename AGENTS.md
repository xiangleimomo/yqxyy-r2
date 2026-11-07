# Story Fox English — Codex Cloud guide

## Project

This is the R2-backed copy of the static English-learning site. Build with `npm run build` and publish `dist/` on Netlify. The site entry point is `index.html`. See README.md for the new account deployment procedure.

Resource data is stored only in R2. Never commit `data/`, credentials, local logs, or generated `dist/`. `/data/*` is served by `netlify/edge-functions/r2-data.js`; server-side resource reads use `netlify/lib/r2.mjs`. Keep the existing Supabase project and frontend configuration. Legacy workflows are archived in `docs/legacy-workflows/` and are not active. Run `npm test`; older tests requiring local data need a separate local content checkout.

## Important locations

- `js/app.js`: application flow, lesson windows, HLS video/audio playback, and learning progress.
- `css/style.css`: site and learning-window styling.
- `data/series-list.json`: catalogue and level grouping.
- `data/<series-id>/series.json`: series metadata.
- `data/<series-id>/episodes.json`: episode titles, modules, and media sources.
- `data/<series-id>/reading-lessons.json`: public reading text, keyed by episode number.
- `data/<series-id>/vocabulary.json`, `quiz.json`: optional learning content, keyed by episode number.
- `netlify.toml`: static-site deployment configuration.

## Working rules

1. Before editing, inspect the affected data shape and relevant UI code.
2. Preserve existing HLS, Bilibili, direct-link, and local-video behavior unless a request explicitly changes it.
3. `Listen and Read` uses the episode `video.hlsUrl` as an audio-only `<audio>` source; do not show a video frame there.
4. Do not mass-reformat JSON or modify unrelated series. Large data imports require an explicit user request and a repeatable script in `scripts/`.
5. Do not add access tokens, API keys, or private URLs to source control. Keep `.env` files untracked.
6. Keep the interface bilingual where the existing screen is bilingual.
7. Prefer a small, focused commit per user request. Do not force-push or overwrite remote work.
8. Player UI changes default to desktop only. Modify mobile behavior only when the user explicitly requests it.

## Verification

Run the checks relevant to the change before committing:

```sh
node --check js/app.js
git diff --check
```

For a browser preview, run:

```sh
python3 -m http.server 8000
```

Open the forwarded port 8000. For player changes, verify that Watch remains video-capable and Listen and Read shows only the audio player plus reading text.

## Delivery

After tests pass, report changed files, verification results, and the commit or pull-request URL. Changes merged or pushed to `main` are automatically deployed by Netlify.
