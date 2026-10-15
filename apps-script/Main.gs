/**
 * Run once after setting Script Properties.
 */
function setupProject() {
  const settings = getSettings_();

  // Validate resources now so setup fails clearly.
  DriveApp.getFolderById(settings.inboxFolderId);
  SpreadsheetApp.openById(settings.spreadsheetId);

  ensureEventsSheet_();
  setupPipeline_();
  installInboxTrigger_();
  installReviewTrigger_();

  console.log('Islamabad Events V3 setup complete.');
}

/**
 * Main worker. Safe to run manually or from a time trigger.
 */
function processInbox() {
  return withJobLease_('inbox', function () {
    const startedAt = Date.now();
    if (geminiBusyUntil_() > Date.now()) return;
    const folder = DriveApp.getFolderById(getSettings_().inboxFolderId), files = folder.getFiles(), pending = [];
    while (files.hasNext()) {
      const file = files.next();
      // Wait for a multi-select upload to settle. Capture time is a matching clue, not upload age.
      if (isSupportedImage_(file) && !isProcessed_(file.getId()) && inboxFileDue_(file.getId()) && Date.now() - file.getDateCreated().getTime() >= 120000) pending.push(file);
    }
    pending.sort((a, b) => screenshotFileMoment_(a) - screenshotFileMoment_(b) || a.getName().localeCompare(b.getName()));
    let handled = 0;
    deferEventViews_ = true;
    try {
      for (const file of pending) {
        if (handled >= CONFIG.MAX_FILES_PER_RUN || Date.now() - startedAt > 180000) break;
        handled++;
        try { processOneFile_(file); }
        catch (error) {
          if (isTransientGeminiError_(error)) { console.warn('Gemini busy; screenshots remain queued.'); break; }
          withDataLock_(function () { recordInboxFailure_(file, error); });
        }
      }
    } finally {
      deferEventViews_ = false;
      withDataLock_(function () { if (PropertiesService.getScriptProperties().getProperty('PIPELINE_DIRTY') === '1') refreshEventViews_(); });
    }
    if (Date.now() - startedAt < 220000) processCompanions_(startedAt + 260000);
    console.log('Inbox checked ' + handled + ' screenshots.');
  });
}
function inboxFileDue_(id) { let failure = {}; try { failure = JSON.parse(PropertiesService.getScriptProperties().getProperty('FILE_FAILURE_' + id) || '{}'); } catch (e) {} return !(failure.next > Date.now()); }
function recordInboxFailure_(file, error) {
  const props = PropertiesService.getScriptProperties(), key = 'FILE_FAILURE_' + file.getId();
  let old = {}; try { old = JSON.parse(props.getProperty(key) || '{}'); } catch (e) {}
  const attempts = Number(old.attempts || 0) + 1;
  props.setProperty(key, JSON.stringify({attempts: attempts, next: Date.now() + Math.min(24 * 3600000, 300000 * Math.pow(2, Math.min(attempts, 8)))}));
  // Keep one error record per failed source, rather than appending every run.
  const existing = readObjects_(ensureEventsSheet_()).find(r => String(r.original_image_file_id) === String(file.getId()) && r.status === CONFIG.STATUS.ERROR);
  if (existing) vrUpdateRow_(PIPE.RAW, existing._row, {error: truncate_(error.message, 1000)});
  else appendErrorRow_(file, error);
}
function processOneFile_(file) {
  const props = PropertiesService.getScriptProperties();
  let failure = {}; try { failure = JSON.parse(props.getProperty('FILE_FAILURE_' + file.getId()) || '{}'); } catch (e) {}
  if (failure.next > Date.now()) return;
  const blob = file.getBlob(), bytes = blob.getBytes();
  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) throw new Error('Image exceeds extraction size limit.');
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(x => ('0' + ((x + 256) % 256).toString(16)).slice(-2)).join('');
  const already = withDataLock_(function () {
    setupPipeline_();
    const observations = readObjects_(ensureEventsSheet_()).filter(r => r.id && r.status !== CONFIG.STATUS.ERROR);
    if (observations.some(r => String(r.original_image_file_id) === String(file.getId()) || (companionClues_(r).source_images || []).some(x => x.fileId === file.getId()))) { markProcessed_(file.getId()); return true; }
    const same = observations.filter(r => companionClues_(r).image_hash === hash);
    if (same.length) { appendExactPosterCopy_(file, same.filter(r => r.original_image_file_id === same[0].original_image_file_id), hash); return true; }
    return false;
  });
  if (already) return;
  // No sheet lock is held while Gemini reads the image.
  const extractions = extractEventFromPoster_(blob, file.getName());
  extractions.forEach(e => { e.companion_clues = e.companion_clues || {}; e.companion_clues.image_hash = hash; });
  withDataLock_(function () {
    // Another worker or a manual retry may have completed this source meanwhile.
    if (isProcessed_(file.getId())) return;
    cacheExtractedCrops_(file.getId(), extractions);
    putRawEvents_(file, extractions);
    props.deleteProperty('FILE_FAILURE_' + file.getId());
  });
}
function appendExactPosterCopy_(file,originals,hash){
  cacheExtractedCrops_(file.getId(), originals);
  const raw=ensureEventsSheet_();
  if(readObjects_(raw).some(function(r){return r.original_image_file_id===file.getId()&&r.status!==CONFIG.STATUS.ERROR;})){markProcessed_(file.getId());refreshIfNeeded_();return;}
  const rows=originals.map(function(original){
    const r=Object.assign({},original,{id:makeEventId_(),original_image_file_id:file.getId(),original_image_url:file.getUrl(),original_filename:file.getName(),processed_at:new Date().toISOString(),error:''});
    const clues=companionClues_(original);clues.image_hash=hash;r.companion_clues=JSON.stringify(clues);
    return CONFIG.HEADERS.concat(PIPE.META).map(function(k){return nativeEventCell_(k,r[k]||'');});
  });
  if(rows.length)raw.getRange(raw.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  markProcessed_(file.getId());refreshIfNeeded_();
  const all=readObjects_(raw);
  originals.filter(function(r){return r.match_status==='place';}).forEach(function(r){writeCanonicalPatch_(r.group_id,{source_count:all.filter(function(x){return x.group_id===r.group_id;}).length});});
}

/**
 * Retry all source files currently represented by error rows.
 * Successful retry appends a new pending row; the old error row remains as a log.
 */
function retryErrors() {
  const sheet = ensureEventsSheet_();
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return;

  const header = data[0];
  const statusIndex = header.indexOf('status');
  const fileIdIndex = header.indexOf('original_image_file_id');

  if (statusIndex === -1 || fileIdIndex === -1) {
    throw new Error('Events sheet headers are invalid.');
  }

  const seen = {};

  for (let i = 1; i < data.length; i++) {
    if (data[i][statusIndex] !== CONFIG.STATUS.ERROR) continue;

    const fileId = data[i][fileIdIndex];
    if (!fileId || seen[fileId] || isProcessed_(fileId)) continue;
    seen[fileId] = true;

    try {
      const file = DriveApp.getFileById(fileId);
      processOneFile_(file);
    } catch (err) {
      console.error('Retry failed for file ' + fileId + ': ' + err.message);
    }
  }
}

function installInboxTrigger_() {
  const functionName = 'processInbox';

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_EVERY_MINUTES)
    .create();
}
