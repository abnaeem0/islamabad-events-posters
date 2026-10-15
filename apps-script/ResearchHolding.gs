/** An ad-hoc holding area, separate from the on-demand Google Search cache. */
const HOLDING = {TAB: 'Research', HEADERS: ['group_id','title','notes','source_link','added_at','snapshot_json']};
function holdingSnapshot_(id) {
  const raw = vrRows_(PIPE.RAW).filter(r => String(r.group_id) === String(id));
  if (!raw.length) throw new Error('Source no longer exists.');
  const record = visualEventRows_().find(r => String(r.group_id) === String(id));
  const place = vrRows_(PIPE.PLACES).find(r => String(r.group_id) === String(id));
  return {record: portableRecord_(record), place: portableRecord_(place), states: raw.map(r => ({id:String(r.id),status:r.status,match_status:r.match_status,review_reason:r.review_reason,suggested_group_id:r.suggested_group_id}))};
}
function parkResearchLocked_(ids) {
  const sh = table_(HOLDING.TAB,HOLDING.HEADERS), old = readObjects_(sh);
  const plans = ids.map(id => {
    if (old.some(r => String(r.group_id) === String(id))) throw new Error('Already in Research.');
    const snapshot = holdingSnapshot_(id), base = snapshot.place || snapshot.record || vrRows_(PIPE.RAW).find(r => String(r.group_id) === String(id));
    if (JSON.stringify(snapshot).length > 45000) throw new Error('Listing is too large to park safely.');
    return {id:String(id), snapshot:snapshot, base:base};
  });
  plans.forEach(p => {
    sh.appendRow([p.id,nativeEventCell_('title',p.base.title||''),'',p.base.original_image_url||'',new Date().toISOString(),JSON.stringify(p.snapshot)]);
    vrRows_(PIPE.RAW).filter(r => String(r.group_id) === p.id).forEach(r => vrUpdateRow_(PIPE.RAW,r._row,{match_status:'research',review_reason:'Parked for research',suggested_group_id:''}));
    const place = vrRows_(PIPE.PLACES).find(r => String(r.group_id) === p.id);
    if (place) table_(PIPE.PLACES,PIPE.PLACE_HEADERS).deleteRow(place._row);
    enqueueRemovalLocked_(['event:'+p.id,'place:'+p.id]);
  });
  refreshEventViews_();
}
function moveSelectedToResearch() {
  try { const selection = shareSelection_(100); withDataLock_(() => parkResearchLocked_(selection.ids)); flushRemovalOutbox_(); SpreadsheetApp.getActiveSpreadsheet().toast(selection.ids.length+' moved to Research.','Events',6); }
  catch(e) { SpreadsheetApp.getUi().alert(e.message); }
}
function restoreResearchLocked_(id) {
  const sh = table_(HOLDING.TAB,HOLDING.HEADERS), row = readObjects_(sh).find(r => String(r.group_id) === String(id));
  if (!row) throw new Error('Research entry no longer exists.');
  const saved = JSON.parse(row.snapshot_json); saved.record=portableRecord_(saved.record);saved.place=portableRecord_(saved.place); const raw = vrRows_(PIPE.RAW);
  if (saved.states.some(s => !raw.some(r => String(r.id) === s.id && r.match_status === 'research'))) throw new Error('Source changed while parked.');
  if (saved.record) writeEventRecord_(saved.record);
  if (saved.place) {
    const places = table_(PIPE.PLACES,PIPE.PLACE_HEADERS);
    if (readObjects_(places).some(r => String(r.group_id) === String(id))) throw new Error('An activity entry already exists.');
    places.appendRow(PIPE.PLACE_HEADERS.map(k => nativeEventCell_(k,saved.place[k]||'')));
  }
  raw.filter(r => String(r.group_id) === String(id) && r.match_status === 'research').forEach(r => {
    const state = saved.states.find(s => s.id === String(r.id)) || saved.states[0];
    vrUpdateRow_(PIPE.RAW,r._row,{status:state.status,match_status:state.match_status,review_reason:state.review_reason,suggested_group_id:state.suggested_group_id});
  });
  sh.deleteRow(row._row);markPipelineDirty_();
}
function returnSelectedFromResearch() {
  try {
    const ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getActiveSheet();
    if(sh.getName()!==HOLDING.TAB)throw new Error('Select Research rows first.');
    const ranges=ss.getActiveRangeList(),ids=selectionGroupIds_(sh,ranges?ranges.getRanges():[ss.getActiveRange()].filter(Boolean));
    if(!ids.length||ids.length>100)throw new Error('Select 1–100 Research rows.');
    withDataLock_(function(){ids.forEach(restoreResearchLocked_);refreshEventViews_();});
    ss.toast(ids.length+' returned to their previous event/activity views.','Events',6);
  }catch(e){SpreadsheetApp.getUi().alert(e.message);}
}
function researchHoldingRecord_(id) {
  const row=readOptionalRows_(HOLDING.TAB).find(r=>String(r.group_id)===String(id));
  if(!row)return null;
  const saved=JSON.parse(row.snapshot_json);return Object.assign({},portableRecord_(saved.place||saved.record)||{}, {group_id:String(id),holding_notes:row.notes||''});
}
function saveHoldingReviewLocked_(payload,record) {
  if(visualVersion_(record)!==payload.reviewVersion)throw new Error('This entry changed. Reopen it.');
  const sh=table_(HOLDING.TAB,HOLDING.HEADERS),row=readObjects_(sh).find(r=>String(r.group_id)===String(payload.groupId));
  const saved=JSON.parse(row.snapshot_json),patch={};VISUAL_FIELDS.forEach(k=>{if(Object.prototype.hasOwnProperty.call(payload.fields||{},k))patch[k]=vrNative_(k,payload.fields[k]);});
  if(saved.place)Object.assign(saved.place,patch);else if(saved.record)Object.assign(saved.record,patch);else saved.record=Object.assign({},record,patch);
  if(JSON.stringify(saved).length>45000)throw new Error('Research record is too large.');
  sh.getRange(row._row,HOLDING.HEADERS.indexOf('snapshot_json')+1).setValue(JSON.stringify(saved));
  sh.getRange(row._row,HOLDING.HEADERS.indexOf('title')+1).setValue(nativeEventCell_('title',patch.title||record.title));
  return {ok:true,destination:HOLDING.TAB};
}
