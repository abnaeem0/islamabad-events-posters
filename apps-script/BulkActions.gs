/** Bulk actions resolve selected rows to stable record IDs before opening a preview. */
const PLACE_TYPES=['uncategorized','activity','experience','course','recurring_event','attraction','day_trip','restaurant'];
function captureEventSnapshot_(groupId){
  const event=visualEventRows_().find(r=>String(r.group_id)===String(groupId))||vrRows_(PIPE.RAW).find(r=>String(r.group_id)===String(groupId));
  if(!event)throw new Error('Event no longer exists.');
  const clean={};PIPE.UPCOMING_HEADERS.forEach(k=>clean[k]=vrString_(event[k],k));
  const states=vrRows_(PIPE.RAW).filter(r=>String(r.group_id)===String(groupId)).map(r=>({id:String(r.id),status:r.status,match_status:r.match_status,review_reason:r.review_reason,suggested_group_id:r.suggested_group_id}));
  return {event_snapshot:JSON.stringify(clean),source_states:JSON.stringify(states)};
}
function writeEventRecord_(record){
  record=portableRecord_(record);
  const sh=table_(PIPE.RECORDS,PIPE.UPCOMING_HEADERS),old=readObjects_(sh).find(r=>String(r.group_id)===String(record.group_id));
  sh.getRange(old?old._row:sh.getLastRow()+1,1,1,PIPE.UPCOMING_HEADERS.length).setValues([PIPE.UPCOMING_HEADERS.map(k=>nativeEventCell_(k,record[k]||''))]);
}
function restorePlaceToEvent_(groupId){
  const place=vrRows_(PIPE.PLACES).find(r=>String(r.group_id)===String(groupId));if(!place)throw new Error('Place no longer exists.');
  const members=vrRows_(PIPE.RAW).filter(r=>String(r.group_id)===String(groupId));
  if(!members.length||members.some(r=>r.match_status==='not_local'||r.status===CONFIG.STATUS.REJECTED))throw new Error('Cannot restore an excluded or missing source.');
  const moved=members.some(r=>r.match_status==='place');
  if(moved){
    let record,states=[];
    try{record=place.event_snapshot?JSON.parse(place.event_snapshot):null;states=place.source_states?JSON.parse(place.source_states):[];}catch(e){throw new Error('Saved event snapshot is invalid.');}
    // Older moves have only their raw source facts; never invent lost corrections.
    if(!record)record=visualEventRows_().find(r=>String(r.group_id)===String(groupId))||Object.assign({},members[0],{group_id:groupId});
    record.group_id=groupId;writeEventRecord_(record);
    members.forEach(r=>{const old=states.find(x=>x.id===String(r.id));vrUpdateRow_(PIPE.RAW,r._row,{status:old?old.status:CONFIG.STATUS.PENDING,match_status:old&&old.match_status!=='place'?old.match_status:'new',review_reason:old?old.review_reason:'',suggested_group_id:old?old.suggested_group_id:''});});
  }
  table_(PIPE.PLACES,PIPE.PLACE_HEADERS).deleteRow(place._row);
}
function selectionGroupIds_(sheet,ranges){
  const heads=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],idx=heads.indexOf('group_id');
  if(idx<0)throw new Error('Select rows in Upcoming Events, Event Review, Event Records or Places & Activities.');
  const ids=new Set();ranges.forEach(range=>{const start=Math.max(2,range.getRow()),end=Math.min(sheet.getLastRow(),range.getRow()+range.getNumRows()-1);if(end<start)return;sheet.getRange(start,idx+1,end-start+1,1).getValues().forEach(v=>{if(v[0])ids.add(String(v[0]));});});return Array.from(ids);
}
function bulkVersion_(groupId,tab){
  const record=(tab===PIPE.PLACES?vrRows_(PIPE.PLACES):visualEventRows_()).find(r=>String(r.group_id)===String(groupId));
  if(!record)throw new Error('Selected entry no longer exists.');
  return digestKey_(JSON.stringify({record:VISUAL_FIELDS.map(k=>vrString_(record[k],k)).concat(record.group_id,record.original_image_file_id,record.place_type||'',record.event_snapshot||''),states:vrRows_(PIPE.RAW).filter(r=>String(r.group_id)===String(groupId)).map(r=>[r.id,r.status,r.match_status,r.suggested_group_id,r.review_reason])}));
}
function openBulkMove(){openBulkActions_('move');}function openBulkCopy(){openBulkActions_('copy');}function openBulkReturn(){openBulkActions_('return');}function openBulkLocation(){openBulkActions_('location');}
function openBulkActions_(action){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getActiveSheet(),tab=sheet.getName();
  try{
    if(![PIPE.REVIEW,PIPE.UPCOMING,PIPE.RECORDS,PIPE.PLACES].includes(tab)||((action==='return')!==(tab===PIPE.PLACES)))throw new Error(action==='return'?'Select entries in Places & Activities.':'Select event rows in Upcoming Events, Event Review or Event Records.');
    const list=ss.getActiveRangeList(),ranges=list?list.getRanges():[ss.getActiveRange()];
    const ids=selectionGroupIds_(sheet,ranges.filter(Boolean));if(!ids.length)throw new Error('Select one or more populated event rows.');if(ids.length>100)throw new Error('Select at most 100 entries at once.');
    const records=tab===PIPE.PLACES?vrRows_(PIPE.PLACES):visualEventRows_();
    const template=HtmlService.createTemplateFromFile('BulkDialog');template.context=JSON.stringify({action,tab,items:ids.map(id=>{const r=records.find(x=>String(x.group_id)===id);return {id,title:r&&r.title||'Unnamed event',venue:r&&r.venue||'',legacyRestore:action==='return'&&!(r&&r.event_snapshot)&&vrRows_(PIPE.RAW).some(x=>String(x.group_id)===id&&x.match_status==='place'),version:bulkVersion_(id,tab)};})});
    SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(650).setHeight(600),'Selected entries');
  }catch(e){SpreadsheetApp.getUi().alert(e.message);}
}
function saveBulkActions(payload){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    if(!['move','copy','return','location'].includes(payload.action)||!Array.isArray(payload.items)||!payload.items.length||payload.items.length>100)throw new Error('Invalid bulk action.');
    if(![PIPE.REVIEW,PIPE.UPCOMING,PIPE.RECORDS,PIPE.PLACES].includes(payload.tab)||((payload.action==='return')!==(payload.tab===PIPE.PLACES)))throw new Error('Invalid source tab.');
    if(['move','copy'].includes(payload.action)&&!PLACE_TYPES.includes(payload.placeType))throw new Error('Select a category.');
    if(payload.action==='location'&&!blank_(payload.venue)&&!blank_(payload.address))throw new Error('Enter a venue or address.');
    const seen=new Set(),raw=vrRows_(PIPE.RAW),places=vrRows_(PIPE.PLACES);
    // Prevalidate the whole selection. A stale or unresolved member blocks all writes.
    payload.items.forEach(item=>{
      if(seen.has(item.id))throw new Error('Repeated selection.');seen.add(item.id);
      if(bulkVersion_(item.id,payload.tab)!==item.version)throw new Error('An entry changed. Close and reopen the selection.');
      const members=raw.filter(r=>String(r.group_id)===String(item.id));
      if(!members.length||members.some(r=>r.status===CONFIG.STATUS.REJECTED||r.match_status==='not_local'))throw new Error('Excluded or missing entry: '+item.title);
      if(members.some(r=>r.suggested_group_id||r.review_reason&& !/^Missing /.test(r.review_reason)))throw new Error('Resolve the pending match/conflict for '+item.title+' first.');
      if(['move','copy'].includes(payload.action)&&places.some(r=>String(r.group_id)===String(item.id)))throw new Error(item.title+' already has a place/activity entry. It will not be overwritten.');
      if(payload.action==='return'){const p=places.find(r=>String(r.group_id)===String(item.id));if(!p)throw new Error('Place no longer exists.');if(p.event_snapshot)JSON.parse(p.event_snapshot);if(p.source_states)JSON.parse(p.source_states);}
    });
    payload.items.forEach(item=>{
      const id=String(item.id);
      if(payload.action==='return'){restorePlaceToEvent_(id);return;}
      if(payload.action==='location'){
        const patch={};if(blank_(payload.venue))patch.venue=blank_(payload.venue);if(blank_(payload.address))patch.address=blank_(payload.address);
        writeCanonicalPatch_(id,patch);return;
      }
      const event=visualEventRows_().find(r=>String(r.group_id)===id),snap=captureEventSnapshot_(id);
      const record=Object.assign({},event,snap,{place_type:payload.placeType,saved_at:new Date().toISOString()});
      const sh=table_(PIPE.PLACES,PIPE.PLACE_HEADERS);sh.getRange(sh.getLastRow()+1,1,1,PIPE.PLACE_HEADERS.length).setValues([PIPE.PLACE_HEADERS.map(k=>nativeEventCell_(k,record[k]||''))]);
      if(payload.action==='move')raw.filter(r=>String(r.group_id)===id).forEach(r=>vrUpdateRow_(PIPE.RAW,r._row,{match_status:'place',review_reason:'',suggested_group_id:''}));
    });
    refreshEventViews_();fixEventDateTimeDisplay();return {ok:true,count:payload.items.length};
  }finally{lock.releaseLock();}
}
