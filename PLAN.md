# PLAN.md

Last updated: 2026-11-01. This is the only plan file: priorities, later work, bugs, decisions and open questions all live here. Update it in every commit. Within each section, hard-to-undo and foundational items come first.

Background: the Claude doc "Islamabad Events: Crop, Category and Workflow Plan" (https://claude.ai/artifact/MRqKvJqzCzcGwifQGEkg5m) holds the longer early discussion and the V1 prompt text. It is no longer updated; this file is the source of truth. Once `Prompts.gs` exists, the prompts live there. The "Islamabad Out & About: Requirements" doc has not been seen.

## Current priorities
Build one small piece at a time. Nothing below is started.

**1. Foundations (hard to undo, or everything else depends on them)**
- [ ] (On hold 2026-11-01: not possible right now.) Safe test copy: copy of the Sheet and Apps Script, a separate test Drive inbox, its own Script Properties, and a separate free Gemini API key. Leave `PUBLICATION_TARGET` unset so it cannot publish. Why: failed Gemini calls set shared pause flags, and pushes to `main` change the live script.
- [ ] Create `Prompts.gs` with the current prompts moved over unchanged as V1. Store `prompt_version` and Gemini's raw JSON answer with each extraction. Why: lets us compare prompt versions and re-run old data later. No behaviour change.
- [ ] Add the new fields (see "Tags and value" and "Dates") inside the existing `companion_clues` JSON, so no sheet columns change.
- [ ] Build judgments (kind, why_useful, tags, local_relevance) as a separate text-only second step. The image call only extracts facts and boxes. Why: when I change categories, I re-run the saved text, not the images. New uploads by default; old posts can be re-run to test a prompt.
- [x] Check the saved text is complete (2026-11-01). Gemini now returns `page_text` once per screenshot (all readable text of the main post); it is stored in the Text Archive `visible_text` column, capped at 20,000 characters (Sheets cell limit is 50,000). The per-event `visible_text` stays a short excerpt so the Events tab stays small. Applies to new uploads only; old archive rows keep the short text. No sheet headers changed.

**2. Review speed (my biggest daily pain: loading images, and saving)**
- [ ] Measure first in the test copy: time the dialog opening, the image load and the save separately. Likely causes, from reading the code (not timed): (a) images are sent as full base64 text through `google.script.run` (`vrImage_`, up to 6 MB each; thumbnails only in preview mode); (b) a save (`saveVisualDecision`) can read whole tabs up to 11 times, rebuilds the canonical list up to 4 times, then rebuilds all derived views (`refreshEventViews_`) and reformats dates.
- [ ] Quick win 1: load images as Drive thumbnails that the browser fetches directly, and prefetch the next item's images. Needs a test; it may be blocked inside the dialog in some browsers.
- [ ] Quick win 2: make save return fast. Write only the decision, run the view rebuild shortly afterwards on a trigger, and drop the item from the dialog straight away.
- [ ] Short daily queue, most important items first. Items I skip still follow the publish tiers, so missing days stalls nothing. Every action saves on its own, so stopping halfway loses nothing.
- [ ] Review outside the Sheet (my wish, 2026-11-01): a review page on my computer that shows screenshots straight from the Drive inbox (synced by Google Drive for desktop, so images load from disk) and sends each decision to a small Apps Script endpoint that writes one row and returns. The heavy view rebuild runs later on a trigger. Only on my office computer (answered 2026-11-01), so a local page, no hosting. Step 1 built 2026-11-04: `review/index.html` (open by double-clicking) lists the Event Review items via a new read-only `review_list` endpoint action (`apps-script/LocalReview.gs`, no lock, so it never blocks saves or builds) and shows screenshots straight from `G:\My Drive\Islamabad Events Inbox`, with an "Open in Drive" fallback. Publication-audit rows are left out for now. The page uses its own `LOCAL_REVIEW_TOKEN` (made by `setupLocalReviewToken`), which can only read the review list; the GitHub token can no longer read it, and the review token cannot export or download files. Why: the GitHub token can download any JPEG/PNG the script can reach, so it should not sit in a browser. Needs a new Web App version once before it works. Steps 2 and 3 done 2026-11-04: the page now does everything the Sheet's review dialog does (all decisions: merge, duplicate, separate, dismiss, edit, research, places, not local, return to events; field picking and editing, descriptions, Gemini collate, venue lookup, approve as-is, expiry, location note, shared venue ticks, publishing check, zoom), by calling the same Apps Script functions through the endpoint action `review` (`apps-script/LocalReview.gs`). It also covers the Upcoming events, Places & activities and Research tabs. Better than the Sheet: screenshots load from disk, the next entry is fetched in advance, "Save and next" (or Ctrl+Enter) moves on at once and saves in the background (a failed save shows a red bar with "Open it again"), and saves skip the slow rebuild of the other tabs (marked out of date; the next inbox run rebuilds them within about 5 minutes). Not on the page yet: the crop editor ("Fix poster crop" opens the Sheet). The dialog part of `review/index.html` is a port of `apps-script/ReviewDialog.html`; change both until the Sheet dialog is retired.

**3. Dates (old posts get the current year)**
- [ ] Extraction V2 returns `date_basis` (`printed_year`, `weekday_matched`, `assumed_year`, `relative`, `guessed`), `printed_weekday`, and `post_date_text` (publish date or age if visible, such as "12 Oct 2025" or "3w"). Pass the screenshot capture time as a hint used only for relative dates like "this Saturday".
- [ ] Code check (Normalize or EventsPipeline): when the year is not printed, test the printed weekday against the assumed year. If it does not match, try the previous and next year and use the one that does, otherwise mark `guessed`. Impossible dates (30 Feb, 29 Feb in a non-leap year) are already rejected by `validDateKey_`.
- [ ] A date with an assumed year and no weekday match or post-age evidence is medium tier: it goes to "Dates to be confirmed" and never shows as Upcoming.
- [ ] After a week, count how many land in medium and adjust the rule.

**4. Crops and wrong organizers (most visible problem)**
- [ ] Extraction V2: add `post_region`, a top/bottom `artwork_box`, `venue_text` as written, and evidence quotes for organizer, account and venue. Why: stops handles from neighbouring posts becoming organizers or venues.
- [ ] Tighten `validCrop_` in `Sharing.gs`; use top and bottom only, at full width.
- [ ] In `src/crop.ts`: trim phone UI rows, snap top and bottom to blank rows, reject odd shapes (under about 60% of the width, ratio over about 3:1). Test on the posters already in `docs/posters`.
- [x] Make one bad image unable to block the whole site build (2026-11-01). `scripts/sync.mjs` now leaves out a listing whose image fails (bad crop, unsupported or oversized file, download error) and prints a yellow warning with its id, title and reason in the GitHub Actions run. If more than 3 listings (or a fifth of them) fail in one build, it keeps the old site instead, since that points to a wider problem. Test added in `scripts/export.test.mjs`. Skipped listings are also shown in the Sheet: Sharing → Publishing status lists what the last build left off (2026-11-04).
- [ ] Get a few original screenshots of the bad crops to test against.

**5. Small and mostly additive**
- [x] Manual grouping of one post's screenshots (2026-11-04), on the local review page instead of a Sheet menu: "Slides of this post" shows screenshots taken within 20 minutes of the current one; tick to link, untick to unlink. A screenshot with its own listing moves into this one (like Merge); one with no listing is attached as an extra image and marked processed so it is not extracted on its own. No Gemini call, no extracted text changed. Linked images become gallery candidates on the site (they still need a crop). A screenshot that produced several listings is attached as a supporting slide instead of moved, and one supporting slide (say, an address slide) can support several listings from the same post (2026-11-06).
- [x] Read all linked slides together (2026-11-06, wanted because extra slides often hold details the first one lacks). After linking, Gemini reads every linked screenshot of the listing at once (up to 6 images, one call) and suggests values for this listing's **missing** fields only, including for posts with several events (it only fills values that clearly belong to this listing or are shared by the whole post). Suggestions appear in the research box with "Use this value"; nothing is saved until I save, and filled-in fields are never replaced. Same answer is cached; the "Read all linked slides" button reads again. Daily cap 20 calls (`SLIDE_READ_USAGE`). `apps-script/SlideReading.gs`. Not tested against real Gemini yet; the prompt is new.
- [ ] Posting rules (see Decisions).
- [ ] Test whether the "Find venue" lookup (`Research.gs`) works on my free key, in the test copy only. If it is refused, disable its menu item.
- [x] Back-to-top button and open listings on the poster (2026-11-01, my request). A round ↑ button appears bottom-right after scrolling about two screens and jumps to the top. Clicking a poster (or opening a shared `?item=` link) now scrolls to the listing's poster instead of the top of the page, so the header no longer has to be scrolled past. "Back to the noticeboard" still returns to the top. Changes in `src/Noticeboard.tsx` and `docs/styles.css`.
- [ ] Area filter on the site: choose several sectors at once (F-6, E-7, F-8) instead of one. Today `area` is a single value in `src/Noticeboard.tsx` and in the URL (`?area=`), so this means a multi-select and a list in the URL. Check `src/render.tsx` and `scripts/site.test.mjs` too.

## Later
**Places and the weekly review**
- [ ] Place aliases and a "same as…" merge (Trail 5, Trail-5 Margalla, T5). The AI suggests; I confirm each one. Never merged automatically. `VenueDirectory.gs` has no aliases today.
- [ ] Weekly review stage 1, plain code: candidates (same title 3+ times in 90 days, same venue and organizer, repeat course providers).
- [ ] Weekly review stage 2, one text-only LLM call per batch: judge candidates, write suggestions into Review. Never edits listings directly.
- [ ] "Add to Places" action linking a venue to its past events. This is how a recurring workshop location becomes a thing to do; I confirm each one.
- [ ] Propose 10 to 15 clean filter groups from free-form tags, and group parked posts into ideas for Islamabad.
- [ ] Refresh `last_seen` when the same organizer appears again.

**Review app and tabs**
- [ ] Extras for the review page (after the basic page under Review speed works): side-by-side old and new, poster-level bulk actions, regroup control.
- [ ] Merge Research into Parked (private). Trash is for non-local posts with nothing worth keeping.
- [ ] Retire unused tabs after checking nothing depends on them: Companion Checks, Event Records, Publication Outbox, Publications.
- [ ] Grouping strip for new uploads, only if manual grouping shows it is needed. When grouping before extraction exists: merge neighbours by capture time, account and caption after a 2 to 3 minute settle wait, and let extraction flag "more than one post in this group" so the code splits it.

**iPhone support**
- [ ] Timestamp source in order: filename, then Drive metadata, then upload time. iPhone names look like `IMG_1234`, so bulk uploads would otherwise look like one burst.
- [ ] Publishing accepts only JPEG/PNG up to 6 MB, while extraction accepts HEIC, HEIF and WebP up to 15 MB. Close that gap before iPhone use.

**Public site**
- [ ] A weekend board: events first, then things to do. "Dates to be confirmed" strip, collapsed, below Upcoming.
- [ ] Things to do: activity chips (hiking, cycling, swimming) that also filter events; a place card lists the upcoming events held there; an offer shows as a limited-time note on its place card; products carry a "to buy" tag.
- [ ] Map, and a shortlist around my location (after the multi-sector filter).
- [ ] Past events: last 30 days visible, older ones rolled into series, search covers everything, pin option, "Older / Inspiration" toggle.
- [ ] "Report a problem" link, including "Know the date or time? Tell us". Suggestions land in Review and never change data. Optional "Publish now" button.
- [ ] Attribution and a "contact me to remove this" line.
- [ ] Google Search Console (wanted 2026-11-01). First step, no code: verify the site (DNS TXT record on the domain, or a meta tag Claude adds), submit `sitemap.xml`, then see what Google indexes. The site already has a title, description, canonical link, robots.txt and a one-URL sitemap.
- [ ] Analytics (wanted 2026-11-01): Google Analytics 4, loaded async so it does not slow the page. Pairs with Search Console in the same Google account. Track listing clicks (registration link, contact) as events.
- [ ] Later, only if Search Console shows few search visits: one page per listing with schema.org `Event` data, listed in the sitemap. Today everything is one page, so Google can show at most one result, and event rich results need a page per event.
- [ ] Update README (see Bugs).

**Flexibility extras (only after the basics work)**
- [ ] Settings tab for wording, thresholds and lists.
- [ ] Golden examples tab (10 to 20 screenshots with the right answer) used as prompt examples and a test set.
- [ ] Log of my overrides of AI answers.
- [ ] Research drop zone for links, notes, locations, voice notes and WhatsApp exports (goes into Parked).
- [ ] Price filters, calendar downloads, embedding-based search.

## Might consider in the future
- Maps lookup for venues (Google Places search or Gemini Maps grounding). Both need billing enabled; Gemini's pricing page lists Maps grounding as paid-tier only. Revisit if the budget changes. A free OpenStreetMap lookup might handle area-level matches; coverage of Islamabad venues not checked.
- Paid Gemini tier: turns off free-tier data use and enables Google Search grounding. Costs money.
- A 1 to 2 hour grace period before confident items publish. Start without it and see how often confident items are wrong.

## Tags and value (settled 2026-11-01; can keep changing)
Events are the backbone of the site. Everything else answers "what can I do on a day when no event suits me". For every post Gemini returns:
1. **kind**
   - `event`: anything dated that you can attend. This includes dated courses and workshops, markets, and day trips or longer trips that leave on a date.
   - `thing_to_do`: fixed things you can do on any day: waterfalls, trails, escape rooms, bowling, riding clubs, pools, standing courses, trip operators. Shown on the Things to do tab. The existing `place_type` (activity, experience, course, recurring_event, attraction, day_trip, restaurant) stays as its sub-label.
   - `product`: things to buy and use yourself, such as murder mystery games and craft kits. Placeless. Shown in Things to do with a "to buy" tag.
   - `not_useful`: nothing to do or buy in or from Islamabad.
2. **why_useful**: one sentence on what someone could do because of this post. Empty only when `not_useful`.
3. **local_relevance**: `islamabad_rwp`, `trip_from_here`, `not_local`.
4. **tags**: free-form, including activities (hiking, cycling, swimming). Activities are tags, not kinds.
5. **valid_until** (for time-limited items such as offers) and **recurrence** (only if printed on the post).

Also returned: `implied_facts`, `location_type` (`fixed`, `area_only`, `tba`, `multiple`, `online`, `trip`, `none`), and the date fields under "Dates".

**Offers are not a kind.** An offer is an advertisement that expires. It does two jobs: it shows as a limited-time note on its place while valid, and it leaves a lasting fact on that place ("offers horse riding", "has a pool"). If the business is something you could use on an ordinary day, the offer creates or updates its thing_to_do entry. Otherwise it is `not_useful`.

**Venue versus thing to do.** A venue becomes a thing_to_do only when you could use it on an ordinary day (Trail 5, a riding club) or when it keeps hosting recurring workshops. The weekly review suggests the second case and I confirm. A cafe that hosted one event stays a venue only, in the Venue Directory.

**Trail 5 (judgment call).** One thing_to_do record, tagged `hiking`, that is also the venue for events such as the Sunday hike. The event stays an event and links to the place; the place card lists the upcoming events held there. They are not duplicates, because one is standing and the other is dated.

Draft of the value paragraph for the prompt:
> Our readers are people doing things in Islamabad, visitors and residents alike, planning what to do this weekend. Events are the backbone. For every post, answer: what could someone do because of this post? Dated things you can attend are events, including dated courses, workshops and trips. Fixed things you can do on any day (trails, waterfalls, escape rooms, bowling, riding clubs, pools) are things to do. Things to buy and use yourself (games, craft kits) are products. An offer or discount is an advertisement that expires: record its end date, and also record what it reveals about the business (a reduced swimming fee shows there is a pool someone can use). Write why_useful in one sentence. If nothing here could help someone do or buy something in or from Islamabad, leave why_useful empty and set kind to not_useful (unrelated product sales, brand promos, online-only content, recruitment, giveaways, news with nothing to attend). List implied_facts: anything the post reveals about a place or provider that stays true after the post expires (has a pool, offers pottery classes, runs discounts), each with a quote.

## Bugs
- [ ] **Long Sheet lock during rebuilds (architecture).** `refreshEventViews_` rewrites every derived tab while holding the one script lock, often for a minute or more. Everything else waits or fails: the website build (now retries), review page opens and saves (now retry automatically for about 3 minutes and show "The Sheet is busy rebuilding; waiting…"), Sheet menu actions (still fail after 5 to 20 seconds). Review page saves defer the rebuild, so it now happens in the 5-minute inbox run instead. Real fix later: make the rebuild cheaper (only touched groups) or stop holding the lock for all of it. Not timed yet.
- [x] **The site has not updated since 31 Oct 2026, 12:08 (Pakistan time).** Fixed 2026-11-01: the bad listing is now skipped (see Crops). The crop itself is still too small; find it in the build log warning and re-crop it. Every build since then fails with `Crop too small` (thrown in `src/crop.ts` line 14 when a crop is under 100 x 100 px). One bad crop stops the whole build, so the old site stays up. Fix is the "skip that listing, flag it, and continue" item under Crops (priority 4). Seen in GitHub Actions logs, 2026-11-01.
- [ ] Builds also fail with `The sheet is saving another change` when Apps Script is busy at the same moment (inbox run every 5 minutes, or a review save). The export waits only 5 seconds for the lock (`tryLock(5000)` in `Workflow.gs`), then the whole build gives up. Happened in about 5 of the last 30 builds (27, 28, 29 Oct, 1 Nov). Partly fixed 2026-11-01: the build now retries a busy Sheet after 20, 40 and 60 seconds before giving up (`request` in `scripts/sync.mjs`). Watch whether it still happens.
- [ ] "Hourly" builds are not hourly. GitHub delays or drops scheduled runs when it is busy; from 23 Oct to 1 Nov builds started every 2 to 7 hours, not every hour. Each build takes 7 to 11 minutes. Combined with the failures above, a new listing can take most of a day to appear. Options to look at later: a "Publish now" trigger from the Sheet, or a lighter build.
- [ ] Poster crops cut through text on the left and right (Wood Furniture Making, IRU weekly calendar).
- [ ] Crops include app UI: like and share counts, profile bar, comment field, phone navigation bar, mute button.
- [ ] Some crops include the caption below the artwork (Forest Magic).
- [ ] Crop prompt asks for `[left, top, right, bottom]` while Gemini's native order is `[y_min, x_min, y_max, x_max]`. Suspected cause of narrow crops. Not confirmed.
- [ ] Old posts with no printed year get the current year and can show as Upcoming. The prompt tells Gemini to assume the current year; the only code check is that the date exists on the calendar.
- [ ] Review is slow loading images and saving. Addressed by the local review page (2026-11-04); the Sheet dialog itself is unchanged and still slow.
- [ ] One failing source image can fail the whole site build and keep the old site. Now seen (see `Crop too small` above). Other ways it can happen, from reading the code: the export refuses non-JPEG/PNG or over 6 MB, and the crop decoder caps at about 5 megapixels. May explain listings with no image.
- [ ] The "Find venue" lookup uses Google Search grounding, which Google lists as not available on the free tier for most models, including the default `gemini-3.5-flash-lite`. It probably fails on my key. Not tested. If a refusal comes back as HTTP 429, it would set the shared Gemini pause (15 minutes or more) and stall extraction, so test it only in the test copy.
- [x] Duplicate uploads in the inbox (`...Instagram.jpg` and `...Instagram (1).jpg`): checked 2026-11-04, already handled. `processOneFile_` matches the image fingerprint and `appendExactPosterCopy_` reuses the original's extraction in the same listing, with no Gemini call.
- [ ] Everything in the inbox is sent to Gemini, and on the free tier Google may use it to improve its products (see Decisions).
- [x] Saved text may be incomplete: fixed 2026-11-01 (see Foundations). Old rows are still short.
- [ ] Some listings get no image when Gemini returns `use_image=false`. Not reproduced.
- [ ] Handles from a neighbouring post become the organizer. Not reproduced.
- [ ] `groupNeighbourScreenshots_` is never called, so automatic grouping before extraction does not happen. Manual linking on the review page covers it for now (2026-11-04).
- [ ] README is out of date: it says no website exists, and that GitHub does not deploy Apps Script, but `sync-apps-script.yml` does.

**Checked and not a problem (so they are not raised again)**
- All 7 place types can be returned; the schema and the cleanup code both allow them.
- Failed files keep one error row each. Gemini-busy errors leave the file queued with no error row.
- Time parsing accepts only strict 24-hour `HH:MM` and blanks anything else, so `7:05 pm` does not become `07:05`.
- Titles are escaped by `scriptJson_` before going into dialogs. Not every dialog was checked.

## Decisions
- **2026-11-04: The review page is generated, not copied.** `review/index.html` is built by `scripts/build-review.mjs` from the Sheet's `ReviewDialog.html` plus `review/frame-top.html` and `review/frame.js`, so there is one copy of the dialog. A test fails if the page is out of date (`npm run build:review`).
- **2026-11-04: Separate token for the local review page.** It can read and save review decisions (same as the Sheet dialog), but cannot export the site or download arbitrary Drive files. Kept in the browser only, never in the repo. If it leaks, run `setupLocalReviewToken` again; the GitHub token is untouched.
- **2026-11-01: Review moves out of the Sheet, to a local page on my office computer only.** No hosted version: hosting would be slower. Replaces "full-page web app only if the quick wins are not enough". The Sheet stays the data store; only the review screen moves.
- **2026-11-01: Claude pushes directly to `main`.** I approved it. Consequence: a push that touches `apps-script/` uploads to the live Apps Script project, and any push rebuilds the site, so Claude batches changes into one push and tells me what went live. Replaces the branch idea.
- **2026-11-01: Ordinary restaurants and cafes sent without an event count as things to do** (`place_type` restaurant). A cafe that only hosted an event stays a venue only.
- **2026-11-01: Saved text is the full extraction.** One `page_text` per screenshot, capped at 20,000 characters, kept in the Text Archive. Why: later re-judging depends on the complete text.
- **2026-11-01: Four kinds: event, thing_to_do, product, not_useful. `lifecycle` is dropped.** Why: sorting by when and where someone uses a thing matches how I use the site, and the Sheet already separates Events from Places. Dated courses and day trips are events. An offer is an expiring note attached to a place, not a kind. `kind` plus `valid_until`, `recurrence` and tags now carry what `lifecycle` did. Replaces the seven-kind list of 2026-10-31.
- **2026-11-01: Activities stay tags, and one place can also be a venue (Trail 5).** Judgment call. Why: "hiking" is something you do at places, not a thing you open, so a kind for it would list Trail 5 twice. Tags let "hiking" find the trail and the Sunday hike. Changeable later because the raw extraction is stored.
- **2026-11-01: Judgments run as a separate step on the saved text.** New uploads by default; changing categories means re-running the saved text, and old posts can be re-run to test a prompt. Why: no image re-reads, so it is cheap and fast.
- **2026-11-01: Filenames do not matter.** Any screenshot from any app. Android names start with the app name, then the time; iPhone is untested. Grouping falls back to Drive metadata or upload time (see Later).
- **2026-11-01: Assumptions confirmed.** Keep the Sheet tabs; the site sections are Upcoming, Things to do and an Older toggle.
- **2026-11-01: The area filter will allow several sectors at once.** A map and a shortlist near my location come later.
- **2026-11-01: Events are the backbone; the rest can keep changing.** Why: so nothing else needs to be locked in. Store raw output so changes do not mean re-reading images.
- **2026-10-31: Value is the same for visitors and residents.** Drop the visitor/resident `audience` field and `visitor_travel`. One `why_useful` sentence instead. Why: I realised the value is the same for both groups. Events stay a separate kind because they are the most common.
- **2026-10-31: The site is a "what can I do this weekend" board.** Kinds are event, place, course, offer, trip, product, not_useful. Placeless things such as games are allowed. Why: it matches what I actually save. Easy to change later as long as the raw extraction and `location_type` are stored; hiding them is a one-line site filter.
- **2026-10-31: Place aliases are suggested by the AI and confirmed by me.** Never merged automatically.
- **2026-10-31: Skip the Maps lookup for now.** It is listed under "Might consider in the future". Why: it needs billing, and the budget is zero.
- **2026-10-31: My Gemini key is free-tier.** Consequences: Google Search grounding is probably unavailable, and Google's pricing page says free-tier content is used to improve its products. Since any supported image goes to Gemini, anything dropped in the inbox may be seen by Google. Keep private screenshots out of the inbox folder, or accept this. Paid tier would turn it off.
- **2026-10-31: Unconfirmed items.** They sit in Review (private). After 12 hours, medium-tier items also show in the public "Dates to be confirmed" strip, which expires an item 14 days after extraction if no date turns up. Low-tier items (no title, bad crop, suspected non-local, no value) stay in Review only, hidden; if their date passes they are archived quietly, never deleted.
- **2026-10-31: Check dates against the year.** Use the printed weekday and any visible post date to catch old posts. Details under Current priorities.
- **2026-10-31: Review speed first, and try the cheap fixes before a new web app.** Why: it is the daily pain, and the likely causes (base64 images, rebuilding every view on each save) can be fixed inside the existing dialog.
- **2026-10-31: Only two coordinating files, `CLAUDE.md` and `PLAN.md`, both updated in every commit.** Why: less to keep in sync.
- **2026-10-31: One codebase.** Fold the good ideas from the separate "v2" into this code; do not build v2. Why: this code is live with 117 listings, tests and a working GitHub publish. v2 was untested in Apps Script, and its output format would mean rebuilding the site feed. v2 files were never in this repo.
- **2026-10-31: Any supported image in the inbox goes to Gemini.** No Instagram filename filter. Why: my choice, simpler, and iPhone later.
- **2026-10-31: Retries stay as they are.** Gemini-busy files stay queued and retry with backoff; other failures keep one error row per file and retry daily at most.
- **2026-10-31: Posting rule.** Publish when there is a title and a clean crop. A missing date, venue or price does not block. An unclear date shows with no date under "Dates to be confirmed", never a guessed one. No title or an unclear crop goes to Hold. Why: a missing listing beats a wrong one.
- **2026-10-31: Ideas adopted from the other chats (originally 15 to 16 Oct).** Upcoming and "Things to do" split with an archived toggle; `lifecycle` field (dropped again on 2026-11-01); free-form tags with a later job to group them; store the summary and full visible text for every screenshot; `date_basis`; unconfirmed items expire; Research drop zone and attribution line later.
- **2026-10-30: Repo reviewed.** The GitHub crop is a plain rectangle cut with no checks beyond a 100 px minimum, so fixes belong in Apps Script and in `src/crop.ts`.
- **2026-10-28: Venue is not a Place.** A cafe that hosted one workshop stays a venue. Why: otherwise Places fills with cafes.
- **2026-10-28: Merge Research and Scouting into one private Parked tab.** Ideas are found later by the weekly review, not at upload.
- **2026-10-28: Grouping is a layer over extractions.** Regrouping re-extracts only that group; manual groupings are saved as decisions.
- **2026-10-28: Old events stay in the data but not on screen.** About 30 days visible, older ones rolled up. These numbers are defaults.
- **2026-10-28: Tiered publish policy.** Confident items publish, medium ones go to "Dates to be confirmed" after 12 hours, low ones stay hidden. Why: nothing should wait for me.
- **2026-10-28: Weekly review is plain code first, then one text-only LLM call.** It only writes suggestions.
- **2026-10-28: Prompts live in their own file with versions.** Build piece by piece, not all at once.
- **2026-10-27: Separate boxes for extraction and poster.** Extraction needs the description; the poster only needs the artwork. The poster box is top and bottom only, full width, because Instagram posts span the full width.
- **2026-10-27: Drop `announcement` as a kind. Keep `trip_from_here`. Keep implied facts with the original post.**
- **2026-10-27: Public site shows confirmed events only.** Public reports suggest and never apply. Why: a wrong date is worse than a missing event.
- **2026-10-26: Keep the current stack** (Drive, Apps Script, Gemini, Sheet, hourly GitHub Pages). Why: it works and Gemini is reliable here.

## Open questions
- None right now.
