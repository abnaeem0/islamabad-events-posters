# CLAUDE.md

## About me
- I'm not an experienced developer. Explain trade-offs simply and warn me before hard-to-undo changes.
- Recommend the fastest workable setup outright (for example local over hosted when only I use it) instead of listing options for me to pick from.
- Push back on low-value or premature work. Prefer the simplest thing that works. Only add a feature when a real screenshot shows a real problem.
- A missing listing is better than a wrong one on the website.
- Give me one small piece at a time, not everything at once.
- I review daily but can miss a few days, and slow screens make me give up halfway. Whatever you build must work with little review and must be fast and resumable.

## Workflow
- Read `PLAN.md` before starting any task.
- In **every commit**, update `PLAN.md` (check off finished items with a short note on what changed and why, move or add bugs, add dated decisions) and update the project map below if files were added, moved or removed.
- Only two coordinating files exist: `CLAUDE.md` and `PLAN.md`. Do not create TODO.md, BUGS.md, notes or plan files. Everything goes in `PLAN.md`.

## Rule
Use the project map below to find relevant files instead of reading the whole repo. Update the map when files are added, moved or removed.

## What this project is
An Islamabad events and things-to-do guide, built from my Instagram screenshots, for hotel guests visiting Islamabad and for people who live here.

Flow: phone screenshot -> Google Drive inbox -> Apps Script + Gemini -> Google Sheet -> GitHub build (scheduled hourly, but GitHub often runs it only every few hours) -> public site at https://abnaeem0.github.io/islamabad-events-posters/

- The repo is **public**. Never commit API keys or tokens. They live in Apps Script Script Properties and GitHub repository secrets.
- Free tier only: Gemini has daily and per-minute limits, and Apps Script stops a run after 6 minutes. No paid models or services.
- My Gemini key is free-tier. Google says free-tier content is used to improve its products, so anything in the inbox folder may be seen by Google. Google Search grounding (used by `Research.gs`) is listed as not available on the free tier.
- There is one codebase. An earlier idea of building a separate "v2" is dropped. Its good ideas are folded into this code (see `PLAN.md`).
- Screenshots arrive named with the app name first, then a timestamp. Grouping relies on that timestamp. I plan to send from an iPhone too, which names files differently.

## Project map

**Entry points**
- Apps Script: `setupProject()` in `apps-script/Main.gs` (one-time setup) and `processInbox()` (runs every 5 minutes on a trigger).
- Spreadsheet menu: `onOpen()` in `apps-script/ReviewUI.gs`.
- Website build: `scripts/sync.mjs`, scheduled hourly at :17 (in practice every 2 to 7 hours) by `.github/workflows/pages.yml`.

**Config**
- `apps-script/Config.gs`: sheet headers, statuses, default Gemini model, supported image types, size limits. Secrets come from Script Properties.
- `.clasp.json`: links `apps-script/` to the Apps Script project.
- `package.json`: website dependencies and scripts.

**Data** (no database; Google Sheet tabs are the data store)
- `apps-script/Sheet.gs`: creates and writes the raw `Events` tab.
- `apps-script/EventsPipeline.gs`: builds the Upcoming Events, Event Records, Places & Activities and Event Review tabs from the raw tab. Tab names are defined in `PIPE`.
- `apps-script/TextArchive.gs`: permanent copy of original extracted text.
- `apps-script/VenueDirectory.gs`: remembered, confirmed venues and addresses.
- `apps-script/ListingSettings.gs`: per-listing approval, expiry and location notes.
- `apps-script/Workflow.gs`: locks, job leases, version stamps, Gemini usage counters, `scriptJson_` escaping helper.
- `docs/data/listings.json`: the published snapshot (generated, do not edit by hand).

**Gemini and AI**
- `apps-script/Gemini.gs`: the extraction prompt, JSON schema, and the shared Gemini request with backoff on 408/429/5xx.
- `apps-script/Companions.gs`: decides whether two screenshots are the same event or place.
- `apps-script/Screenshots.gs`: groups consecutive screenshots (not called by `processInbox` today).
- `apps-script/Research.gs`: on-demand Google Search lookup for missing details. Probably does not work on a free key; untested.
- `apps-script/Sharing.gs`: crop suggestion prompt, crop storage, legacy publishing, WhatsApp captions.

**Matching and cleanup**
- `apps-script/Matching.gs`: duplicate, update and reschedule rules.
- `apps-script/Normalize.gs`: date, time (strict 24-hour `HH:MM`) and phone cleanup.
- `apps-script/Utils.gs`: small helpers and "processed file" flags.

**Review and bulk actions**
- `apps-script/ReviewUI.gs` + `ReviewDialog.html`: the review popup and `saveVisualDecision`. Slow today: `vrImage_` sends full base64 images, and every save re-reads tabs and runs `refreshEventViews_`.
- `apps-script/BulkActions.gs` + `BulkDialog.html`: move, copy, return and set venue for many entries.
- `review/index.html`: the local review page, opened from disk on my office computer. Reads the list from `apps-script/LocalReview.gs` (endpoint action `review_list`) and loads screenshots from the Google Drive for desktop folder. Uses its own `LOCAL_REVIEW_TOKEN` (read the review list only), typed into the page and kept in that browser only, never in the repo.
- `apps-script/MenuActions.gs`: menu shortcuts, Trash and Trash restore.
- `apps-script/ResearchHolding.gs`: the private "Research" parking tab.
- `apps-script/ShareDialog.html`: crop editor and caption tool.

**Publishing**
- `apps-script/GitHubExport.gs`: authenticated `doPost` endpoint the GitHub Action calls (manifest, image files, ack), plus `review_list` for the local review page. Serves only JPEG/PNG up to 6 MB.
- `apps-script/PublicationAudit.gs`: compares the live site with the Sheet and flags stuck listings.
- `apps-script/PublicOutbox.gs`: removal queue for the old non-GitHub publishing path.
- `apps-script/SetupGitHub.gs`: one-time token and Pages URL setup.
- `apps-script/FreshStart.gs`: destructive reset of generated tabs. Backs up first.
- `scripts/sync.mjs`: pulls the manifest and images, crops posters, builds the site, swaps `docs/`.
- `scripts/crop.cjs`: generated bundle of `src/crop.ts`. The crop is a plain rectangle cut and the decoder caps images at about 5 megapixels.
- `scripts/build.mjs`: bundles `src/` into `docs/assets/app.js` and `scripts/render.cjs`.
- `.github/workflows/pages.yml`: hourly build and deploy. `.github/workflows/sync-apps-script.yml`: uploads `apps-script/` to Google when it changes on `main`.

**Website source**
- `src/Noticeboard.tsx`, `main.tsx`, `render.tsx`, `location.ts`: the React page. `docs/` is the published site (generated), plus `docs/SETUP.md` and `docs/EVENT_SCHEMA.md`.

**Tests** (all currently pass)
- `tests/*.cjs`: Apps Script logic, using a fake Google environment in `tests/harness.cjs`. Run each with `node tests/<name>.cjs`.
- `scripts/*.test.mjs`: export and site checks. `npm test` runs only `scripts/site.test.mjs`.

**Other**
- `README.md` is out of date. `samples/sample-event.json` is not used by any test.

## Hard to undo: warn me first
- `FreshStart.gs` (clears generated sheets).
- Changing sheet columns, headers or tab names. The code checks them and can break.
- Deleting Script Properties, especially the "processed" flags (files would be re-read by Gemini).
- Anything that publishes to, or removes items from, the public site.
- Pushing to `main`: it rebuilds the live site, and changes under `apps-script/` upload to the live Apps Script project.

## Other cautions
- `docs/`, `scripts/render.cjs` and `scripts/crop.cjs` are generated. Change `src/` and rebuild.
- Failed Gemini calls set shared pause flags. Test in a separate copy of the Sheet and script with its own API key, never the live project.
- Test `Research.gs` lookups only in the test copy. If Google refuses one with HTTP 429, the shared Gemini pause starts and extraction stalls.
- Anything dropped in the inbox folder is sent to Gemini. Keep private screenshots out of it.
- My own corrections must never be overwritten by AI results.
