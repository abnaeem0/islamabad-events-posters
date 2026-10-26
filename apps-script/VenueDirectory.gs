/** Confirmed venue details only; no paid geocoding or automatic guesses. */
const VENUES={TAB:'Venue Directory',HEADERS:['venue_key','venue','source_account','contact','address','area','confirmed_at']};
function venueKey_(record){
  const venue=companionTextKey_(record.venue);if(!venue)return '';
  // Deliberately strict: branches must have distinct venue names. Account/contact
  // provide an additional boundary so unrelated businesses cannot share facts.
  return digestKey_(JSON.stringify([venue,companionTextKey_(record.source_account),readableContact_(record.contact).replace(/[^0-9+]/g,'')]));
}
function explicitArea_(address){
  const values=String(address||'').match(/\b[A-I]\s*[-–]\s*\d{1,2}(?:\s*\/\s*[1-4])?\b/gi)||[];
  const sectors=Array.from(new Set(values.map(x=>x.toUpperCase().replace(/\s/g,'').replace('–','-').split('/')[0])));
  return sectors.length===1?sectors[0]:'';
}
function confirmedVenue_(record){
  const key=venueKey_(record);if(!key)return null;
  const found=readOptionalRows_(VENUES.TAB).find(r=>r.venue_key===key);
  // Never replace a contradictory address (possibly a different branch).
  if(!found||blank_(record.address)&&companionTextKey_(record.address)!==companionTextKey_(found.address))return null;
  return found;
}
function resolvedVenueLocation_(record,kind){
  const saved=listingSettings_(record,kind),known=confirmedVenue_(record);
  const address=String(record.address||known&&known.address||'');
  return {address:address,area:String(saved.area||known&&known.area||explicitArea_(address)),confirmed:!!known};
}
function saveConfirmedVenue_(record,payload){
  if(!payload.confirmVenue)return;
  const key=venueKey_(record),address=blank_(record.address),area=String(payload.publication&&payload.publication.area||explicitArea_(address)).trim().slice(0,120);
  if(!key||!address)return;
  const sh=table_(VENUES.TAB,VENUES.HEADERS),old=readObjects_(sh).find(r=>r.venue_key===key);
  const row={venue_key:key,venue:record.venue,source_account:record.source_account,contact:readableContact_(record.contact),address,area,confirmed_at:new Date().toISOString()};
  sh.getRange(old?old._row:sh.getLastRow()+1,1,1,VENUES.HEADERS.length).setValues([VENUES.HEADERS.map(k=>nativeEventCell_(k,row[k]||''))]);
  markPipelineDirty_();
}
/** Dedicated lookup reuses confirmed locations, or the existing sourced research. */
function researchVenueLocation(payload){
  const fields=Object.assign({},payload.fields||{}),known=confirmedVenue_(fields);
  if(known)return {cached:true,confirmed:true,address:known.address,area:known.area};
  if(!blank_(fields.venue))throw new Error('Enter the venue name, including branch if known.');
  return researchVisualDetails(Object.assign({},payload,{scope:'venue',fields:fields}));
}
function openReviewCrop(payload){
  const c=withDataLock_(function(){
    const source=vrRows_(PIPE.RAW).find(r=>String(r.id)===String(payload.sourceId));
    if(!source||String(source.group_id)!==String(payload.groupId))throw new Error('This entry changed. Reopen it before adjusting its crop.');
    return {tab:payload.mode==='place'||source.match_status==='place'?PIPE.PLACES:PIPE.RECORDS,ids:[String(payload.groupId)]};
  });
  const t=HtmlService.createTemplateFromFile('ShareDialog');t.context=JSON.stringify(c);
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(1080).setHeight(750),'Fix poster crop');
}
/** One poster can advertise several independent workshops. Exclude that poster,
 * not every event by the same organiser. Suggested matches are not followed. */
function posterGroupIds_(groupId){
  const files=new Set(sourcesForGroup_(groupId).map(i=>i.fileId)),ids=new Set([String(groupId)]);
  vrRows_(PIPE.RAW).forEach(r=>{const images=[r.original_image_file_id].concat((companionClues_(r).source_images||[]).map(i=>i.fileId));if(r.group_id&&images.some(id=>files.has(String(id))))ids.add(String(r.group_id));});
  return Array.from(ids);
}
function exclusionVersion_(id){
 const raw=vrRows_(PIPE.RAW).filter(r=>String(r.group_id)===String(id));
 return digestKey_(JSON.stringify(raw.map(r=>[r.id,r.group_id,r.status,r.match_status,r.original_image_file_id]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))));
}
function reviewPosterTargets_(source,current){
 if(!source)return [];
 const records=visualEventRows_().concat(vrRows_(PIPE.PLACES)),seen=new Set(),currentId=String(source.group_id);
 return vrRows_(PIPE.RAW).filter(r=>String(r.original_image_file_id)===String(source.original_image_file_id)&&r.group_id&&r.status!==CONFIG.STATUS.REJECTED&&!['research','trash','not_local'].includes(r.match_status)).filter(r=>{const id=String(r.group_id);if(seen.has(id))return false;seen.add(id);return true;}).map(r=>{const id=String(r.group_id),record=records.find(x=>String(x.group_id)===id)||r;return {groupId:id,title:String(record.title||r.title||'Unnamed listing'),version:exclusionVersion_(id),current:id===currentId};});
}
function excludeSelectedPosterListingsLocked_(source,items){
 if(!Array.isArray(items)||!items.length||items.length>100)throw new Error('Tick at least one listing. Nothing was excluded.');
 const allowed=reviewPosterTargets_(source,{group_id:source.group_id}),seen=new Set();
 items.forEach(item=>{const id=String(item.groupId||'');if(seen.has(id))throw new Error('Repeated selection.');seen.add(id);const target=allowed.find(x=>x.groupId===id);if(!target||target.version!==item.version)throw new Error('A selected listing changed or is not on this poster. Reopen review.');});
 return excludeGroupsLocked_(Array.from(seen),'Excluded: selected listing is not local');
}
function excludePosterLocked_(groupId){return excludeGroupsLocked_(posterGroupIds_(groupId),'Excluded: poster is not local');}
function excludeGroupsLocked_(ids,reason){
 const places=table_(PIPE.PLACES,PIPE.PLACE_HEADERS);
 vrRows_(PIPE.RAW).filter(r=>ids.includes(String(r.group_id))).forEach(r=>vrUpdateRow_(PIPE.RAW,r._row,{status:CONFIG.STATUS.REJECTED,match_status:'not_local',review_reason:reason,suggested_group_id:''}));
 vrRows_(PIPE.PLACES).filter(r=>ids.includes(String(r.group_id))).sort((a,b)=>b._row-a._row).forEach(r=>places.deleteRow(r._row));
 enqueueRemovalLocked_(ids.reduce((out,id)=>out.concat(['event:'+id,'place:'+id]),[]));
 refreshEventViews_();return {ok:true,destination:'excluded',count:ids.length};
}
