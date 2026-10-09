/**
 * Run once after setting Script Properties.
 */
function setupProject() {
  const settings = getSettings_();

  // Validate resources now so setup fails clearly.
  DriveApp.getFolderById(settings.inboxFolderId);
  SpreadsheetApp.openById(settings.spreadsheetId);

  ensureEventsSheet_();
  installInboxTrigger_();

  console.log('Islamabad Events V1 setup complete.');
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
    const settings = getSettings_();
    const folder = DriveApp.getFolderById(settings.inboxFolderId);
    const files = folder.getFiles();

    let handled = 0;

    while (files.hasNext() && handled < CONFIG.MAX_FILES_PER_RUN) {
      const file = files.next();

      if (!isSupportedImage_(file)) {
        continue;
      }

      if (isProcessed_(file.getId())) {
        continue;
      }

      handled++;

      try {
        processOneFile_(file);
      } catch (err) {
        console.error('Failed: ' + file.getName() + ' — ' + err.stack);
        appendErrorRow_(file, err);
        // Do not mark as processed: retry remains possible.
      }
    }

    console.log('Inbox run finished. Attempted ' + handled + ' image(s).');
  } finally {
    lock.releaseLock();
  }
}

function processOneFile_(file) {
  const blob = file.getBlob();

  if (blob.getBytes().length > CONFIG.MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds V1 size limit of ' + CONFIG.MAX_IMAGE_BYTES + ' bytes.');
  }

  const extraction = extractEventFromPoster_(blob, file.getName());
  const row = buildEventRow_(file, extraction);

  appendEventRow_(row);
  markProcessed_(file.getId());

  console.log('Processed: ' + file.getName());
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
