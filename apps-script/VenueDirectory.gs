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
function excludePosterLocked_(groupId){
  const ids=posterGroupIds_(groupId),places=table_(PIPE.PLACES,PIPE.PLACE_HEADERS);
  vrRows_(PIPE.RAW).filter(r=>ids.includes(String(r.group_id))).forEach(r=>vrUpdateRow_(PIPE.RAW,r._row,{status:CONFIG.STATUS.REJECTED,match_status:'not_local',review_reason:'Excluded: poster is not local',suggested_group_id:''}));
  vrRows_(PIPE.PLACES).filter(r=>ids.includes(String(r.group_id))).sort((a,b)=>b._row-a._row).forEach(r=>places.deleteRow(r._row));
  enqueueRemovalLocked_(ids.reduce((out,id)=>out.concat(['event:'+id,'place:'+id]),[]));
  refreshEventViews_();return {ok:true,destination:'excluded',count:ids.length};
}
