/**
 * Sheet model: existing Events = source observations (append-only values);
 * Upcoming Events = canonical event rows; Event Review = work queue.
 * Metadata columns are appended AFTER the original 26 columns.
 */
const PIPE = Object.freeze({
  RAW:'Events', UPCOMING:'Upcoming Events', REVIEW:'Event Review', PLACES:'Places & Activities', RECORDS:'Event Records',
  META:['group_id','match_status','review_reason','suggested_group_id','companion_clues'],
  UPCOMING_HEADERS:['group_id'].concat(CONFIG.HEADERS.filter(function(x){return x!=='id' && x!=='status' && x!=='error';})).concat(['source_count','updated_at','manual_notes','publication_status','research_sources']),
  REVIEW_HEADERS:['open_popup','priority','action','issue','existing_title','incoming_title','existing_date','incoming_date','existing_time','incoming_time','existing_venue','incoming_venue','differences','existing_poster','incoming_poster','source_id','group_id','suggested_group_id'],
  PLACE_HEADERS:['group_id','place_type'].concat(CONFIG.HEADERS.filter(function(x){return ['id','status','error','start_date','end_date','start_time','end_time'].indexOf(x)<0;})).concat(['source_count','saved_at','manual_notes','research_sources','event_snapshot','source_states'])
});
function table_(name, headings) {
  const ss = SpreadsheetApp.openById(getSettings_().spreadsheetId);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if(sh.getMaxColumns()<headings.length)sh.insertColumnsAfter(sh.getMaxColumns(),headings.length-sh.getMaxColumns());
  if (!sh.getLastRow()) {sh.getRange(1,1,1,headings.length).setValues([headings]);sh.setFrozenRows(1);}
  const actual = sh.getRange(1,1,1,headings.length).getValues()[0];
  // Append new columns; never rename, reorder or erase existing columns.
  let missing=false;
  headings.forEach(function(h,i){
    if(!actual[i])missing=true;
    else if(missing || h!==actual[i])throw new Error(name+' header mismatch at '+(i+1)+': '+actual[i]);
  });
  if(missing)sh.getRange(1,1,1,headings.length).setValues([headings]);
  return sh;
}
function setupPipeline_() {
  const raw = ensureEventsSheet_();
  const start = CONFIG.HEADERS.length+1;
  if(raw.getMaxColumns()<CONFIG.HEADERS.length+PIPE.META.length)raw.insertColumnsAfter(raw.getMaxColumns(),CONFIG.HEADERS.length+PIPE.META.length-raw.getMaxColumns());
  const headers = raw.getRange(1,start,1,PIPE.META.length).getValues()[0];
  PIPE.META.forEach(function(h,i){if(headers[i]&&headers[i]!==h)throw new Error('Existing Events metadata mismatch: '+h);});
  raw.getRange(1,start,1,PIPE.META.length).setValues([PIPE.META]);
  table_(PIPE.UPCOMING,PIPE.UPCOMING_HEADERS);
  table_(PIPE.RECORDS,PIPE.UPCOMING_HEADERS);
  table_(PIPE.PLACES,PIPE.PLACE_HEADERS);
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
function reviewItem_(source, groupId, suggestion, reason, canonical, groups, byId) {
  const other=(suggestion && byId && byId[suggestion]) || (suggestion && groups[suggestion] && groups[suggestion][0]) || canonical || {};
  const differences=[];
  eventFields_().forEach(function(k){
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
function updateMeta_(sh,row,patch){
  const off=CONFIG.HEADERS.length+1,range=sh.getRange(row,off,1,PIPE.META.length),values=range.getValues()[0];
  PIPE.META.forEach(function(h,i){if(Object.prototype.hasOwnProperty.call(patch,h))values[i]=patch[h];});
  range.setValues([values]);
}
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
    return CONFIG.HEADERS.map(function(h){return nativeEventCell_(h,obj[h]);}).concat(['','','','',serializeCell_(e.companion_clues||{})]);
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
  const records=table_(PIPE.RECORDS,PIPE.UPCOMING_HEADERS);
  const existing=readObjects_(records).concat(readObjects_(up)), byId={};existing.forEach(function(x){byId[String(x.group_id)]=x;});
  const allSource=readObjects_(sh).filter(function(x){return x.status!==CONFIG.STATUS.ERROR && x.id;});
  const excluded=allSource.filter(function(x){return x.match_status==='not_local';});
  const excludedGroups={};excluded.forEach(function(x){if(x.group_id)excludedGroups[String(x.group_id)]=true;});
  const inactiveGroups=Object.assign({},excludedGroups);
  allSource.filter(function(x){return x.match_status==='place';}).forEach(function(x){inactiveGroups[String(x.group_id)]=true;});
  const source=allSource.filter(function(x){return x.status!==CONFIG.STATUS.REJECTED && x.match_status!=='place' && !excludedGroups[String(x.group_id)];});
  source.forEach(function(s){
    if(s.suggested_group_id && inactiveGroups[String(s.suggested_group_id)]){
      updateMeta_(sh,s._row,{suggested_group_id:'',review_reason:'',match_status:'new'});
      s.suggested_group_id='';s.review_reason='';s.match_status='new';
    }
  });
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
    // Resolve older queued suggestions whose facts are now identical, rather than
    // requiring another human decision just because the old warning is stored.
    const suggested=byId[String(s.suggested_group_id||'')];
    if(suggested && ['manual','separate','companion'].indexOf(s.match_status)<0 &&
       eventDetailsEqual_(s,suggested) && matchCandidate_(s,suggested).type==='merge'){
      gid=String(s.suggested_group_id);
      updateMeta_(sh,s._row,{group_id:gid,match_status:'auto',review_reason:'',suggested_group_id:''});
      s.group_id=gid;s.match_status='auto';s.review_reason='';s.suggested_group_id='';
    }
    if(!gid){
      // A new screenshot of an already excluded event should not reappear.
      // Only a confident same-date/venue match is suppressed; loose similarities remain reviewable.
      const blocked=excluded.find(function(x){return matchCandidate_(s,x).type==='merge';});
      if(blocked){
        const heads=CONFIG.HEADERS,values=sh.getRange(s._row,1,1,heads.length).getValues()[0];
        values[heads.indexOf('status')]=CONFIG.STATUS.REJECTED;
        sh.getRange(s._row,1,1,heads.length).setValues([values]);
        updateMeta_(sh,s._row,{group_id:blocked.group_id,match_status:'not_local',review_reason:'Excluded: not local',suggested_group_id:''});
        return;
      }
      const candidates=Object.keys(groups).map(function(key){const candidate=byId[key]||groups[key][0];return {gid:key, match:matchCandidate_(s,candidate)};})
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
  const rows=[],recordRows=[];
  Object.keys(groups).forEach(function(gid){
    const parts=groups[gid];
    let canonical=byId[gid]?Object.assign({},byId[gid]):Object.assign({},parts[0]);
    canonical.group_id=gid;
    // Compare before filling blanks: unreviewed changes must not alter the main event.
    const conflicts=[];
    parts.slice(1).forEach(function(p){
      if(['manual','separate','companion'].indexOf(p.match_status)>=0)return;
      const diff=conflictingFields_(canonical,p);
      const added=eventFields_().filter(function(k){return !blank_(canonical[k]) && blank_(p[k]);});
      const reasons=[];
      if(diff.length)reasons.push('Conflicting '+diff.join(', '));
      if(added.length)reasons.push('Additional '+added.join(', '));
      if(reasons.length)conflicts.push({p:p,reason:reasons.join('; ')});
    });
    // Preserve deliberately blank manual corrections. Accepted edits live in Upcoming Events.
    if(!canonical.manual_notes)parts.forEach(function(part){
      if(part.suggested_group_id || conflicts.some(function(c){return c.p.id===part.id;}))return;
      eventFields_().forEach(function(k){if(blank_(part[k]) && !blank_(canonical[k]))canonical[k]=part[k];});
    });
    let holdNew=false;
    parts.forEach(function(p){
      // Confidence/uncertainty is not a change to the event. Keep the main event's
      // unresolved warning once, but never queue another identical observation.
      if(p!==parts[0] && !p.suggested_group_id && eventDetailsEqual_(canonical,p))return;
      let why=blank_(p.review_reason);
      const conflict=conflicts.find(function(x){return x.p.id===p.id;});if(conflict)why=why?why+'; '+conflict.reason:conflict.reason;
      const missing=[];if(!blank_(canonical.title))missing.push('title');if(!dateKey_(canonical.start_date))missing.push('date');if(!blank_(canonical.venue))missing.push('venue');
      if(missing.length && !why)why='Missing '+missing.join(', ');
      const uncertainty=blank_(p.uncertain_fields);
      if(!why && (p.confidence==='low'||(uncertainty && uncertainty!=='[]')) && ['manual','separate','companion'].indexOf(p.match_status)<0)why='Uncertain extraction: '+(uncertainty||'low confidence');
      if(why && p===parts[0])holdNew=true;
      if(why && !isPast_(p) && (['separate','manual','companion'].indexOf(p.match_status)<0 || (p===parts[0]&&p.match_status==='companion'&&/^Missing /.test(why))))
        review.push(reviewItem_(p,gid,p.suggested_group_id,why,canonical,groups,byId));
    });
    const imageIds=new Set();parts.forEach(p=>{if(p.original_image_file_id)imageIds.add(p.original_image_file_id);(companionClues_(p).source_images||[]).forEach(x=>imageIds.add(x.fileId));});canonical.source_count=imageIds.size||parts.length;canonical.updated_at=new Date().toISOString();
    canonical.publication_status=holdNew?'held':'ready';
    const recordRow=PIPE.UPCOMING_HEADERS.map(function(h){return nativeEventCell_(h,canonical[h]);});
    recordRows.push(recordRow);
    if(!isPast_(canonical))rows.push(recordRow);
  });
  rows.sort(function(a,b){const i=PIPE.UPCOMING_HEADERS.indexOf('start_date');return (dateKey_(a[i])||'9999-12-31').localeCompare(dateKey_(b[i])||'9999-12-31');});
  // One shared venue task per original poster; every workshop remains a separate record.
  const sharedVenue={};
  for(let i=review.length-1;i>=0;i--){const item=review[i],src=allSource.find(x=>String(x.id)===String(item.source_id));
    if(item.issue!=='Missing venue'||item.suggested_group_id||!src||!src.original_image_file_id)continue;
    const key=String(src.original_image_file_id);
    if(sharedVenue[key]){sharedVenue[key].count++;review.splice(i,1);}else sharedVenue[key]={item:item,count:1};
  }
  Object.keys(sharedVenue).forEach(key=>{const task=sharedVenue[key];if(task.count>1){task.item.issue='Missing shared venue — '+task.count+' workshops on this poster';task.item.differences='Set the venue once for selected workshops; listings remain separate';}});
  review.sort(function(a,b){return (a.priority==='High'?0:1)-(b.priority==='High'?0:1) || String(a.suggested_group_id||a.group_id).localeCompare(String(b.suggested_group_id||b.group_id)) || String(a.incoming_date).localeCompare(String(b.incoming_date));});
  writeView_(up,PIPE.UPCOMING_HEADERS,rows);
  // Moved events remain durable even while absent from active event views.
  const retained=new Set(recordRows.map(r=>String(r[0])));existing.forEach(r=>{if(inactiveGroups[String(r.group_id)]&&!excludedGroups[String(r.group_id)]&&!retained.has(String(r.group_id))){retained.add(String(r.group_id));recordRows.push(PIPE.UPCOMING_HEADERS.map(k=>nativeEventCell_(k,r[k])));}});
  writeView_(records,PIPE.UPCOMING_HEADERS,recordRows);
  writeView_(rev,PIPE.REVIEW_HEADERS,review.map(function(x){return PIPE.REVIEW_HEADERS.map(function(h){return nativeEventCell_(h,x[h]||'');});}));
  console.log('Upcoming: '+rows.length+'; review: '+review.length);
}
function writeView_(sh,headings,rows){
  if(rows.length+1>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),rows.length+1-sh.getMaxRows());
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
