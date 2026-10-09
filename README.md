# Islamabad Local Events Feed — V1

A low-maintenance, human-curated Islamabad events pipeline.

## V1 scope

Android screenshot → Google Drive inbox → Google Apps Script → Gemini vision extraction → Google Sheet review.

This first iteration deliberately stops at the review sheet. It does **not** publish to the website yet.

## What V1 proves

1. A screenshot can be saved from an Android phone into one Drive folder.
2. Apps Script discovers it automatically.
3. Gemini extracts useful event information from the poster.
4. The original untouched screenshot remains the evidence/source.
5. A human can review/edit the extracted row in Google Sheets.
6. Failures are visible and can be retried.

## Repository

- `apps-script/` — paste these files into one Google Apps Script project.
- `docs/SETUP.md` — exact setup steps.
- `docs/EVENT_SCHEMA.md` — event fields and conventions.
- `samples/` — example extracted record.

## V1 operating assumptions

- Roughly 10 new posters/day.
- Input is primarily screenshots from Instagram on Android.
- Original screenshots are never altered or deleted by the script.
- Google Drive stores images; GitHub stores code only.
- Google Sheets is the review interface/database for now.
- Free services are preferred and operating spend should remain near zero.
- Human approval is required before future publication.
- Duplicate/update detection is intentionally deferred until we have real extracted data to test against.

## Security

Do not commit your Gemini API key. Store it in Apps Script **Script Properties** as `GEMINI_API_KEY`.
