/**
 * Stage 2 of staged processing (see PLAN.md "Staged processing"): group screenshots into posts by rules, before
 * extraction. For now this is a DRY RUN only: it reports the groups it would make from screenshots already read
 * (post_account and caption_start are saved since 16 Nov), so I can check the rule on real batches.
 * It changes nothing, takes no lock and makes no Gemini calls.
 */
const POST_GROUPS={
 DAYS:14,              // how far back the report looks (by capture time)
 GAP_MS:30*60000,      // a screenshot joins a post when taken within 30 minutes of another screenshot of it
 WEAK_GAP_MS:3*60000,  // same account but no readable caption: only reported as "maybe" when within 3 minutes
 MAX_GROUPS:150
};
function postGroupFiles_(){
 // One entry per screenshot (a poster with several listings has several rows but is one screenshot).
 const rows=readObjects_(ensureEventsSheet_()).filter(r=>r.id&&r.original_image_file_id&&r.status!==CONFIG.STATUS.ERROR);
 const since=Date.now()-POST_GROUPS.DAYS*86400000,byFile=new Map();
 rows.forEach(r=>{
  const id=String(r.original_image_file_id),moment=screenshotMoment_(r);
  if(moment===null||moment<since)return;
  if(!byFile.has(id)){
   const c=companionClues_(r),name=String(r.original_filename||'');
   byFile.set(id,{fileId:id,name:name,link:String(r.original_image_url||''),moment:moment,
    app:(name.match(/_([A-Za-z]+)(?:\s*\(\d+\))?\.[a-z]+$/)||[])[1]||'',
    account:blank_(c.post_account||r.source_account).toLowerCase().replace(/^@/,'').trim(),
    caption:String(c.caption_start||''),key:slideKey_(r),listings:[]});
  }
  byFile.get(id).listings.push({groupId:String(r.group_id||''),title:String(r.title||'Untitled'),status:String(r.match_status||'')});
 });
 return Array.from(byFile.values()).sort((a,b)=>a.moment-b.moment||a.name.localeCompare(b.name));
}
function postGroupsDryRun_(){
 const files=postGroupFiles_(),groups=[],maybes=[];
 // Strong rule: same app, same @account and the same caption opening (first 8 words), each screenshot within
 // 30 minutes of the previous one in the post.
 const strong=new Map();
 files.forEach(f=>{
  if(!f.key)return;const k=f.app+'|'+f.key,list=strong.get(k)||[];
  const last=list.length?list[list.length-1]:null;
  if(last&&f.moment-last[last.length-1].moment<=POST_GROUPS.GAP_MS)last.push(f);else list.push([f]);
  strong.set(k,list);
 });
 strong.forEach(list=>list.forEach(g=>{if(g.length>1)groups.push({rule:'Same @account and caption opening',files:g});}));
 // Weaker: same account, no caption key on at least one side, taken within 3 minutes. Reported only.
 const grouped=new Set();groups.forEach(g=>g.files.forEach(f=>grouped.add(f.fileId)));
 const loose=files.filter(f=>!grouped.has(f.fileId)&&f.account);
 let run=[];
 const flush=()=>{if(run.length>1&&run.some(f=>!f.key))maybes.push({rule:'Same @account only (no caption read), taken close together',files:run});run=[];};
 loose.forEach(f=>{const prev=run[run.length-1];if(prev&&prev.account===f.account&&prev.app===f.app&&f.moment-prev.moment<=POST_GROUPS.WEAK_GAP_MS)run.push(f);else{flush();run=[f];}});flush();
 const describe=g=>{
  const listings=new Map();g.files.forEach(f=>f.listings.forEach(l=>{if(l.groupId&&!listings.has(l.groupId))listings.set(l.groupId,l.title);}));
  const multi=g.files.some(f=>f.listings.length>1);
  return {rule:g.rule,account:g.files[0].account,caption:g.files.find(f=>f.caption)?g.files.find(f=>f.caption).caption:'',
   first:new Date(g.files[0].moment).toISOString(),
   files:g.files.map(f=>({fileId:f.fileId,name:f.name,link:f.link,listings:f.listings.length})),
   listingsNow:Array.from(listings,([groupId,title])=>({groupId:groupId,title:title})),
   multiListingScreenshot:multi};
 };
 const out=groups.map(describe).sort((a,b)=>b.first.localeCompare(a.first));
 return {ok:true,days:POST_GROUPS.DAYS,checkedAt:new Date().toISOString(),
  screenshots:files.length,withCaptionKey:files.filter(f=>f.key).length,
  posts:out.length,screenshotsGrouped:out.reduce((n,g)=>n+g.files.length,0),
  alreadyOneListing:out.filter(g=>g.listingsNow.length<=1).length,
  groups:out.slice(0,POST_GROUPS.MAX_GROUPS),maybes:maybes.map(describe).sort((a,b)=>b.first.localeCompare(a.first)).slice(0,60)};
}
