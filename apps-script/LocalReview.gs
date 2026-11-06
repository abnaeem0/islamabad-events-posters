/**
 * Server side of the local review page (review/index.html).
 * Reached through doPost action 'review' with LOCAL_REVIEW_TOKEN (not the GitHub export token).
 * Every decision goes through the same functions as the Sheet dialog (ReviewUI.gs), so the
 * page and the Sheet behave the same. The only difference: saves from the page skip the slow
 * rebuild of the other tabs and leave it to the next inbox run (within about 5 minutes).
 */
const LOCAL_REVIEW_CALLS={
 list:()=>localReviewQueues_(),
 get:context=>getVisualReviewData(context),
 save:payload=>saveVisualDecision(Object.assign({},payload,{deferRefresh:true})),
 research:payload=>researchVisualDetails(payload),
 venue:payload=>researchVenueLocation(payload),
 collate:payload=>collateVisualDescriptions(payload),
 publishing:payload=>checkReviewPublishing(payload),
 // Fallback only, when a screenshot is not on the computer yet. Limited to images linked to that source.
 poster:(sourceId,fileId)=>getVisualPoster(sourceId,fileId,true,false),
 slides:payload=>localSlideCandidates_(payload),
 // Drive look-ups happen before taking the data lock, so the lock stays short.
 link:payload=>{const metas=localSlideMetas_(payload&&payload.link);return withDataLock_(()=>localLinkSlides_(payload,metas));},
 read_slides:payload=>readLinkedSlides(payload)
};
function localReviewCall_(body){
 const fn=LOCAL_REVIEW_CALLS[String(body.fn||'')];
 if(!fn)throw new Error('Unknown review call');
 const args=Array.isArray(body.args)?body.args:[];
 return {ok:true,result:fn.apply(null,args)};
}
/** The work lists shown in the page: the same rows the Sheet dialog would step through. No lock: read only. */
function localReviewQueues_(){
 const safeRows=tab=>{try{return vrRows_(tab);}catch(e){return [];}};
 const text=(row,key)=>vrString_(row&&row[key],key);
 const entry=(r,mode,extra)=>Object.assign({mode:mode,sourceId:String(r.source_id||''),groupId:String(r.group_id||''),title:text(r,'title')||'Untitled',date:text(r,'start_date')},extra||{});
 const review=safeRows(PIPE.REVIEW).filter(r=>r.group_id).map(r=>{
  const audit=isPublicationReviewRow_(r);
  return entry(r,audit?(String(r.differences||'').indexOf('place:')===0?'place':'edit'):'review',{
   title:text(r,'incoming_title')||text(r,'existing_title')||'Untitled',date:text(r,'incoming_date')||text(r,'existing_date'),
   issue:text(r,'issue'),priority:Number(r.priority)||99,audit:audit});
 }).sort((a,b)=>a.priority-b.priority);
 const byDate=(a,b)=>String(a.date).localeCompare(String(b.date));
 return {ok:true,checked_at:new Date().toISOString(),
  sheetUrl:SpreadsheetApp.openById(getSettings_().spreadsheetId).getUrl(),
  queues:{
   review:review,
   upcoming:safeRows(PIPE.UPCOMING).filter(r=>r.group_id).map(r=>entry(r,'edit')).sort(byDate),
   places:safeRows(PIPE.PLACES).filter(r=>r.group_id).map(r=>entry(r,'place',{issue:text(r,'place_type')})),
   research:safeRows(HOLDING.TAB).filter(r=>r.group_id).map(r=>entry(r,'holding'))
  }};
}
// ---- Slides of one post (manual grouping) ----
// A post can span several screenshots (carousel slides, caption, comments). Linking puts them under one listing:
// - a screenshot with its own single listing moves into this listing (like Merge);
// - a screenshot with no listing, or one that produced several listings, is attached as a supporting slide
//   (it can support several listings, e.g. one address slide for every workshop in a post).
// Linking itself sends nothing to Gemini and changes no extracted text. "Read all slides" (SlideReading.gs) then
// suggests missing details from all linked slides together.
const SLIDE_WINDOW_MS=20*60000;
function localSlideRows_(){return readObjects_(ensureEventsSheet_()).filter(r=>r.id&&r.status!==CONFIG.STATUS.ERROR);}
function localSlideAttachedIn_(rows,id,groupId){return rows.filter(r=>String(r.group_id)===String(groupId)&&(companionClues_(r).source_images||[]).some(x=>String(x.fileId)===id));}
function localSlideCandidates_(payload){
 const rows=localSlideRows_(),source=rows.find(r=>String(r.id)===String(payload.sourceId));
 if(!source)throw new Error('This entry has no source screenshot to link slides to.');
 const groupId=String(source.group_id),mainId=String(source.original_image_file_id||'');
 const mainFile=DriveApp.getFileById(mainId),moment=screenshotMoment_(source)||mainFile.getDateCreated().getTime();
 const created=mainFile.getDateCreated().getTime(),fmt=t=>Utilities.formatDate(new Date(t),'UTC',"yyyy-MM-dd'T'HH:mm:ss");
 // Uploads land after capture, often in one burst: search a wide upload window, then keep screenshots taken near this one.
 const q="'"+getSettings_().inboxFolderId+"' in parents and trashed = false and createdDate > '"+fmt(created-12*3600000)+"' and createdDate < '"+fmt(created+12*3600000)+"'";
 const it=DriveApp.searchFiles(q),files=[];
 while(it.hasNext()){const f=it.next();if(!isSupportedImage_(f))continue;const m=screenshotFileMoment_(f);if(Math.abs(m-moment)<=SLIDE_WINDOW_MS||f.getId()===mainId)files.push({file:f,moment:m});}
 files.sort((a,b)=>a.moment-b.moment||a.file.getName().localeCompare(b.file.getName()));
 const titleOf=gid=>{const r=rows.find(x=>String(x.group_id)===String(gid));return r?String(r.title||'Untitled'):'another listing';};
 const candidates=files.slice(0,40).map(({file,moment:m})=>{
  const id=file.getId(),own=rows.filter(r=>String(r.original_image_file_id)===id);
  const groups=Array.from(new Set(own.map(r=>String(r.group_id))));
  const elsewhere=rows.filter(r=>String(r.group_id)!==groupId&&String(r.original_image_file_id)!==id&&(companionClues_(r).source_images||[]).some(x=>String(x.fileId)===id));
  let state,detail;
  if(id===mainId){state='main';detail='This screenshot';}
  else if(localSlideAttachedIn_(rows,id,groupId).length){state='linked';detail='Linked as a supporting slide';}
  else if(own.length&&groups.every(g=>g===groupId)){state='linked';detail='Linked (has its own extracted details)';}
  else if(groups.length>1){state='support';detail=groups.length+' listings come from it; tick to use it as a supporting slide';}
  else if(own.length){state='other';detail='Own listing: '+titleOf(groups[0]);}
  else{state='none';detail=elsewhere.length?'Also supports: '+titleOf(elsewhere[0].group_id):'No listing of its own';}
  return {fileId:id,name:file.getName(),link:file.getUrl(),minutes:Math.round((m-moment)/60000),state:state,detail:detail};
 });
 return {sourceId:String(source.id),groupId:groupId,candidates:candidates};
}
function localSlideMetas_(ids){const out={};(ids||[]).slice(0,40).map(String).forEach(id=>{const f=DriveApp.getFileById(id);out[id]={fileId:id,link:f.getUrl(),label:f.getName()};});return out;}
function localLinkSlides_(payload,metas){
 const rows=localSlideRows_(),source=rows.find(r=>String(r.id)===String(payload.sourceId));
 if(!source||String(source.group_id)!==String(payload.groupId))throw new Error('This entry changed. Reload it before linking slides.');
 const groupId=String(source.group_id),mainId=String(source.original_image_file_id||'');
 const clueEdits=new Map(),cluesOf=r=>{if(!clueEdits.has(r._row))clueEdits.set(r._row,companionClues_(r));return clueEdits.get(r._row);};
 const done={linked:0,unlinked:0,skipped:[]},movedSources=[];
 (payload.link||[]).slice(0,40).map(String).forEach(id=>{
  if(id===mainId||localSlideAttachedIn_(rows,id,groupId).length)return;
  const own=rows.filter(r=>String(r.original_image_file_id)===id),groups=Array.from(new Set(own.map(r=>String(r.group_id))));
  if(own.length&&groups.length===1){
   own.forEach(r=>{if(String(r.group_id)!==groupId){vrUpdateRow_(PIPE.RAW,r._row,{group_id:groupId,match_status:'manual',review_reason:'',suggested_group_id:''});movedSources.push(String(r.id));}});
   done.linked++;return;
  }
  if(!metas[id]){done.skipped.push(id+': file not found');return;}
  const clues=cluesOf(source);clues.source_images=(clues.source_images||[]).concat([metas[id]]);
  // A slide with no listing of its own is not extracted separately later.
  if(!own.length)markProcessed_(id);
  done.linked++;
 });
 (payload.unlink||[]).map(String).forEach(id=>{
  if(id===mainId)return;
  rows.filter(r=>String(r.original_image_file_id)===id&&String(r.group_id)===groupId&&String(r.id)!==String(source.id)).forEach(r=>{vrUpdateRow_(PIPE.RAW,r._row,{group_id:'E_'+String(r.id),match_status:'separate',review_reason:'',suggested_group_id:''});done.unlinked++;});
  localSlideAttachedIn_(rows,id,groupId).forEach(r=>{const clues=cluesOf(r);clues.source_images=(clues.source_images||[]).filter(x=>String(x.fileId)!==id);done.unlinked++;});
 });
 clueEdits.forEach((clues,row)=>{if(clues.source_images&&!clues.source_images.length)delete clues.source_images;vrUpdateRow_(PIPE.RAW,row,{companion_clues:JSON.stringify(clues)});});
 if(movedSources.length){const rev=reviewSpreadsheet_().getSheetByName(PIPE.REVIEW);vrRows_(PIPE.REVIEW).filter(r=>movedSources.includes(String(r.source_id))).map(r=>r._row).sort((a,b)=>b-a).forEach(n=>rev.deleteRow(n));}
 markPipelineDirty_();
 return Object.assign({ok:true},done);
}
/**
 * Run once from the Apps Script editor (or again to replace a leaked token).
 * Makes a new random token, saves it in Script Properties and shows it once to copy into the review page.
 */
function setupLocalReviewToken(){
 const token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
 PropertiesService.getScriptProperties().setProperty('LOCAL_REVIEW_TOKEN',token);
 SpreadsheetApp.getUi().alert('Local review token','Copy this into the review page Settings. Any older review token stops working now.\n\n'+token,SpreadsheetApp.getUi().ButtonSet.OK);
}
