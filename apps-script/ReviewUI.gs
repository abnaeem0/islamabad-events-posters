/**
 * Spreadsheet-bound reviewer; install alongside the collector in this project.
 */
const VISUAL_FIELDS=['title','start_date','end_date','start_time','end_time','venue','address','organizer','price','contact','registration_url','description','categories','age_info','source_account'];
function onOpen() {
  const ui=SpreadsheetApp.getUi();
  const move=ui.createMenu('Move and categorize'),copy=ui.createMenu('Copy and categorize');
  [['Activity / club / gym','Activities'],['Experience','Experiences'],['Course / classes','Courses'],['Recurring event / market','Recurring'],['Attraction','Attractions'],['Day trip','DayTrips'],['Restaurant / cafe','Restaurants']].forEach(x=>{move.addItem(x[0],'move'+x[1]);copy.addItem(x[0],'copy'+x[1]);});
  const share=ui.createMenu('Sharing').addItem('Prepare selected for sharing','openPrepareSharing').addItem('Sync public posters now','syncPublicPosters').addItem('Publishing status','showPublicationStatus').addItem('Open public page','openPublicPage').addSeparator().addItem('Connect public page','connectPublicPage');
  ui.createMenu('Events').addItem('Review selected event','openVisualReview').addItem('Move to Places & Activities','moveUncategorized').addItem('Copy to Places & Activities','copyUncategorized').addSubMenu(move).addSubMenu(copy).addItem('Move selected to Research','moveSelectedToResearch').addItem('Return selected from Research','returnSelectedFromResearch').addItem('Move selected back to Events','returnSelectedToEvents').addItem('Set selected venue / address','openBulkLocation').addSubMenu(share).addSeparator().addItem('Remove selected to Trash','removeSelectedEntries').addItem('Restore selected Trash entries','restoreSelectedTrash').addSeparator().addItem('Check companion screenshots now','processCompanions').addItem('Refresh event views','refreshEventViews').addItem('Fix date and time display','fixEventDateTimeDisplay').addToUi();
}
function vrRows_(tab){
  const sh=SpreadsheetApp.openById(getSettings_().spreadsheetId).getSheetByName(tab);
  if(!sh)throw new Error('Missing sheet '+tab);
  if(sh.getLastRow()<2)return [];
  const vals=sh.getDataRange().getValues(), heads=vals[0];
  return vals.slice(1).map((v,i)=>{
    const obj={_row:i+2};heads.forEach((h,j)=>obj[h]=v[j]);return obj;
  });
}
function vrString_(v,key){
  if(v===undefined||v===null||v==='')return '';
  if(key==='contact')return readableContact_(v);
  if(v instanceof Date){
    if(/date/.test(key))return Utilities.formatDate(v,'Asia/Karachi','yyyy-MM-dd');
    if(/time/.test(key))return Utilities.formatDate(v,'Asia/Karachi','HH:mm');
    return Utilities.formatDate(v,'Asia/Karachi','yyyy-MM-dd HH:mm');
  }
  if(/time$/.test(key))return timeKey_(v);
  if(/date$/.test(key))return dateKey_(v);
  return String(v);
}
function vrImage_(id,previewOnly) {
  if(!id)return '';
  const cache=CacheService.getUserCache(),prefix='poster-v3:'+(previewOnly?'preview:':'original:')+String(id)+':';
  try {
    const count=Number(cache.get(prefix+'count'));
    if(count>0 && count<=110){
      const keys=Array.from({length:count},(_,i)=>prefix+i),chunks=cache.getAll(keys);
      if(keys.every(k=>typeof chunks[k]==='string'))return keys.map(k=>chunks[k]).join('');
    }
  }catch(e){ /* Cache eviction or unavailability is harmless. */ }
  try {
    const file=DriveApp.getFileById(String(id));
    let b=null;
    if(previewOnly){try{b=file.getThumbnail();}catch(e){/* Older files may lack thumbnails. */}}
    if(!b)b=file.getBlob();
    const bytes=b.getBytes();
    if(bytes.length>6*1024*1024 || !/^image\/(jpeg|png|webp|gif)$/.test(b.getContentType()))return '';
    const image='data:'+b.getContentType()+';base64,'+Utilities.base64Encode(bytes);
    try {
      const chunks={},size=80000,count=Math.ceil(image.length/size);
      for(let i=0;i<count;i++)chunks[prefix+i]=image.slice(i*size,(i+1)*size);
      cache.putAll(chunks,600);cache.put(prefix+'count',String(count),600);
    }catch(e){ /* Full-size original still works without caching. */ }
    return image;
  } catch(e){return '';}
}
/** Load privately through Apps Script; originals do not need public Drive sharing. */
function getVisualPoster(sourceId,fileId,previewOnly,forceDrive){
  const source=vrRows_('Events').find(r=>String(r.id)===String(sourceId));
  if(!source)throw new Error('Poster source no longer exists.');
  const attached=(companionClues_(source).source_images||[]).find(x=>String(x.fileId)===String(fileId));
  if(fileId&&String(fileId)!==String(source.original_image_file_id)&&!attached)throw new Error('Image is not linked to this source.');
  const actual=String(attached?attached.fileId:source.original_image_file_id);
  const crop=cropRow_(actual);
  if(!githubPublishing_()&&previewOnly&&!forceDrive&&crop&&crop.public_asset_url&&crop.asset_signature===digestKey_(crop.crop_json))return {image:sharingConnection_().url+crop.public_asset_url,link:String(attached?attached.link:source.original_image_url||'')};
  return {image:vrImage_(attached?attached.fileId:source.original_image_file_id,previewOnly),link:String(attached?attached.link:source.original_image_url||'')};
}
function fixEventDateTimeDisplay(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();ss.setSpreadsheetTimeZone('Asia/Karachi');
  ['Events','Upcoming Events','Event Review','Places & Activities','Event Records'].forEach(name=>{
    const sh=ss.getSheetByName(name);if(!sh||!sh.getLastRow())return;
    const heads=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    applyEventColumnFormats_(sh,heads);
  });
}
function openVisualReview(){
  const sh=SpreadsheetApp.getActiveRange()&&SpreadsheetApp.getActiveRange().getSheet();
  const row=SpreadsheetApp.getActiveRange()&&SpreadsheetApp.getActiveRange().getRow();
  if(!sh || row<2 || !['Event Review','Upcoming Events','Places & Activities','Event Records','Research'].includes(sh.getName())){
    SpreadsheetApp.getUi().alert('Select a row in Event Review, Upcoming Events, Event Records or Places & Activities first.');return;
  }
  const template=HtmlService.createTemplateFromFile('ReviewDialog');
  const heads=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const values=sh.getRange(row,1,1,heads.length).getValues()[0];
  const queue=vrRows_(sh.getName()).filter(r=>r.group_id).map(r=>({mode:sh.getName()==='Event Review'?'review':sh.getName()==='Places & Activities'?'place':sh.getName()==='Research'?'holding':'edit',sourceId:String(r.source_id||''),groupId:String(r.group_id||'')}));
  template.context=JSON.stringify({queue,mode:sh.getName()==='Event Review'?'review':sh.getName()==='Places & Activities'?'place':sh.getName()==='Research'?'holding':'edit',
    sourceId:String(values[heads.indexOf('source_id')]||''),groupId:String(values[heads.indexOf('group_id')]||'')});
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(1160).setHeight(760),'Review event');
}
function visualEventRows_(){
  const rows={},ss=SpreadsheetApp.openById(getSettings_().spreadsheetId);
  [PIPE.RECORDS,PIPE.UPCOMING].forEach(name=>{const sh=ss.getSheetByName(name);if(sh)vrRows_(name).forEach(r=>rows[String(r.group_id)]=r);});
  return Object.keys(rows).map(k=>rows[k]);
}
function visualVersion_(record){return digestKey_(JSON.stringify({facts:VISUAL_FIELDS.map(k=>vrString_(record&&record[k],k)),poster:String(record&&record.original_image_file_id||''),research:String(record&&record.research_sources||''),policy:readOptionalRows_(LISTING_SETTINGS.TAB).filter(r=>String(r.listing_id).endsWith(':'+String(record&&record.group_id))).map(r=>r.updated_at)}));}
function companionDraftForSource_(sourceId,targetGroup){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMPANION.TAB);if(!sh)return null;
  const sources=vrRows_(PIPE.RAW);
  const rows=readObjects_(sh).filter(r=>{
    const base=sources.find(s=>String(s.id)===String(r.source_a));
    return String(r.source_b)===String(sourceId)&&r.outcome==='review'&&r.combined_json&&(!targetGroup||base&&String(base.group_id)===String(targetGroup));
  });
  if(!rows.length)return null;
  try{const result=JSON.parse(rows[rows.length-1].combined_json);if(!['same_event','same_place','uncertain'].includes(result.relation))return null;return {reason:result.reason||'',fields:normalizeExtraction_(result.combined||{})};}catch(e){return null;}
}
function getVisualReviewData(context){return withDataLock_(()=>getVisualReviewDataLocked_(context));}
function getVisualReviewDataLocked_(context){
  const reviews=context.mode==='review'?vrRows_('Event Review'):[],incomingReview=reviews.find(r=>String(r.source_id)===String(context.sourceId));
  const upcoming=context.mode==='holding'?[researchHoldingRecord_(context.groupId)].filter(Boolean):context.mode==='place'?vrRows_(PIPE.PLACES):visualEventRows_();const sources=vrRows_('Events');
  const editing=context.mode!=='review';
  const canon=editing ? upcoming.find(r=>String(r.group_id)===String(context.groupId)) : upcoming.find(r=>String(r.group_id)===String(incomingReview&& (incomingReview.suggested_group_id || incomingReview.group_id)));
  const event=editing?canon:incomingReview;
  if(!event)throw new Error('The selected row no longer exists.');
  const source=editing?sources.find(r=>String(r.group_id)===String(event.group_id)):sources.find(r=>String(r.id)===String(event.source_id));
  const current=canon||source||{};
  const existingSource=sources.find(r=>String(r.original_image_file_id)===String(current.original_image_file_id)&&String(r.group_id)===String(current.group_id))||sources.find(r=>String(r.group_id)===String(current.group_id))||current;
  const fields=(x)=>{const obj={};VISUAL_FIELDS.forEach(k=>obj[k]=vrString_(x&&x[k],k));return obj;};
  return {
    singleView:editing || (!event.suggested_group_id && /^Missing /.test(String(event.issue||''))),
    cropSummary:cropRow_(String(current.original_image_file_id))||null,
    posterGroupCount:source?posterGroupIds_(source.group_id).length:1,
    sharedVenueTargets:sharedVenueTargets_(source,current),
    mode:context.mode,sourceId:source&&String(source.id)||'',
    groupId:editing?String(event.group_id):String(event.group_id||source&&source.group_id||''),placeType:String(current.place_type||'uncategorized'),
    suggestedGroupId:context.mode==='review'?String(event.suggested_group_id||''):'',
    venueLocation:resolvedVenueLocation_(current,context.mode==='place'?'place':'event'),
    publication:expiryDetails_(current,context.mode==='place'?'place':'event'),approvedAsIs:approvalApplies_(current,context.mode==='place'?'place':'event'),
    title:current.title||source&&source.title||'Unnamed event',
    reviewReason:context.mode==='review'?String(event.issue||'Review event'): 'Edit event information',
    existing:fields(current),incoming:fields(source||current),
    existingLink:existingSource.original_image_url||'',incomingLink:source&&source.original_image_url||'',
    existingSourceId:String(existingSource.id||''),incomingSourceId:String(source&&source.id||''),
    existingFileId:String(existingSource.original_image_file_id||''),incomingFileId:String(source&&source.original_image_file_id||''),
    confidence:String(source&&source.confidence||''),uncertainFields:String(source&&source.uncertain_fields||''),
    extractionNotes:String(source&&source.extraction_notes||''),reviewVersion:visualVersion_(current),
    companionDraft:context.mode==='review'?companionDraftForSource_(source&&source.id,event.suggested_group_id||event.group_id):null,
    sources:sources.filter(r=>r.status!==CONFIG.STATUS.ERROR&&[String(current.group_id),String(source&&source.group_id)].includes(String(r.group_id)))
      .reduce((list,r)=>list.concat([{id:String(r.id),fileId:String(r.original_image_file_id||''),link:String(r.original_image_url||''),label:String(r.original_filename||r.title||r.id)}],(companionClues_(r).source_images||[]).map(x=>({id:String(r.id),fileId:x.fileId,link:x.link,label:x.label}))),[])
  };
}
function vrUpdateRow_(tab, rowNumber, updates){
  const sh=SpreadsheetApp.openById(getSettings_().spreadsheetId).getSheetByName(tab);
  const headings=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const values=sh.getRange(rowNumber,1,1,headings.length).getValues()[0];
  Object.keys(updates).forEach(k=>{
    const idx=headings.indexOf(k);
    if(idx>=0){
      values[idx]=updates[k];
      const cell=sh.getRange(rowNumber,idx+1);
      if(/^(start|end)_time$/.test(k))cell.setNumberFormat('hh:mm');
      if(/^(start|end)_date$/.test(k))cell.setNumberFormat('yyyy-mm-dd');
    }
  });
  sh.getRange(rowNumber,1,1,headings.length).setValues([values]);
  markPipelineDirty_();
}
function vrNative_(key,value){
  const val=String(value===null||value===undefined?'':value).trim();
  if(!val)return '';
  if(['start_date','end_date'].includes(key)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(val))throw new Error('Invalid '+key+': use YYYY-MM-DD');
    const parts=val.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    if(date.getUTCFullYear()!==parts[0]||date.getUTCMonth()!==parts[1]-1||date.getUTCDate()!==parts[2])throw new Error('Invalid '+key);
    return new Date(val+'T12:00:00+05:00');
  }
  if(['start_time','end_time'].includes(key)){
    if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(val))throw new Error('Invalid '+key+': use HH:mm');
    return nativeEventCell_(key,val);
  }
  return val;
}
function saveVisualDecision(payload){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    optionalReadCache_={};
    const sheet=SpreadsheetApp.getActiveSpreadsheet();
    const source=vrRows_('Events').find(r=>String(r.id)===String(payload.sourceId));
    payload=Object.assign({},payload);
    if(!payload.groupId&&source&&source.group_id)payload.groupId=String(source.group_id);
    if(!payload.groupId)throw new Error('This entry has no group yet. Refresh event views, then reopen it.');
    let action=String(payload.action||'edit');
    if(payload.mode==='holding'){const held=researchHoldingRecord_(payload.groupId);if(!held)throw new Error('Research entry no longer exists.');return saveHoldingReviewLocked_(payload,held);}
    if(action==='research'){if(!source||String(source.group_id)!==String(payload.groupId))throw new Error('Source changed.');const record=canonicalObjects_()[String(payload.suggestedGroupId||payload.groupId)]||source;if(payload.reviewVersion&&visualVersion_(record)!==payload.reviewVersion)throw new Error('Entry changed. Reopen it.');parkResearchLocked_([String(payload.groupId)]);return {ok:true,destination:HOLDING.TAB};}
    if(payload.approveAsIs&&!dateKey_((payload.fields||{}).start_date)&&payload.mode!=='place'&&['edit','dismiss'].includes(action)){if(!payload.publication||payload.publication.expiry_mode==='event')throw new Error('An undated listing needs an offer expiry or Ongoing; it will go to Places & Activities.');action='place';}
    if(source&&String(source.group_id)!==String(payload.groupId))throw new Error('This source moved to a different group. Reopen it before saving.');
    if(!source||source.status===CONFIG.STATUS.REJECTED||['research','trash','not_local'].includes(source.match_status))throw new Error('This listing was removed or parked. Reopen it from its current tab.');
    if(action==='not_local_poster'){if(String(source.group_id)!==String(payload.groupId))throw new Error('This entry changed. Reopen it.');return excludePosterLocked_(payload.groupId);}
    if(action==='return_event'){const place=vrRows_(PIPE.PLACES).find(r=>String(r.group_id)===String(payload.groupId));if(payload.mode!=='place'||!place)throw new Error('Select a saved place first.');if(payload.reviewVersion&&visualVersion_(place)!==payload.reviewVersion)throw new Error('This entry changed. Reopen it before restoring.');restorePlaceToEvent_(String(payload.groupId));refreshEventViews_();fixEventDateTimeDisplay();return {ok:true,destination:'Events'};}
    if(!['edit','merge','separate','dismiss','duplicate','not_local','place','copy_place'].includes(action))throw new Error('Unknown decision.');
    if(payload.reviewVersion&&!['duplicate','not_local','separate'].includes(action)&&!(['place','copy_place'].includes(action)&&payload.suggestedGroupId)){
      const current=(payload.mode==='place'?vrRows_(PIPE.PLACES).find(r=>String(r.group_id)===String(payload.groupId)):canonicalObjects_()[String(payload.suggestedGroupId||payload.groupId)])||source;
      if(visualVersion_(current)!==payload.reviewVersion)throw new Error('This listing changed while the dialog was open. Close and reopen it to keep the latest information.');
    }
    // Validate all edited values before changing match metadata or adding any row.
    const updated={manual_notes:'Manually reviewed '+new Date().toISOString()};
    VISUAL_FIELDS.filter(k=>action!=='not_local' && !((action==='place'||action==='copy_place'||payload.mode==='place') && /_(date|time)$/.test(k))).forEach(k=>{
      if(Object.prototype.hasOwnProperty.call(payload.fields||{},k))updated[k]=vrNative_(k,payload.fields[k]);
    });
    if(!['not_local','duplicate'].includes(action)){
      const kind=(action==='place'||action==='copy_place'||payload.mode==='place')?'place':'event';
      const base=(kind==='place'&&payload.suggestedGroupId?source:canonicalObjects_()[String(payload.suggestedGroupId||payload.groupId)])||source||{};
      const preview=Object.assign({},base,updated,{group_id:action==='merge'?String(payload.suggestedGroupId||payload.groupId):String(payload.groupId)});
      if(payload.posterChoice==='incoming'&&source)preview.original_image_file_id=source.original_image_file_id;
      prepareListingSettings_(preview,kind,payload);
    }
    if(action!=='not_local'&&action!=='duplicate'){
      const finalId=action==='merge'?String(payload.suggestedGroupId||payload.groupId):String(payload.groupId);
      const prior=canonicalObjects_()[finalId]||{};
      const evidence=chosenResearchEvidence_(payload,prior.research_sources);
      if(evidence)updated.research_sources=evidence;
    }
    if(payload.mode==='review'){
      const pending=vrRows_('Event Review').find(r=>String(r.source_id)===String(payload.sourceId));
      if(!pending)throw new Error('This item was already reviewed. Close and reopen the event.');
      if(String(pending.group_id||source&&source.group_id||'')!==String(payload.groupId||'') || String(pending.suggested_group_id||'')!==String(payload.suggestedGroupId||''))throw new Error('This match changed. Close and reopen the event.');
      if(pending.suggested_group_id&&!['merge','separate','duplicate','not_local','place','copy_place'].includes(action))throw new Error('Choose a decision for this match.');
    }
    let groupId=String(payload.groupId||'');
    if(action==='not_local'||action==='place'||action==='copy_place'||payload.mode==='place'){
      if(!source||!groupId||String(source.group_id)!==groupId)throw new Error('This record changed. Close and reopen it.');
      const type=String(payload.placeType||'uncategorized');
      if(action!=='not_local'&&!PLACE_TYPES.includes(type))throw new Error('Choose a valid place type.');
      const placeSheet=table_(PIPE.PLACES,PIPE.PLACE_HEADERS);
      const place=vrRows_(PIPE.PLACES).find(r=>String(r.group_id)===groupId);
      if(action==='not_local'){
        vrRows_('Events').filter(r=>String(r.group_id)===groupId).forEach(r=>vrUpdateRow_('Events',r._row,{status:CONFIG.STATUS.REJECTED,match_status:'not_local',review_reason:'Excluded: not local',suggested_group_id:''}));
        if(place)placeSheet.deleteRow(place._row);
      }else{
        // For a proposed match, save this incoming group, not the suggested original event.
        const canonical=payload.mode==='review'&&payload.suggestedGroupId?source:
          (payload.mode==='place'?place:visualEventRows_().find(r=>String(r.group_id)===groupId))||place||source;
        const snapshot=place&&place.event_snapshot?{event_snapshot:place.event_snapshot,source_states:place.source_states}:captureEventSnapshot_(groupId);
        const record=Object.assign({},canonical,updated,snapshot,{group_id:groupId,place_type:type,saved_at:new Date().toISOString()});
        if(payload.posterChoice==='incoming')['original_image_file_id','original_image_url','original_filename'].forEach(k=>record[k]=source[k]||'');
        const related=vrRows_('Events').filter(r=>String(r.group_id)===groupId);
        record.source_count=related.length;
        const settings=prepareListingSettings_(record,'place',payload);
        placeSheet.getRange(place?place._row:placeSheet.getLastRow()+1,1,1,PIPE.PLACE_HEADERS.length).setValues([PIPE.PLACE_HEADERS.map(k=>nativeEventCell_(k,record[k]||''))]);
        savePreparedListingSettings_(settings);
        saveConfirmedVenue_(record,payload);
        if(action==='place')related.forEach(r=>vrUpdateRow_('Events',r._row,{match_status:'place',review_reason:'',suggested_group_id:''}));
      }
      if(action==='not_local')enqueueRemovalLocked_(['event:'+groupId,'place:'+groupId]);
      refreshEventViews_();fixEventDateTimeDisplay();
      return {ok:true,groupId,destination:action==='not_local'?'excluded':PIPE.PLACES};
    }
    if(action==='merge'||action==='duplicate'){
      if(!source)throw new Error('Could not find source record.');
      groupId=String(payload.suggestedGroupId||groupId);
      if(!visualEventRows_().some(r=>String(r.group_id)===groupId))throw new Error('The original event no longer exists.');
      vrUpdateRow_('Events',source._row,{group_id:groupId,match_status:'manual',review_reason:'',suggested_group_id:''});
    } else if(action==='separate'){
      if(!source)throw new Error('Could not find source record.');
      groupId='E_'+String(source.id);
      vrUpdateRow_('Events',source._row,{group_id:groupId,match_status:'separate',review_reason:'',suggested_group_id:''});
    }else if(source && (payload.mode==='review'||payload.mode==='edit')) {
      vrUpdateRow_('Events',source._row,{match_status:'manual',review_reason:'',suggested_group_id:''});
    }
    if(!groupId)throw new Error('Missing event group ID.');
    const upSheet=sheet.getSheetByName('Upcoming Events');
    const existing=vrRows_('Upcoming Events').find(r=>String(r.group_id)===groupId);
    const newRow=existing?existing._row:upSheet.getLastRow()+1;
    if(!existing){
      const heads=upSheet.getRange(1,1,1,upSheet.getLastColumn()).getValues()[0];
      const defaults=visualEventRows_().find(r=>String(r.group_id)===groupId)||source||{};
      upSheet.getRange(newRow,1,1,heads.length).setValues([heads.map(k=>nativeEventCell_(k,k==='group_id'?groupId:(defaults[k]||'')))]);
    }
    if(action!=='duplicate'){
      if(payload.posterChoice==='incoming'&&source){
        ['original_image_file_id','original_image_url','original_filename'].forEach(k=>updated[k]=source[k]||'');
      }
      vrUpdateRow_('Upcoming Events',newRow,updated);
      if(action==='merge'){
        // Saving final fields reviews the main record too; an old partial slide's
        // low-confidence flag must not reopen the same merged listing.
        const root=vrRows_(PIPE.RAW).find(r=>String(r.group_id)===groupId&&String(r.id)!==String(source&&source.id));
        if(root)vrUpdateRow_(PIPE.RAW,root._row,{match_status:'manual',review_reason:'',suggested_group_id:''});
      }
    }
    if(payload.mode==='review'){
      // Clear resolved row now. The main collector later rebuilds review from stored decision metadata.
      const rev=sheet.getSheetByName('Event Review');
      const row=vrRows_('Event Review').find(r=>String(r.source_id)===String(payload.sourceId));
      if(row)rev.deleteRow(row._row);
    }
    if(payload.applySharedVenue && !['duplicate','not_local','place','copy_place'].includes(action))applySharedVenue_(source,payload.sharedVenueIds||[],updated);
    if(action!=='duplicate'){const final=vrRows_(PIPE.UPCOMING).find(r=>String(r.group_id)===groupId);saveListingSettings_(final,'event',payload);saveConfirmedVenue_(final,payload);}
    // Rebuild after the short, validated sheet write.
    refreshEventViews_();
    fixEventDateTimeDisplay();
    return {ok:true,groupId};
  }finally{lock.releaseLock();}
}

/** Only copy confirmed location fields to chosen, still-missing siblings. */
function sharedVenueTargets_(source,current){
  if(!source||!source.original_image_file_id)return [];
  const canon=visualEventRows_(),seen={};
  return vrRows_(PIPE.RAW).filter(r=>{
    if(r.original_image_file_id!==source.original_image_file_id||r.status===CONFIG.STATUS.REJECTED||r.match_status==='place'||String(r.group_id)===String(current.group_id)||seen[r.group_id])return false;
    const c=canon.find(x=>String(x.group_id)===String(r.group_id))||r;
    if(blank_(c.venue)||r.suggested_group_id||r.review_reason)return false;seen[r.group_id]=true;return true;
  }).map(r=>({groupId:String(r.group_id),title:String(r.title||'Unnamed workshop')}));
}
function applySharedVenue_(source,ids,updated){
  if(!source||!blank_(updated.venue)||!Array.isArray(ids))return;
  const allowed=sharedVenueTargets_(source,{group_id:source.group_id});
  const patch={venue:updated.venue};if(blank_(updated.address))patch.address=updated.address;
  ids.filter(id=>allowed.some(r=>r.groupId===String(id))).forEach(id=>{
    writeCanonicalPatch_(id,patch);
    // Keep raw extraction immutable; the durable canonical row stores this correction.
  });
}
