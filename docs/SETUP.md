# Setup — first iteration

## 1. Create the Google Drive folder

Create a folder called:

`Islamabad Events Inbox`

Copy its folder ID from the Drive URL.

You can save screenshots into this folder directly from Android using the Google Drive share action.

## 2. Create the review spreadsheet

Create a Google Sheet called:

`Islamabad Events`

Copy its spreadsheet ID from the URL.

You do **not** need to create columns manually; `setupProject()` does it.

## 3. Get a Gemini API key

Create a Gemini API key in Google AI Studio.

Do not paste the key into source code.

## 4. Create an Apps Script project

At script.google.com create a new standalone Apps Script project.

Create these script files and paste in the matching repository files:

- `Config.gs`
- `Main.gs`
- `Gemini.gs`
- `Sheet.gs`
- `Utils.gs`

## 5. Set Script Properties

In Apps Script:

Project Settings → Script Properties

Add:

- `GEMINI_API_KEY` = your Gemini API key
- `INBOX_FOLDER_ID` = Drive folder ID
- `SPREADSHEET_ID` = Google Sheet ID

Optional:

- `GEMINI_MODEL` = model name

If `GEMINI_MODEL` is omitted, the value in `Config.gs` is used.

## 6. Run setup once

From the Apps Script editor, run:

`setupProject`

Google will ask you to authorize Drive, Sheets and external requests.

This creates:

- the `Events` sheet and headers
- a time-driven trigger that runs `processInbox` every 5 minutes

## 7. Test

Put ONE clear event screenshot into `Islamabad Events Inbox`.

Then either:

- wait for the trigger, or
- manually run `processInbox`

A row should appear in the `Events` sheet.

## 8. Review

The most important columns initially are:

- `status`
- `title`
- `start_date`
- `start_time`
- `venue`
- `price`
- `confidence`
- `uncertain_fields`
- `original_image_url`
- `error`

For a successful extraction, status starts as `pending`.

After checking/editing the event manually, change it to `approved` or `rejected`.

## Retry a failed image

If processing fails, the row has status `error`.

Fix the underlying problem, then run:

`retryErrors`

The script will retry the source files represented by error rows.

## Important V1 behavior

The script never edits or deletes the original screenshot.

It records the Drive file ID in Script Properties after a successful extraction, so normal inbox scans do not create the same row repeatedly.

For an error, it records an error row but leaves the file retryable.

Duplicate-event and changed-poster detection are not included yet. Those should be added after testing this extraction pipeline on real Islamabad posters.
