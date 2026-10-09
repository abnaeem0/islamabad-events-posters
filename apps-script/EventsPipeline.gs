/**
 * Sheet model: existing Events = source observations (append-only values);
 * Upcoming Events = canonical event rows; Event Review = work queue.
 * Metadata columns are appended AFTER the original 26 columns.
 */
const PIPE = Object.freeze({
  RAW:'Events', UPCOMING:'Upcoming Events', REVIEW:'Event Review',
  META:['group_id','match_status','review_reason','suggested_group_id'],
  UPCOMING_HEADERS:['group_id'].concat(CONFIG.HEADERS.filter(function(x){return x!=='id' && x!=='status' && x!=='error';})).concat(['source_count','updated_at','manual_notes']),
  REVIEW_HEADERS:['source_id','group_id','suggested_group_id','title','start_date','venue','reason','action','poster_url']
});
function table_(name, headings) {
  const ss = SpreadsheetApp.openById(getSettings_().spreadsheetId);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (!sh.getLastRow()) {sh.getRange(1,1,1,headings.length).setValues([headings]);sh.setFrozenRows(1);}
  const actual = sh.getRange(1,1,1,headings.length).getValues()[0];
  headings.forEach(function(h,i){if (h!==actual[i]) throw new Error(name+' header mismatch at '+(i+1)+': '+actual[i]);});
  return sh;
}
function setupPipeline_() {
  const raw = ensureEventsSheet_();
  const start = CONFIG.HEADERS.length+1;
  const headers = raw.getRange(1,start,1,PIPE.META.length).getValues()[0];
  if (headers.every(function(x){return !x;})) raw.getRange(1,start,1,PIPE.META.length).setValues([PIPE.META]);
  else PIPE.META.forEach(function(h,i){if(headers[i]!==h)throw new Error('Existing Events metadata mismatch: '+h);});
  table_(PIPE.UPCOMING,PIPE.UPCOMING_HEADERS);
  const rev=table_(PIPE.REVIEW,PIPE.REVIEW_HEADERS);
  const col=PIPE.REVIEW_HEADERS.indexOf('action')+1;
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(['Merge suggested','Keep separate','Dismiss warning','Use source details'],true).setAllowInvalid(false).build();
  rev.getRange(2,col,Math.max(1,rev.getMaxRows()-1),1).setDataValidation(rule);
}
function readObjects_(sheet) {
  if(sheet.getLastRow()<2)return [];
  const vals=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues();
  return vals.slice(1).map(function(row,i){const x={_row:i+2};vals[0].forEach(function(h,j){x[h]=row[j];});return x;});
}
function updateMeta_(sh,row,patch){const off=CONFIG.HEADERS.length+1;PIPE.META.forEach(function(h,i){if(Object.prototype.hasOwnProperty.call(patch,h))sh.getRange(row,off+i).setValue(patch[h]);});}
function putRawEvents_(file, items) {
  setupPipeline_();
  const sh=ensureEventsSheet_();
  // A retry after an interrupted write should never insert duplicate observations.
  const old=readObjects_(sh).filter(function(r){return r.original_image_file_id===file.getId() && r.status!==CONFIG.STATUS.ERROR;});
  if(old.length) {markProcessed_(file.getId());refreshEventViews_();return;}
  if(!items.length)throw new Error('No event extracted from this poster.');
  const rows=items.map(function(e){
    const obj=buildEventRow_(file,e);
    obj.contact=normalizedContact_(e.contact);
    obj.start_date=dateKey_(e.start_date);obj.end_date=dateKey_(e.end_date);
    return CONFIG.HEADERS.map(function(h){return serializeCell_(obj[h]);}).concat(['','','','']);
  });
  sh.getRange(sh.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  markProcessed_(file.getId());
  refreshEventViews_();
}
/** Run manually to capture dropdown choices and rebuild both derived tabs. */
function refreshEventViews() {
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {refreshEventViews_();} finally {lock.releaseLock();}
}
function refreshEventViews_() {
  setupPipeline_();
  const sh=ensureEventsSheet_(), up=table_(PIPE.UPCOMING,PIPE.UPCOMING_HEADERS), rev=table_(PIPE.REVIEW,PIPE.REVIEW_HEADERS);
  const existing=readObjects_(up), byId={};existing.forEach(function(x){byId[String(x.group_id)]=x;});
  const source=readObjects_(sh).filter(function(x){return x.status!==CONFIG.STATUS.ERROR && x.id;});
  // Apply review choices before recomputing the queue. Process decisions only once.
  readObjects_(rev).forEach(function(r){
    const action=blank_(r.action);if(!action)return;
    const s=source.find(function(x){return String(x.id)===String(r.source_id);});if(!s)return;
    if(action==='Merge suggested' && r.suggested_group_id) {
      updateMeta_(sh,s._row,{group_id:r.suggested_group_id,match_status:'manual',review_reason:'',suggested_group_id:''});
      s.group_id=r.suggested_group_id;s.match_status='manual';s.review_reason='';s.suggested_group_id='';
    }else if(action==='Keep separate'||action==='Dismiss warning'||action==='Use source details'){
      updateMeta_(sh,s._row,{match_status:action==='Keep separate'?'separate':'manual',review_reason:'',suggested_group_id:''});
      s.match_status=action==='Keep separate'?'separate':'manual';s.review_reason='';s.suggested_group_id='';
      if(action==='Use source details') {const dest=byId[String(s.group_id)];if(dest){eventFields_().forEach(function(k){if(blank_(s[k]))dest[k]=s[k];});}}
    }
  });
  const groups={}, review=[];
  source.forEach(function(s){
    let gid=blank_(s.group_id), suggestion='', why='';
    if(!gid){
      const candidates=Object.keys(groups).map(function(key){const candidate=groups[key][0];return {gid:key, match:matchCandidate_(s,candidate)};})
        .filter(function(x){return x.match.type!=='none';}).sort(function(a,b){return b.match.score-a.match.score;});
      const best=candidates[0];
      if(best && best.match.type==='merge') gid=best.gid;
      else {gid='E_'+String(s.id);if(best){suggestion=best.gid;why=best.match.reason;}}
      updateMeta_(sh,s._row,{group_id:gid,match_status:best&&best.match.type==='merge'?'auto':'new',review_reason:why,suggested_group_id:suggestion});
      s.group_id=gid;s.review_reason=why;s.suggested_group_id=suggestion;s.match_status=best&&best.match.type==='merge'?'auto':'new';
    }
    if(!groups[gid])groups[gid]=[];
    groups[gid].push(s);
  });
  const rows=[];
  Object.keys(groups).forEach(function(gid){
    const parts=groups[gid];
    let canonical=byId[gid]?Object.assign({},byId[gid]):Object.assign({},parts[0]);
    canonical.group_id=gid;
    // Fill blanks only. Existing canonical edits are never overwritten.
    parts.forEach(function(part){eventFields_().forEach(function(k){if(!blank_(canonical[k]) && blank_(part[k]))canonical[k]=part[k];});});
    const conflicts=[];
    parts.slice(1).forEach(function(p){const diff=conflictingFields_(canonical,p);if(diff.length && p.match_status!=='manual' && p.match_status!=='separate')conflicts.push({p:p,reason:'Conflicting '+diff.join(', ')});});
    parts.forEach(function(p){
      let why=blank_(p.review_reason);
      const conflict=conflicts.find(function(x){return x.p.id===p.id;});if(conflict)why=why?why+'; '+conflict.reason:conflict.reason;
      if((!blank_(p.title)||!dateKey_(p.start_date)) && !why && p.match_status!=='manual')why='Missing title or date';
      if(why && !isPast_(p) && p.match_status!=='separate' && p.match_status!=='manual')
        review.push({source_id:p.id,group_id:gid,suggested_group_id:p.suggested_group_id,title:p.title,start_date:p.start_date,venue:p.venue,reason:why,action:'',poster_url:p.original_image_url});
    });
    if(!isPast_(canonical)){
      canonical.source_count=parts.length;canonical.updated_at=new Date().toISOString();
      rows.push(PIPE.UPCOMING_HEADERS.map(function(h){return serializeCell_(canonical[h]);}));
    }
  });
  rows.sort(function(a,b){return String(a[PIPE.UPCOMING_HEADERS.indexOf('start_date')]).localeCompare(String(b[PIPE.UPCOMING_HEADERS.indexOf('start_date')]));});
  review.sort(function(a,b){return String(a.group_id).localeCompare(String(b.group_id)) || String(a.start_date).localeCompare(String(b.start_date));});
  writeView_(up,PIPE.UPCOMING_HEADERS,rows);
  writeView_(rev,PIPE.REVIEW_HEADERS,review.map(function(x){return PIPE.REVIEW_HEADERS.map(function(h){return x[h]||'';});}));
  console.log('Upcoming: '+rows.length+'; review: '+review.length);
}
function writeView_(sh,headings,rows){
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,headings.length).clearContent();
  if(rows.length)sh.getRange(2,1,rows.length,headings.length).setValues(rows);
}

/** Instantly clears resolved review items after choosing a dropdown action. */
function installReviewTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if(trigger.getHandlerFunction()==='onReviewEdit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onReviewEdit')
    .forSpreadsheet(SpreadsheetApp.openById(getSettings_().spreadsheetId))
    .onEdit().create();
}
function onReviewEdit(e) {
  if(!e || !e.range || e.range.getSheet().getName()!==PIPE.REVIEW) return;
  if(e.range.getColumn()!==PIPE.REVIEW_HEADERS.indexOf('action')+1 || e.range.getRow()<=1) return;
  if(!blank_(e.range.getValue())) return;
  refreshEventViews();
}
