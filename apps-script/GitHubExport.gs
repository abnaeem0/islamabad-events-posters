/** Authenticated export for GitHub Actions. Never returns Research/Hold originals. */
function githubPublishing_(){return PropertiesService.getScriptProperties().getProperty('PUBLICATION_TARGET')==='github';}
function githubPublicUrl_(){const value=String(PropertiesService.getScriptProperties().getProperty('GITHUB_PAGES_URL')||'').trim();if(!/^https:\/\/[^\s?#]+\/$/.test(value))throw new Error('Set GITHUB_PAGES_URL to your HTTPS Pages URL, ending in /.');return value;}
function githubEqual_(a,b){a=String(a||'');b=String(b||'');let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function githubSignature_(fileId,expires){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(fileId+'|'+expires,PropertiesService.getScriptProperties().getProperty('GITHUB_EXPORT_TOKEN')));}
function githubManifest_(){
 return withDataLock_(function(){
  sharingTables_();
  if(PropertiesService.getScriptProperties().getProperty('PIPELINE_DIRTY')==='1')refreshEventViews_();
  const all=eligiblePublicRecords_(),seen=new Set(all.map(x=>x.kind+':'+x.record.group_id));
  const blocked=new Set(vrRows_(PIPE.RAW).filter(r=>r.status===CONFIG.STATUS.REJECTED||['research','trash','not_local','place'].includes(r.match_status)).map(r=>String(r.group_id)));
  const reviews=vrRows_(PIPE.REVIEW);reviews.forEach(r=>{blocked.add(String(r.group_id));if(r.suggested_group_id)blocked.add(String(r.suggested_group_id));});
  visualEventRows_().filter(r=>isPast_(r)&&!blocked.has(String(r.group_id))&&!publicationProblem_(r,'event')).forEach(r=>{if(!seen.has('event:'+r.group_id))all.push({record:r,kind:'event'});});
  const items=[];let held=0;
  all.forEach(x=>{
   const main=cropRow_(String(x.record.original_image_file_id));if(!main||!['ready','skip'].includes(main.crop_status)){held++;return;}
   const images=sourcesForGroup_(x.record.group_id,x.record.original_image_file_id).map(image=>{const crop=cropRow_(image.fileId);return crop&&crop.crop_status==='ready'?{fileId:image.fileId,crop:JSON.parse(crop.crop_json)}:null;}).filter(Boolean).slice(0,50);
   const item=publicListing_(x.record,x.kind);item.published_at=vrString_(x.record.updated_at||x.record.saved_at||x.record.processed_at,'updated_at')||new Date().toISOString();items.push({item: item,images:images});
  });
  // Tickets and derived timestamps must not destabilize the snapshot version.
  const version=digestKey_(JSON.stringify(items.map(x=>({item:Object.assign({},x.item,{published_at:'',last_checked:''}),images:x.images}))));
  const expires=Date.now()+3600000;items.forEach(x=>x.images.forEach(image=>{image.expires=expires;image.ticket=githubSignature_(image.fileId,expires);}));
  return {ok:true,version:version,items:items,held:held};
 });
}
function doPost(e){
 try{
  const text=e&&e.postData&&e.postData.contents||'';if(text.length>20000)throw new Error('Request too large');const body=JSON.parse(text);
  const token=PropertiesService.getScriptProperties().getProperty('GITHUB_EXPORT_TOKEN');
  if(!token||token.length<32||!githubEqual_(body.token,token))throw new Error('Unauthorized');
  if(!githubPublishing_())throw new Error('Set PUBLICATION_TARGET to github to enable export.');
  let result;
  if(body.action==='manifest')result=githubManifest_();
  else if(body.action==='file'){
   const id=String(body.fileId||''),expires=Number(body.expires);if(!id||!Number.isFinite(expires)||expires<Date.now()||expires>Date.now()+3600000||!githubEqual_(body.ticket,githubSignature_(id,expires)))throw new Error('Expired or invalid file ticket');
   const blob=DriveApp.getFileById(id).getBlob(),bytes=blob.getBytes();if(bytes.length>6*1024*1024||!/^image\/(jpeg|png)$/.test(blob.getContentType()))throw new Error('Unsupported or oversized source image');
   result={ok:true,mime:blob.getContentType(),data:Utilities.base64Encode(bytes)};
  }else if(body.action==='ack'){
   const current=githubManifest_();if(current.version!==body.version)throw new Error('Sheet changed since publication; next run will refresh it.');
   PropertiesService.getScriptProperties().setProperty('PUBLIC_SYNC_STATUS',JSON.stringify({checked_at:new Date().toISOString(),pending:current.held,needs_crop:current.held,published_this_run:current.items.length,target:'github'}));result={ok:true};
  }else throw new Error('Unknown export action');
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
 }catch(error){return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(error.message||error)})).setMimeType(ContentService.MimeType.JSON);}
}
function prepareGitHubPosters_(){
 return withJobLease_('github_crop_prepare',function(){const items=withDataLock_(function(){sharingTables_();if(PropertiesService.getScriptProperties().getProperty('PIPELINE_DIRTY')==='1')refreshEventViews_();return eligiblePublicRecords_();});let count=0;
  const seen=new Set();
  for(const x of items){
   for(const image of sourcesForGroup_(x.record.group_id,x.record.original_image_file_id)){
    const id=String(image.fileId);if(seen.has(id))continue;seen.add(id);
    if(visualCropCurrent_(cropRow_(id)))continue;
    if(count>=3)return {ok:true,queued:true};count++;
    try{suggestPosterCrop_(id);}catch(e){console.warn('Crop deferred: '+e.message);if(geminiBusyUntil_()>Date.now()||/Daily crop suggestion limit/.test(e.message))return {ok:true,queued:true};}
   }
  }
  return {ok:true,queued:true};
 });
}
