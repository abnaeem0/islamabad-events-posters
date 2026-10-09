# Event schema

V1 keeps extraction fairly literal. If the poster does not clearly provide a value, Gemini should return `null` rather than guess.

| Field | Meaning |
|---|---|
| `id` | Internal generated event-record ID |
| `status` | `pending`, `approved`, `rejected`, or `error` |
| `title` | Event name/title |
| `start_date` | `YYYY-MM-DD` when known |
| `end_date` | `YYYY-MM-DD` when known |
| `start_time` | `HH:MM` 24-hour time when known |
| `end_time` | `HH:MM` 24-hour time when known |
| `venue` | Venue/place name |
| `address` | Address/location text on poster |
| `organizer` | Organizer/host |
| `price` | Human-readable price, e.g. `Free`, `PKR 1,500`, `From PKR 2,000` |
| `contact` | Phone/WhatsApp/email/other contact text |
| `registration_url` | Registration/ticket URL printed or encoded clearly on poster |
| `description` | Short factual description based only on poster |
| `categories` | Small array of useful categories inferred from poster |
| `age_info` | Explicit age/audience restriction if shown |
| `source_platform` | Usually manually/automatically set to `instagram_screenshot` for V1 |
| `source_account` | Instagram/account/organizer handle if visible |
| `confidence` | `high`, `medium`, or `low` overall extraction confidence |
| `uncertain_fields` | Array naming fields that are ambiguous/unclear |
| `original_image_file_id` | Google Drive file ID |
| `original_image_url` | Link to untouched source screenshot |
| `original_filename` | Original Drive filename |
| `processed_at` | ISO timestamp |
| `error` | Processing error text, if any |

## Rules

- Never invent missing dates, times, prices, addresses, contacts or URLs.
- Preserve the original screenshot as evidence.
- `description` should summarize what the poster says, not add web research.
- If a poster shows several dates/times that cannot cleanly fit one event record, mark the relevant fields uncertain and explain briefly in `extraction_notes`.
- A future iteration may split multi-session events into occurrences.
