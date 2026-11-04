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
 poster:(sourceId,fileId)=>getVisualPoster(sourceId,fileId,true,false)
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
/**
 * Run once from the Apps Script editor (or again to replace a leaked token).
 * Makes a new random token, saves it in Script Properties and shows it once to copy into the review page.
 */
function setupLocalReviewToken(){
 const token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
 PropertiesService.getScriptProperties().setProperty('LOCAL_REVIEW_TOKEN',token);
 SpreadsheetApp.getUi().alert('Local review token','Copy this into the review page Settings. Any older review token stops working now.\n\n'+token,SpreadsheetApp.getUi().ButtonSet.OK);
}
