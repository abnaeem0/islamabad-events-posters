/** Short data locks protect sheet writes. Leases protect long-running jobs without blocking the UI. */
let optionalReadCache_ = {};
function withDataLock_(fn) {
  optionalReadCache_ = {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('The sheet is saving another change. Try again in a few seconds.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function withJobLease_(name, fn) {
  const key = 'JOB_LEASE_' + name, token = Utilities.getUuid();
  const claimed = withDataLock_(function () {
    const props = PropertiesService.getScriptProperties();
    let old = {}; try { old = JSON.parse(props.getProperty(key) || '{}'); } catch (e) {}
    if (old.until > Date.now()) return false;
    props.setProperty(key, JSON.stringify({token: token, until: Date.now() + 360000}));
    return true;
  });
  if (!claimed) return {skipped: true};
  try { return fn(); } finally {
    withDataLock_(function () {
      const props = PropertiesService.getScriptProperties();
      let old = {}; try { old = JSON.parse(props.getProperty(key) || '{}'); } catch (e) {}
      if (old.token === token) props.deleteProperty(key);
    });
  }
}
function markPipelineDirty_() { optionalReadCache_ = {}; PropertiesService.getScriptProperties().setProperty('PIPELINE_DIRTY', '1'); }
let deferEventViews_ = false;
function refreshIfNeeded_() { markPipelineDirty_(); if (!deferEventViews_) refreshEventViews_(); }
function scriptJson_(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function nextPublicRevision_() {
  const props = PropertiesService.getScriptProperties();
  const revision = Math.max(Date.now(), Number(props.getProperty('PUBLIC_REVISION') || 0) + 1);
  props.setProperty('PUBLIC_REVISION', String(revision));
  return revision;
}
function readOptionalRows_(name) {
  if (Object.prototype.hasOwnProperty.call(optionalReadCache_, name)) return optionalReadCache_[name];
  const sh = SpreadsheetApp.openById(getSettings_().spreadsheetId).getSheetByName(name);
  optionalReadCache_[name] = sh ? readObjects_(sh) : [];
  return optionalReadCache_[name];
}
function rawGroupVersion_(groupId) {
  return digestKey_(JSON.stringify(readOptionalRows_(PIPE.RAW).filter(r => String(r.group_id) === String(groupId)).map(r => [r.id, r.status, r.group_id, r.match_status, r.review_reason, r.suggested_group_id, r.companion_clues])));
}
function sourcesForGroup_(groupId, preferredFileId) {
  const rows = readOptionalRows_(PIPE.RAW).filter(r => String(r.group_id) === String(groupId) && r.status !== CONFIG.STATUS.ERROR);
  const hashes = {}; rows.forEach(r => { const clues=companionClues_(r); if(clues.image_hash)hashes[String(r.original_image_file_id)]=clues.image_hash; });
  const candidates=[];
  rows.forEach(r => {
    const clues=companionClues_(r);
    [{fileId:String(r.original_image_file_id||''),link:r.original_image_url,label:r.original_filename}].concat(clues.source_images||[]).forEach(x=>{if(x.fileId)candidates.push({fileId:String(x.fileId),sourceId:String(r.id),label:String(x.label||r.title||'Poster'),link:String(x.link||''),hash:hashes[String(x.fileId)]||x.hash||''});});
  });
  candidates.sort((a,b)=>(a.fileId===String(preferredFileId)?-1:b.fileId===String(preferredFileId)?1:0));
  const seen=new Set();return candidates.filter(image=>{const key=image.hash||image.fileId;if(seen.has(key)||seen.has(image.fileId))return false;seen.add(key);seen.add(image.fileId);return true;});
}
/** JSON snapshots must preserve Sheets dates/times rather than restoring ISO timestamps as blanks. */
function portableRecord_(record) {
  if (!record) return record;
  const copy = {};
  Object.keys(record).forEach(key => {
    if (key === '_row') return;
    let value = record[key];
    if ((key === 'start_date' || key === 'end_date') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) value = new Date(value);
    if ((key === 'start_time' || key === 'end_time') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) value = new Date(value);
    copy[key] = key === 'start_date' || key === 'end_date' ? dateKey_(value) : key === 'start_time' || key === 'end_time' ? timeKey_(value) : value instanceof Date ? value.toISOString() : value;
  });
  return copy;
}
function recordGeminiUsage_(payload, code) {
  try {
    withDataLock_(function () {
      const schema = payload.generationConfig && payload.generationConfig.responseSchema, fields = schema && schema.properties || {};
      const purpose = fields.events ? 'extraction' : fields.relation ? 'companion_check' : fields.box ? 'legacy_crop' : fields.groups ? 'legacy_grouping' : payload.tools ? 'research_search' : fields.suggestions ? 'research_format' : 'other';
      const props = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
      let usage = {}; try { usage = JSON.parse(props.getProperty('GEMINI_CALL_COUNTS') || '{}'); } catch (e) {}
      if (usage.day !== day) usage = {day:day,total:0,failed:0,purposes:{}};
      usage.total++; if (code < 200 || code >= 300) usage.failed++;
      usage.purposes[purpose] = Number(usage.purposes[purpose] || 0) + 1;
      props.setProperty('GEMINI_CALL_COUNTS', JSON.stringify(usage));
    });
  } catch (e) { console.warn('Could not update Gemini call counts: ' + e.message); }
}
