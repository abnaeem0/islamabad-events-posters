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
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another inbox run is already active.');
    return;
  }

  try {
    const startedAt=Date.now();
    const settings = getSettings_();
    const folder = DriveApp.getFolderById(settings.inboxFolderId);
    const files = folder.getFiles();

    let handled = 0, imageChecks=0;
    const pending=[];
    while(files.hasNext()){const file=files.next();if(isSupportedImage_(file)&&!isProcessed_(file.getId()))pending.push(file);}
    pending.sort((a,b)=>screenshotFileMoment_(a)-screenshotFileMoment_(b)||a.getName().localeCompare(b.getName()));
    for(let offset=0;offset<pending.length&&handled<CONFIG.MAX_FILES_PER_RUN&&Date.now()-startedAt<180000;){
      const batch=[pending[offset++]];
      while(offset<pending.length&&batch.length<4&&batch.length+handled<CONFIG.MAX_FILES_PER_RUN&&screenshotFileMoment_(pending[offset])-screenshotFileMoment_(batch[batch.length-1])<=10*60*1000)batch.push(pending[offset++]);
      let groups=batch.map(f=>[f]);
      try{if(batch.length>1&&imageChecks<2&&reserveCompanionCall_()){imageChecks++;groups=groupNeighbourScreenshots_(batch);}}catch(err){console.warn('Image grouping unavailable; individual extraction and later checks remain available: '+err.message);}
      for(const group of groups){
        if(Date.now()-startedAt>=180000)break;
        handled+=group.length;
        try{processScreenshotGroup_(group);}catch(err){console.error('Failed screenshot group: '+err.message);group.forEach(file=>appendErrorRow_(file,err));}
      }
    }

    console.log('Inbox run finished. Attempted ' + handled + ' image(s).');
    // Later runs continue pending companion checks even when there are no new uploads.
    if(Date.now()-startedAt<240000){
      try{processCompanions_(startedAt+270000);}catch(err){console.error('Companion checks deferred: '+err.message);}
    }
  } finally {
    lock.releaseLock();
  }
}

function processOneFile_(file) {
  const blob = file.getBlob();
  const bytes=blob.getBytes();

  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds V1 size limit of ' + CONFIG.MAX_IMAGE_BYTES + ' bytes.');
  }

  const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');
  setupPipeline_();
  const observations=readObjects_(ensureEventsSheet_()).filter(function(r){return r.id&&r.status!==CONFIG.STATUS.ERROR;});
  if(observations.some(r=>(companionClues_(r).source_images||[]).some(x=>x.fileId===file.getId()))){markProcessed_(file.getId());refreshEventViews_();return;}
  const same=observations.filter(function(r){return companionClues_(r).image_hash===hash;});
  if(same.length){
    // Copy the first source file's observations once, retaining each event's disposition.
    const originalId=same[0].original_image_file_id;
    appendExactPosterCopy_(file,same.filter(function(r){return r.original_image_file_id===originalId;}),hash);
    return;
  }

  const extractions = extractEventFromPoster_(blob, file.getName());
  // Legacy observations predate image hashes. Verify a few strong candidates by
  // their original bytes so a copied old poster cannot reopen formatting conflicts.
  const legacyIds=[];
  observations.filter(function(r){return !companionClues_(r).image_hash&&r.original_image_file_id;}).forEach(function(r){
    const plausible=extractions.some(function(e){return titleSimilarity_(e.title,r.title)>=0.8 || companionCandidate_(Object.assign({original_filename:file.getName(),original_image_file_id:file.getId()},e),r).eligible;});
    if(plausible&&legacyIds.indexOf(r.original_image_file_id)<0&&legacyIds.length<3)legacyIds.push(r.original_image_file_id);
  });
  for(let i=0;i<legacyIds.length;i++){
    try{
      const oldBytes=DriveApp.getFileById(legacyIds[i]).getBlob().getBytes();
      const oldHash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,oldBytes).map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');
      if(oldHash!==hash)continue;
      const originals=observations.filter(function(r){return r.original_image_file_id===legacyIds[i];});
      originals.forEach(function(r){const clues=companionClues_(r);clues.image_hash=hash;updateMeta_(ensureEventsSheet_(),r._row,{companion_clues:JSON.stringify(clues)});r.companion_clues=JSON.stringify(clues);});
      appendExactPosterCopy_(file,originals,hash);return;
    }catch(e){console.warn('Legacy poster fingerprint unavailable: '+e.message);}
  }
  extractions.forEach(function(e){e.companion_clues=e.companion_clues||{};e.companion_clues.image_hash=hash;});
  putRawEvents_(file, extractions);

  console.log('Processed: ' + file.getName());
}

function appendExactPosterCopy_(file,originals,hash){
  const raw=ensureEventsSheet_();
  if(readObjects_(raw).some(function(r){return r.original_image_file_id===file.getId()&&r.status!==CONFIG.STATUS.ERROR;})){markProcessed_(file.getId());refreshEventViews_();return;}
  const rows=originals.map(function(original){
    const r=Object.assign({},original,{id:makeEventId_(),original_image_file_id:file.getId(),original_image_url:file.getUrl(),original_filename:file.getName(),processed_at:new Date().toISOString(),error:''});
    const clues=companionClues_(original);clues.image_hash=hash;r.companion_clues=JSON.stringify(clues);
    return CONFIG.HEADERS.concat(PIPE.META).map(function(k){return nativeEventCell_(k,r[k]||'');});
  });
  if(rows.length)raw.getRange(raw.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  markProcessed_(file.getId());refreshEventViews_();
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
