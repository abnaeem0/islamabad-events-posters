/**
 * DESTRUCTIVE RESET OF GENERATED DATA. Run this function deliberately from Apps Script.
 * The first action creates a complete spreadsheet backup in Google Drive.
 * Originals in the Drive inbox are NEVER deleted.
 * After reset, run processInbox() or rely on the reinstalled 5-minute trigger.
 */
function resetEventsForFreshExtraction() {
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const settings=getSettings_();
    const ss=SpreadsheetApp.openById(settings.spreadsheetId);
    const props=PropertiesService.getScriptProperties();
    const backup=DriveApp.getFileById(ss.getId()).makeCopy('Islamabad Events backup BEFORE RESET '+new Date().toISOString());
    console.log('Backup completed: '+backup.getUrl());
    // Suspend automated ingestion during reset; new trigger is recreated afterward.
    ScriptApp.getProjectTriggers().forEach(function(t){
      if(t.getHandlerFunction()==='processInbox')ScriptApp.deleteTrigger(t);
    });
    ['Events','Upcoming Events','Event Review'].forEach(function(tab){
      const sh=ss.getSheetByName(tab);
      if(sh && sh.getLastRow()>1)
        sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent();
    });
    const keys=props.getProperties();
    Object.keys(keys).forEach(function(k){if(k.indexOf('PROCESSED_')===0)props.deleteProperty(k);});
    ss.setSpreadsheetTimeZone('Asia/Karachi');
    applyEventColumnFormats_(ss.getSheetByName('Events'),CONFIG.HEADERS);
    setupProject();
    console.log('Reset completed. No images deleted. Run processInbox() to begin re-extracting or wait for trigger.');
  } finally {lock.releaseLock();}
}
