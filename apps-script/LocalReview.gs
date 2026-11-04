/**
 * Read-only review list for the local review page (review/index.html).
 * Reached through doPost action 'review_list' with LOCAL_REVIEW_TOKEN (not the GitHub export token).
 * No lock: it only reads, so it never blocks inbox runs, saves or the site build.
 */
function localReviewFiles_(sourceRow){
 if(!sourceRow)return [];
 const files=[{name:String(sourceRow.original_filename||''),fileId:String(sourceRow.original_image_file_id||''),link:String(sourceRow.original_image_url||'')}];
 (companionClues_(sourceRow).source_images||[]).forEach(x=>files.push({name:String(x.label||''),fileId:String(x.fileId||''),link:String(x.link||'')}));
 const seen=new Set();
 return files.filter(f=>f.fileId&&!seen.has(f.fileId)&&seen.add(f.fileId));
}
function localReviewList_(){
 const sources=vrRows_(PIPE.RAW),byId=new Map(sources.map(r=>[String(r.id),r]));
 const groupFiles=(groupId,skipId)=>{const out=[];if(!groupId)return out;sources.forEach(r=>{if(String(r.group_id)===String(groupId)&&String(r.id)!==String(skipId)&&r.status!==CONFIG.STATUS.ERROR)out.push(...localReviewFiles_(r));});const seen=new Set();return out.filter(f=>!seen.has(f.fileId)&&seen.add(f.fileId));};
 const text=(row,key)=>vrString_(row&&row[key],key);
 const items=vrRows_(PIPE.REVIEW).filter(r=>r.source_id||r.group_id).map(r=>{
  const source=byId.get(String(r.source_id))||null,target=String(r.suggested_group_id||'');
  const details={};['title','start_date','end_date','start_time','end_time','venue','address','organizer','price','contact','registration_url','description','source_account'].forEach(k=>details[k]=text(source,k));
  return {
   row:r._row,priority:text(r,'priority'),issue:text(r,'issue'),differences:text(r,'differences'),
   audit:isPublicationReviewRow_(r),
   source_id:String(r.source_id||''),group_id:String(r.group_id||''),suggested_group_id:target,
   existing:{title:text(r,'existing_title'),date:text(r,'existing_date'),time:text(r,'existing_time'),venue:text(r,'existing_venue')},
   incoming:{title:text(r,'incoming_title'),date:text(r,'incoming_date'),time:text(r,'incoming_time'),venue:text(r,'incoming_venue')},
   details:details,confidence:text(source,'confidence'),uncertain_fields:text(source,'uncertain_fields'),notes:text(source,'extraction_notes'),
   incoming_files:localReviewFiles_(source),
   existing_files:target?groupFiles(target,r.source_id):[]
  };
 });
 return {ok:true,checked_at:new Date().toISOString(),items:items};
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
