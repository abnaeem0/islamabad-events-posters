# Islamabad Events — collection and guest information service

Collect Islamabad event posters from Android screenshots, extract their details using Gemini, retain original evidence, and maintain a deduplicated list of upcoming events. The immediate use is helping the hotel's guests and Islamabad-based customers arranging stays for visitors. WhatsApp digests tailored to the next week, two weeks or month are potential outputs; distribution and any public website are **not yet implemented**. Tag filtering, semantic search and cropping can wait.

## Current pipeline (V3 proposal)

Android screenshot → Google Drive inbox → Apps Script / Gemini → Google Sheet.

- **Events**: raw extracted observations, append-only source data, including repeated posters. The original 26 V1 columns are retained, followed by four grouping metadata columns. Existing rows are not deleted or migrated automatically.
- **Upcoming Events**: one consolidated record per event ID, regardless of how far away the future date is. Past events vanish from this view; source observations remain stored. Rebuild fills blank fields but preserves existing populated canonical fields, including manual edits.
- **Event Review**: only unresolved uncertainty, missing identity/date and conflicting details, grouped by event ID. Choose a dropdown action, then the installed edit trigger immediately runs `refreshEventViews` (or run it manually if the trigger is unavailable). Resolved rows disappear from this tab, not from the raw archive.

### Review actions

- `Merge suggested`: assign the source record to the suggested group.
- `Keep separate`: retain its separate group and suppress this suggestion.
- `Dismiss warning`: acknowledge the issue, keeping the current canonical fields.
- `Use source details`: overwrite populated canonical fields with the selected source's nonblank fields.

Different event dates are considered separate events even if names match, unless explicit reschedule language suggests a **manual review**, never an automatic date merge. Identical title/date/venue and strong variants may auto-merge. Matching is heuristic: inspect the digest window before distributing anything.

## Reliability and data conventions

- Preserve every original poster link; never delete or crop it during ingestion.
- Multiple events in one poster become distinct source rows, linked to that poster.
- Pakistani mobile numbers are saved as a JSON array of E.164 strings (e.g. `["+923001234567"]`); nonmobile contacts are preserved as written.
- Missing values become empty cells; retain uncertain notes when needed.
- Failed Gemini requests remain retryable on subsequent scans. A file with source observations already written is not reinserted on retry.
- Avoid overwriting manual edits. The main list can be checked only when preparing a selected WhatsApp digest period.

## Code responsibilities

| File | Responsibility |
| --- | --- |
| `Config.gs` | Script properties and original schema |
| `Main.gs` | Inbox/trigger coordination |
| `Gemini.gs` | Poster extraction, structured array output |
| `Normalize.gs` | Phone/date/text normalization |
| `Matching.gs` | Pure duplicate and reschedule matching policy |
| `EventsPipeline.gs` | Raw storage, canonical grouping, review decisions |
| `Sheet.gs`, `Utils.gs` | V1 sheet operations and helpers |

**Deployment:** Follow [docs/SETUP.md](docs/SETUP.md). Deploy on a test copy before updating the running script. GitHub does not deploy Apps Script automatically. Keep API keys in Apps Script Script Properties, never GitHub.

**Constraints:** About 10 posters per day; free tools preferred; budget ideally zero, at most about PKR 500/month. The user can submit posters entirely from Android. There is no automatic WhatsApp sending or website in V3.
