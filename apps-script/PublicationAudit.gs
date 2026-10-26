/** Compare current sheet listings with the last successfully deployed public feed.
 * No Gemini calls. Network reads occur outside the sheet lock. */
const PUBLICATION_AUDIT={WAIT_MS:3*3600000,INTERVAL_MS:15*60000};
function isPublicationReviewRow_(row){return !!row&&String(row.issue||'').indexOf('Publishing: ')===0;}
function githubPublicationHash_(record,kind){
 const item=Object.assign({},publicListing_(record,kind));delete item.last_checked;delete item.published_at;delete item.publication_hash;
 const images=sourcesForGroup_(record.group_id,record.original_image_file_id).map(image=>{const crop=cropRow_(image.fileId);return crop&&crop.crop_status==='ready'?[String(image.fileId),JSON.parse(crop.crop_json)]:null;}).filter(Boolean).sort((a,b)=>a[0].localeCompare(b[0]));
 return digestKey_(JSON.stringify({item,main:String(record.original_image_file_id||''),images}));
}
function publicationHealth_(record,kind){
 if(!record||!record.group_id)return null;
 const row=readOptionalRows_(PUBLIC_QUEUE.TAB).find(r=>String(r.listing_id)===kind+':'+record.group_id);
 return row?{status:String(row.status||''),reason:String(row.last_error||''),checkedAt:String(row.checked_at||'')}:null;
}
function auditWebsitePublishing(){const result=auditWebsitePublishing_(true);SpreadsheetApp.getUi().alert(result.ok?'Publishing audit complete. '+result.attention+' listing(s) need attention in Event Review. '+result.pending+' pending. '+result.live+' live.':'Could not check the website: '+result.error);return result;}
function checkReviewPublishing(payload){
 const result=auditWebsitePublishing_(true);if(!result.ok)throw new Error(result.error);
 return withDataLock_(function(){return publicationHealth_({group_id:String(payload.groupId)},payload.mode==='place'?'place':'event');});
}
function auditWebsitePublishing_(force){
 if(!githubPublishing_())return {ok:false,error:'GitHub publishing is not enabled.'};
 const props=PropertiesService.getScriptProperties(),now=Date.now();
 if(!force&&now-Number(props.getProperty('PUBLICATION_AUDIT_LAST_ATTEMPT')||0)<PUBLICATION_AUDIT.INTERVAL_MS)return {ok:true,skipped:true};
 props.setProperty('PUBLICATION_AUDIT_LAST_ATTEMPT',String(now));
 let feed;
 try{
  const response=UrlFetchApp.fetch(githubPublicUrl_()+'data/listings.json?audit='+now,{muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('Website feed returned HTTP '+response.getResponseCode()+'. The first deployment may still be pending.');
  feed=JSON.parse(response.getContentText());
  const exported=new Date(feed.exported_at).getTime();
  if(!Array.isArray(feed.items)||feed.items.length>10000||!Number.isFinite(exported)||exported>now+300000||feed.items.some(x=>!x||typeof x.id!=='string'))throw new Error('Website feed is invalid; existing audit results were kept.');
 }catch(e){props.setProperty('PUBLICATION_AUDIT_ERROR',String(e.message).slice(0,800));return {ok:false,error:String(e.message)};}
 return withDataLock_(function(){
  sharingTables_();if(props.getProperty('PIPELINE_DIRTY')==='1')refreshEventViews_();
  const result=updatePublicationAuditLocked_(feed,now);props.deleteProperty('PUBLICATION_AUDIT_ERROR');props.setProperty('PUBLICATION_AUDIT_CHECKED_AT',new Date(now).toISOString());refreshEventViews_();return result;
 });
}
function updatePublicationAuditLocked_(feed,now){
 const raw=vrRows_(PIPE.RAW),reviews=vrRows_(PIPE.REVIEW).filter(r=>!isPublicationReviewRow_(r)),oldRows=publicationQueueRows_(),live=new Map(feed.items.map(x=>[x.id,x]));
 const inactive=new Set(raw.filter(r=>r.status===CONFIG.STATUS.REJECTED||['research','trash','not_local'].includes(r.match_status)).map(r=>String(r.group_id)));
 const candidates=vrRows_(PIPE.UPCOMING).map(record=>({record,kind:'event'})).concat(vrRows_(PIPE.PLACES).map(record=>({record,kind:'place'})));
 const counts={ok:true,attention:0,pending:0,live:0};const active=new Set();
 for(const x of candidates){
  const r=x.record,gid=String(r.group_id),id=x.kind+':'+gid;if(!gid||inactive.has(gid)||expiredListing_(r,x.kind))continue;active.add(id);
  const old=oldRows.find(q=>String(q.listing_id)===id),hash=githubPublicationHash_(r,x.kind),crop=cropRow_(String(r.original_image_file_id));
  const first=old&&old.input_hash===hash&&old.first_pending_at?new Date(old.first_pending_at).getTime():now;
  let state='pending',reason='',human=false;
  const review=reviews.find(q=>String(q.group_id)===gid||String(q.suggested_group_id)===gid),problem=publicationProblem_(r,x.kind),published=live.get(id);
  if(review){state='blocked';reason='Resolve the existing event review: '+review.issue;human=true;}
  else if(problem){state='blocked';reason=problem;human=true;}
  else if(crop&& !['ready','skip'].includes(crop.crop_status)){state='needs_crop';reason='Check the main poster crop: '+String(crop.crop_reason||'uncertain image selection');human=true;}
  else if(!crop){reason='Main poster image has not been prepared. It will retry automatically.';if(now-first>=PUBLICATION_AUDIT.WAIT_MS){state='stuck';reason='Main poster image has not been prepared for at least 3 hours. Open Fix poster crop, or check Gemini availability/daily limits.';human=true;}}
  else if(published&&published.publication_hash===hash){state='live';reason='Current details and crop are on the website.';}
  else if(published&&!published.publication_hash&&SHARING.FIELDS.concat(['area','place_type','location_note','valid_until','expiry_mode']).every(k=>String(published[k]||'')===String(publicListing_(r,x.kind)[k]||''))){state='live_legacy';reason='Published details match. Crop verification starts after the next export with the new code.';}
  else {reason=published?'Saved edits are waiting for the next successful hourly build.':'Listing is waiting for the next successful hourly build.';if(now-first>=PUBLICATION_AUDIT.WAIT_MS){state='stuck';reason=published?'Website is still showing an older version after 3 hours. Check the GitHub build.':'Listing is still missing after 3 hours. Check the GitHub build and export deployment.';human=true;}}
  if(human)counts.attention++;else if(state.indexOf('live')===0)counts.live++;else counts.pending++;
  const row={listing_id:id,title:r.title,status:state,attempt_count:old&&old.attempt_count||0,next_retry_at:'',last_error:reason,checked_at:new Date(now).toISOString(),first_pending_at:state.indexOf('live')===0?'':new Date(Number.isFinite(first)?first:now).toISOString(),input_hash:hash};
  const sh=table_(PUBLIC_QUEUE.TAB,PUBLIC_QUEUE.HEADERS);sh.getRange(old?old._row:sh.getLastRow()+1,1,1,PUBLIC_QUEUE.HEADERS.length).setValues([PUBLIC_QUEUE.HEADERS.map(k=>row[k]||'')]);
 }
 // Entries no longer active must not leave stale audit warnings behind.
 const sh=table_(PUBLIC_QUEUE.TAB,PUBLIC_QUEUE.HEADERS);oldRows.filter(q=>!active.has(String(q.listing_id))&&['live','live_legacy','pending','blocked','needs_crop','stuck'].includes(q.status)).forEach(q=>sh.getRange(q._row,PUBLIC_QUEUE.HEADERS.indexOf('status')+1).setValue('inactive'));
 delete optionalReadCache_[PUBLIC_QUEUE.TAB];return counts;
}
/** Add audit warnings to the ordinary review list, without turning them into
 * publication eligibility blockers or duplicate extraction reviews. */
function appendPublicationReviewRows_(review){
 if(!githubPublishing_())return;
 const raw=vrRows_(PIPE.RAW),all=vrRows_(PIPE.UPCOMING).map(record=>({record,kind:'event'})).concat(vrRows_(PIPE.PLACES).map(record=>({record,kind:'place'})));
 for(const q of readOptionalRows_(PUBLIC_QUEUE.TAB)){
  if(!['needs_crop','blocked','stuck'].includes(q.status))continue;
  const x=all.find(x=>x.kind+':'+x.record.group_id===String(q.listing_id));if(!x)continue;
  const r=x.record,id=String(r.group_id);if(review.some(y=>String(y.group_id)===id||String(y.suggested_group_id)===id))continue;
  const source=raw.find(s=>String(s.group_id)===id&&s.status!==CONFIG.STATUS.REJECTED&&!['research','trash','not_local'].includes(s.match_status));if(!source)continue;
  // A corrected crop/record removes its old warning immediately on refresh.
  const crop=cropRow_(String(r.original_image_file_id));
  if(q.status==='needs_crop'&&crop&&['ready','skip'].includes(crop.crop_status))continue;
  if(q.status==='blocked'&&!publicationProblem_(r,x.kind))continue;
  if(q.input_hash!==githubPublicationHash_(r,x.kind)&&q.status==='stuck')continue;
  review.push({open_popup:'Select row → Events menu → Review selected event',priority:'High',action:'',issue:'Publishing: '+q.last_error,existing_title:r.title,incoming_title:r.title,existing_date:r.start_date,incoming_date:r.start_date,existing_venue:r.venue,incoming_venue:r.venue,differences:x.kind+':'+id+' — checked '+q.checked_at,existing_poster:r.original_image_url,incoming_poster:r.original_image_url,source_id:source.id,group_id:id,suggested_group_id:''});
 }
}
