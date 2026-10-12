/**
 * Sheet model: existing Events = source observations (append-only values);
 * Upcoming Events = canonical event rows; Event Review = work queue.
 * Metadata columns are appended AFTER the original 26 columns.
 */
const PIPE = Object.freeze({
  RAW:'Events', UPCOMING:'Upcoming Events', REVIEW:'Event Review',
  META:['group_id','match_status','review_reason','suggested_group_id'],
  UPCOMING_HEADERS:['group_id'].concat(CONFIG.HEADERS.filter(function(x){return x!=='id' && x!=='status' && x!=='error';})).concat(['source_count','updated_at','manual_notes']),
  REVIEW_HEADERS:['open_popup','priority','action','issue','existing_title','incoming_title','existing_date','incoming_date','existing_time','incoming_time','existing_venue','incoming_venue','differences','existing_poster','incoming_poster','source_id','group_id','suggested_group_id']
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
  const rev=reviewTable_();
  const col=PIPE.REVIEW_HEADERS.indexOf('action')+1;
  rev.setFrozenRows(1);rev.setFrozenColumns(3);
  rev.getRange(1,1,1,PIPE.REVIEW_HEADERS.length).setFontWeight('bold');
  rev.getRange(2,1,Math.max(1,rev.getMaxRows()-1),PIPE.REVIEW_HEADERS.length).setWrap(true);
  rev.setColumnWidth(1,135);rev.setColumnWidth(4,290);rev.setColumnWidth(13,420);
  rev.setColumnWidth(2,160);
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(['Merge suggested','Keep separate','Dismiss warning','Use source details'],true).setAllowInvalid(false).build();
  rev.getRange(2,col,Math.max(1,rev.getMaxRows()-1),1).setDataValidation(rule);
}
/** Safely migrate the original review columns without losing pending dropdown choices. */
function reviewTable_() {
  const ss=SpreadsheetApp.openById(getSettings_().spreadsheetId);
  let sh=ss.getSheetByName(PIPE.REVIEW);
  if (!sh || !sh.getLastRow()) return table_(PIPE.REVIEW, PIPE.REVIEW_HEADERS);
  const existingHeaders=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  if (PIPE.REVIEW_HEADERS.every(function(h,i){return existingHeaders[i]===h;})) return sh;
  const former=PIPE.REVIEW_HEADERS.slice(1);
  const old=['source_id','group_id','suggested_group_id','title','start_date','venue','reason','action','poster_url'];
  const wasFormer=former.every(function(h,i){return existingHeaders[i]===h;});
  const wasOld=old.every(function(h,i){return existingHeaders[i]===h;});
  if(!wasFormer && !wasOld) throw new Error('Unknown Event Review columns. Back up the tab before migration.');
  const previous=readObjects_(sh);
  const converted=previous.filter(function(r){return blank_(r.source_id);}).map(function(r){
    if(wasFormer) return PIPE.REVIEW_HEADERS.map(function(h){return h==='open_popup'?'Select row → Events menu → Review selected event':(r[h]||'');});
    const values={priority:'',issue:r.reason,existing_title:'',existing_date:'',existing_time:'',existing_venue:'',
      incoming_title:r.title,incoming_date:r.start_date,incoming_time:'',incoming_venue:r.venue,
      differences:r.reason,action:r.action,existing_poster:'',incoming_poster:r.poster_url,
      source_id:r.source_id,group_id:r.group_id,suggested_group_id:r.suggested_group_id};
    return PIPE.REVIEW_HEADERS.map(function(h){return values[h]||'';});
  });
  if(sh.getMaxColumns()<PIPE.REVIEW_HEADERS.length)
    sh.insertColumnsAfter(sh.getMaxColumns(),PIPE.REVIEW_HEADERS.length-sh.getMaxColumns());
  sh.getRange(1,1,sh.getMaxRows(),sh.getLastColumn()).clearContent().clearDataValidations();
  sh.getRange(1,1,1,PIPE.REVIEW_HEADERS.length).setValues([PIPE.REVIEW_HEADERS]);
  if(converted.length)sh.getRange(2,1,converted.length,PIPE.REVIEW_HEADERS.length).setValues(converted);
  sh.setFrozenRows(1);
  return sh;
}
function reviewItem_(source, groupId, suggestion, reason, canonical, groups) {
  const other=(suggestion && groups[suggestion] && groups[suggestion][0]) || canonical || {};
  const differences=[];
  ['title','start_date','start_time','venue','price','contact'].forEach(function(k){
    const a=blank_(other[k]), b=blank_(source[k]);
    if(a && b && wordKey_(a)!==wordKey_(b))
      differences.push(k.replace(/_/g,' ')+': '+a+' → '+b);
    else if(!a && b && k!=='title' && k!=='start_date')
      differences.push('New '+k.replace(/_/g,' ')+': '+b);
  });
  const urgent=/reschedul|date|time|venue|missing/i.test(reason);
  const isMismatch=!!(suggestion && groups[suggestion]);
  return {
    open_popup:'Select row → Events menu → Review selected event',priority:urgent?'High':'Normal',issue:reason,
    existing_title:other.title||'',existing_date:other.start_date||'',existing_time:other.start_time||'',existing_venue:other.venue||'',
    incoming_title:source.title||'',incoming_date:source.start_date||'',incoming_time:source.start_time||'',incoming_venue:source.venue||'',
    differences:differences.join(' | ') || (isMismatch?'Compare source posters':'No field differences detected'),
    action:'',existing_poster:other.original_image_url||'',incoming_poster:source.original_image_url||'',
    source_id:source.id,group_id:groupId,suggested_group_id:suggestion||''
  };
}
function readObjects_(sheet) {
  if(sheet.getLastRow()<2)return [];
  const vals=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues();
  return vals.slice(1).map(function(row,i){const x={_row:i+2};vals[0].forEach(function(h,j){
    x[h]=['start_date','end_date','existing_date','incoming_date'].indexOf(h)>=0 ? dateKey_(row[j]) :
      ['start_time','end_time','existing_time','incoming_time'].indexOf(h)>=0 ? timeKey_(row[j]) : row[j];
  });return x;});
}
function updateMeta_(sh,row,patch){const off=CONFIG.HEADERS.length+1;PIPE.META.forEach(function(h,i){if(Object.prototype.hasOwnProperty.call(patch,h))sh.getRange(row,off+i).setValue(patch[h]);});}
function putRawEvents_(file, items) {
  setupPipeline_();
  const sh=ensureEventsSheet_();
  SpreadsheetApp.openById(getSettings_().spreadsheetId).setSpreadsheetTimeZone('Asia/Karachi');
  applyEventColumnFormats_(sh,CONFIG.HEADERS);
  // A retry after an interrupted write should never insert duplicate observations.
  const old=readObjects_(sh).filter(function(r){return r.original_image_file_id===file.getId() && r.status!==CONFIG.STATUS.ERROR;});
  if(old.length) {markProcessed_(file.getId());refreshEventViews_();return;}
  if(!items.length)throw new Error('No event extracted from this poster.');
  const rows=items.map(function(e){
    const obj=buildEventRow_(file,e);
    obj.contact=normalizedContact_(e.contact);
    obj.start_date=dateKey_(e.start_date);obj.end_date=dateKey_(e.end_date);
    return CONFIG.HEADERS.map(function(h){return nativeEventCell_(h,obj[h]);}).concat(['','','','']);
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
  SpreadsheetApp.openById(getSettings_().spreadsheetId).setSpreadsheetTimeZone('Asia/Karachi');
  const sh=ensureEventsSheet_(), up=table_(PIPE.UPCOMING,PIPE.UPCOMING_HEADERS), rev=reviewTable_();
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
      const separate=action==='Keep separate';
      const revisedGroup=separate?'E_'+String(s.id):s.group_id;
      updateMeta_(sh,s._row,{group_id:revisedGroup,match_status:separate?'separate':'manual',review_reason:'',suggested_group_id:''});
      s.group_id=revisedGroup;s.match_status=separate?'separate':'manual';s.review_reason='';s.suggested_group_id='';
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
    parts.forEach(function(part){eventFields_().forEach(function(k){if(!blank_(part[k]) && blank_(canonical[k]))canonical[k]=part[k];});});
    const conflicts=[];
    parts.slice(1).forEach(function(p){const diff=conflictingFields_(canonical,p);if(diff.length && p.match_status!=='manual' && p.match_status!=='separate')conflicts.push({p:p,reason:'Conflicting '+diff.join(', ')});});
    parts.forEach(function(p){
      let why=blank_(p.review_reason);
      const conflict=conflicts.find(function(x){return x.p.id===p.id;});if(conflict)why=why?why+'; '+conflict.reason:conflict.reason;
      if((!blank_(canonical.title)||!dateKey_(canonical.start_date)) && !why && p.match_status!=='manual')why='Missing title or date';
      if(why && !isPast_(p) && p.match_status!=='separate' && p.match_status!=='manual')
        review.push(reviewItem_(p,gid,p.suggested_group_id,why,canonical,groups));
    });
    if(!isPast_(canonical)){
      canonical.source_count=parts.length;canonical.updated_at=new Date().toISOString();
      rows.push(PIPE.UPCOMING_HEADERS.map(function(h){return nativeEventCell_(h,canonical[h]);}));
    }
  });
  rows.sort(function(a,b){return String(a[PIPE.UPCOMING_HEADERS.indexOf('start_date')]).localeCompare(String(b[PIPE.UPCOMING_HEADERS.indexOf('start_date')]));});
  review.sort(function(a,b){return (a.priority==='High'?0:1)-(b.priority==='High'?0:1) || String(a.suggested_group_id||a.group_id).localeCompare(String(b.suggested_group_id||b.group_id)) || String(a.incoming_date).localeCompare(String(b.incoming_date));});
  writeView_(up,PIPE.UPCOMING_HEADERS,rows);
  writeView_(rev,PIPE.REVIEW_HEADERS,review.map(function(x){return PIPE.REVIEW_HEADERS.map(function(h){return nativeEventCell_(h,x[h]||'');});}));
  console.log('Upcoming: '+rows.length+'; review: '+review.length);
}
function writeView_(sh,headings,rows){
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,headings.length).clearContent();
  applyEventColumnFormats_(sh,headings);
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
  if(!blank_(e.range.getValue())) refreshEventViews();
}
