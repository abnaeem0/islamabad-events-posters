// ---- Local review page frame: settings, work lists, server bridge, background saves ----
const LR_KEY='localReview.v1';
const lrStore={get(){try{return JSON.parse(localStorage.getItem(LR_KEY)||'{}')}catch(e){return {}}},set(v){try{localStorage.setItem(LR_KEY,JSON.stringify(v))}catch(e){}}};
let lrSettings=Object.assign({folder:'G:\\My Drive\\Islamabad Events Inbox',url:'',token:'',tab:'review',last:{}},lrStore.get());
let lrQueues=null,lrSheetUrl='',lrLoadedAt='',lrPending=0,lrFailures=[],lrDone=new Set(),lrOptimistic=false,lrStarted=false;
const lrPrefetch=new Map();
const LR_TABS=[['review','To review'],['upcoming','Upcoming events'],['places','Places & activities'],['research','Research']];
const LR_CALLS={getVisualReviewData:'get',saveVisualDecision:'save',researchVisualDetails:'research',researchVenueLocation:'venue',collateVisualDescriptions:'collate',checkReviewPublishing:'publishing',getVisualPoster:'poster'};
const lrEl=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);}kids.flat(Infinity).forEach(k=>k!=null&&n.append(k));return n;};
const lrKey=ctx=>JSON.stringify([ctx.mode,ctx.sourceId||'',ctx.groupId||'']);
function lrSave(){lrStore.set(lrSettings);}
function localFileUrl(name){const base=lrSettings.folder.replace(/\\/g,'/').replace(/\/$/,'');return 'file:///'+base.split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/,'$1:')+'/'+encodeURIComponent(name);}

// The Sheet is locked for a minute or two while the inbox run rebuilds the tabs. Those refusals happen before
// anything is written, so it is safe to wait and try again instead of showing an error.
const LR_BUSY=/saving another change|Lock timeout|lock for too long|too many simultaneous|Service invocation/i;
const LR_WAITS=[3,5,10,15,20,30,30,30,30];
let lrBusyCount=0;
async function lrCall(fn,args){
 for(let attempt=0;;attempt++){
  try{const r=await lrCallOnce(fn,args);if(attempt){lrBusyCount--;lrStatus();}return r;}
  catch(e){
   if(!LR_BUSY.test(e.message)||attempt>=LR_WAITS.length){if(attempt){lrBusyCount--;lrStatus();}throw e;}
   if(!attempt){lrBusyCount++;lrStatus();}
   await new Promise(r=>setTimeout(r,LR_WAITS[attempt]*1000));
  }
 }
}
async function lrCallOnce(fn,args){
 // text/plain keeps this a simple request, so the browser does not need a CORS preflight.
 const res=await fetch(lrSettings.url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'review',token:lrSettings.token,fn,args})});
 let data;try{data=await res.json();}catch(e){throw new Error('The Sheet did not answer properly (HTTP '+res.status+').');}
 if(!data.ok){const message=data.error||'The Sheet refused the request.';throw new Error(/Unknown export action|Unauthorized/.test(message)&&fn==='list'?message+'\n\nIf this worked before, publish a new Web App version (Deploy → Manage deployments → Edit → New version) or check the token.':message);}
 return data.result;
}

// Stand-in for google.script.run, so the dialog code from the Sheet runs unchanged.
function lrRunner(ok,fail){return new Proxy({},{get(_,name){
 if(name==='withSuccessHandler')return f=>lrRunner(f,fail);
 if(name==='withFailureHandler')return f=>lrRunner(ok,f);
 if(name==='withUserObject')return ()=>lrRunner(ok,fail);
 return (...args)=>{
  const fn=LR_CALLS[name];if(!fn){fail&&fail(new Error('Not available on this page: '+String(name)));return;}
  if(fn==='get'){const key=lrKey(args[0]);const cached=lrPrefetch.get(key);lrPrefetch.delete(key);(cached||lrCall('get',args)).then(r=>ok&&ok(r),e=>fail&&fail(e));return;}
  if(fn==='save'&&lrOptimistic){lrOptimistic=false;lrBackgroundSave(args);ok&&ok({ok:true,destination:'background'});return;}
  lrCall(fn,args).then(r=>{if(fn==='save')lrMarkDone(args[0]);ok&&ok(r);},e=>fail&&fail(e));
 };
}});}
window.google={script:{run:lrRunner()}};

function lrBackgroundSave(args){
 const entry=queue[queueIndex],title=(data&&data.title)||'Untitled';lrPending++;lrStatus();
 lrCall('save',args).then(()=>{lrMarkDone(args[0]);},e=>{lrFailures.push({entry,title,error:e.message});lrRenderFailures();})
  .finally(()=>{lrPending--;lrStatus();});
}
function lrMarkDone(payload){lrDone.add(lrKey({mode:payload.mode,sourceId:payload.sourceId,groupId:payload.groupId}));lrRenderList();}
function lrStatus(){const s=document.getElementById('lr-saving');if(s)s.textContent=[lrPending?'Saving '+lrPending+' in the background…':'',lrBusyCount?'The Sheet is busy rebuilding; waiting…':''].filter(Boolean).join(' · ');}
function lrRenderFailures(){
 const box=document.getElementById('lr-failures');box.hidden=!lrFailures.length;box.replaceChildren();
 lrFailures.forEach((f,i)=>box.append(lrEl('div',{},'Not saved: '+f.title+' — '+f.error,
  lrEl('button',{onclick:()=>{lrFailures.splice(i,1);lrRenderFailures();lrOpen(f.entry);}},'Open it again'),
  lrEl('button',{onclick:()=>{lrFailures.splice(i,1);lrRenderFailures();}},'Dismiss'))));
}

function lrShowSettings(message){
 const f=lrEl('form',{id:'lr-settings'},
  lrEl('h2',{text:'Settings'}),lrEl('p',{text:'Typed once and kept only in this browser on this computer.'}),
  lrEl('label',{for:'lr-url',text:'Endpoint URL'}),lrEl('input',{id:'lr-url',value:lrSettings.url,placeholder:'https://script.google.com/macros/s/…/exec'}),
  lrEl('p',{text:'Apps Script → Deploy → Manage deployments → Web app URL (the same one GitHub uses).'}),
  lrEl('label',{for:'lr-token',text:'Review token'}),lrEl('input',{id:'lr-token',type:'password',value:lrSettings.token}),
  lrEl('p',{text:'Run setupLocalReviewToken once in the Apps Script editor, or see Project Settings → Script Properties → LOCAL_REVIEW_TOKEN. Not the GitHub token.'}),
  lrEl('label',{for:'lr-folder',text:'Screenshot folder'}),lrEl('input',{id:'lr-folder',value:lrSettings.folder}),
  lrEl('div',{style:'margin-top:16px'},lrEl('button',{type:'submit',class:'primary',text:'Save and load'})),
  message?lrEl('div',{class:'lr-err',text:message}):null);
 f.addEventListener('submit',e=>{e.preventDefault();lrSettings.url=f.querySelector('#lr-url').value.trim();lrSettings.token=f.querySelector('#lr-token').value.trim();lrSettings.folder=f.querySelector('#lr-folder').value.trim()||lrSettings.folder;lrSave();location.reload();});
 document.getElementById('lr-main').hidden=true;document.getElementById('lr-settings-host').replaceChildren(f);
}

function lrRenderTabs(){
 const host=document.getElementById('lr-tabs');host.replaceChildren();
 LR_TABS.forEach(([id,label])=>host.append(lrEl('button',{class:'tab'+(lrSettings.tab===id?' on':''),onclick:()=>lrSwitch(id)},label+' ('+((lrQueues&&lrQueues[id])||[]).length+')')));
 document.getElementById('lr-loaded').textContent=lrLoadedAt?'List loaded '+lrLoadedAt:'';
}
function lrRenderList(){
 const host=document.getElementById('lr-list');if(!host||typeof queue==='undefined')return;host.replaceChildren();
 queue.forEach((q,i)=>host.append(lrEl('button',{class:(i===queueIndex?'on ':'')+(lrDone.has(lrKey(q))?'done':''),onclick:()=>lrOpen(q)},lrEl('span',{class:'t',text:q.title||'Untitled'}),lrEl('span',{class:'i',text:[q.issue,q.date].filter(Boolean).join(' · ')}))));
 const on=host.querySelector('.on');if(on)on.scrollIntoView({block:'nearest'});
}
function lrUnsavedOk(){return !(typeof data!=='undefined'&&data&&!saved&&typeof editSignature==='function'&&editSignature()!==baseline)||confirm('Discard unsaved changes to this entry?');}
function lrOpen(entry){if(busy)return;if(!lrUnsavedOk())return;lrPrefetch.delete(lrKey(entry));const i=queue.findIndex(q=>lrKey(q)===lrKey(entry));if(i<0)return;queueIndex=i;navigate(0);}
function lrSwitch(tab){
 if(typeof busy!=='undefined'&&busy)return;if(lrStarted&&!lrUnsavedOk())return;
 lrSettings.tab=tab;lrSave();const items=(lrQueues&&lrQueues[tab])||[];lrRenderTabs();
 if(!items.length){document.getElementById('lr-dialog').hidden=true;document.getElementById('lr-empty').hidden=false;document.getElementById('lr-empty').textContent='Nothing here.';if(typeof queue!=='undefined'){queue.splice(0,queue.length);lrRenderList();}return;}
 document.getElementById('lr-dialog').hidden=false;document.getElementById('lr-empty').hidden=true;
 const lastKey=lrSettings.last[tab];const start=Math.max(0,items.findIndex(q=>lrKey(q)===lastKey));
 if(!lrStarted){window.REVIEW_CONTEXT=Object.assign({queue:items.slice()},items[start]);lrStartDialog();return;}
 queue.splice(0,queue.length,...items);queueIndex=start;navigate(0);
}
function lrPrefetchNext(){
 if(typeof queue==='undefined')return;const next=queue[queueIndex+1];if(!next)return;const key=lrKey(next);
 if(lrPrefetch.has(key)||lrDone.has(key))return;const p=lrCall('get',[next]);p.catch(()=>lrPrefetch.delete(key));lrPrefetch.set(key,p);
 // Warm the browser cache for the next item's screenshots too.
 p.then(d=>(d.sources||[]).forEach(s=>{if(s.label){const im=new Image();im.src=localFileUrl(s.label);}})).catch(()=>{});
}
function lrStartDialog(){
 lrStarted=true;const s=document.createElement('script');s.textContent=document.getElementById('lr-dialog-script').textContent;document.body.append(s);
 // Hooks around the Sheet dialog's own functions.
 const baseRender=render;render=function(d){baseRender(d);lrSettings.last[lrSettings.tab]=lrKey(queue[queueIndex]);lrSave();lrRenderList();lrResetCompare();lrRenderSlides(d);lrPrefetchNext();if(lrReadAfterLoad&&lrReadAfterLoad===d.groupId){lrReadAfterLoad='';lrReadSlides(d);}};
 const baseSave=saveCurrent;saveCurrent=function(advance){lrOptimistic=!!advance;baseSave(advance);lrOptimistic=false;};
 lrSetupCompare();
 lrRenderList();
}
// ---- Slides of this post: link carousel slides and other screenshots of the same post ----
let lrSlideEpoch=0,lrReadAfterLoad='';
// Gemini reads every linked slide together and suggests this listing's missing details.
// The suggestions appear in the research box with "Use this value"; nothing is saved until you save.
function lrReadSlides(d,force){
 const status=$('researchStatus');status.textContent='Reading all linked slides for missing details…';
 lrCall('read_slides',[{sourceId:d.sourceId,groupId:d.groupId,mode:d.mode,fields:finalFields(),force:!!force}]).then(r=>{
  if(data!==d||saved)return;researchResult=r;researchSelections.clear();renderResearch(r);
  status.textContent=r.suggestions.length?(r.cached?'From the linked slides (already read before).':'Read from the linked slides.')+' Choose the values to use.':'The linked slides add no missing details.';
  $('researchResults').scrollIntoView({block:'nearest',behavior:'smooth'});
 },e=>{if(data===d)status.textContent=e.message;});
}
function lrRenderSlides(d){
 const epochNow=++lrSlideEpoch;let box=document.getElementById('lr-slides');
 if(!box){box=lrEl('details',{id:'lr-slides'});const posters=document.querySelector('#lr-dialog .posters');posters.after(box);}
 box.replaceChildren(lrEl('summary',{},lrEl('b',{text:'Slides of this post'}),' ',lrEl('span',{class:'note',text:'Screenshots taken within 20 minutes of this one. Tick the ones that belong to the same post.'})));
 if(d.mode==='holding'||!d.sourceId){box.hidden=true;return;}box.hidden=false;
 const load=()=>{
  if(box.dataset.loaded==='1')return;box.dataset.loaded='1';const row=lrEl('div',{class:'row',text:'Loading nearby screenshots…'});box.append(row);
  lrCall('slides',[{sourceId:d.sourceId,groupId:d.groupId}]).then(r=>{if(epochNow!==lrSlideEpoch)return;lrFillSlides(box,row,d,r);},e=>{if(epochNow===lrSlideEpoch)row.textContent=e.message;});
 };
 box.dataset.loaded='';box.open=d.mode==='review';box.ontoggle=()=>{if(box.open)load();};if(box.open)load();
}
function lrFillSlides(box,row,d,r){
 row.replaceChildren();const checks=[];
 r.candidates.forEach(c=>{
  const img=lrEl('img',{src:localFileUrl(c.name),alt:c.name,loading:'lazy',title:c.name});
  img.addEventListener('error',()=>{img.replaceWith(lrEl('div',{class:'note',style:'height:260px;width:150px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;text-align:center'},lrEl('a',{href:c.link,target:'_blank',text:'Not on this computer yet — open in Drive'})));});
  img.addEventListener('click',()=>{lastFocus=img;$('zoom').hidden=false;$('zoomImg').onload=fitZoom;$('zoomImg').src=img.src;$('zoomClose').focus();});
  const tick=lrEl('input',{type:'checkbox'});tick.checked=c.state==='main'||c.state==='linked';tick.disabled=c.state==='main'||c.state==='blocked';tick.dataset.state=c.state;tick.dataset.fileId=c.fileId;checks.push(tick);
  const when=c.minutes===0?'same minute':(c.minutes>0?'+':'')+c.minutes+' min';
  row.append(lrEl('div',{class:'slide '+(c.state==='main'?'main':c.state==='linked'?'linked':'')},img,lrEl('label',{},tick,lrEl('span',{text:when+' · '+c.detail}))));
 });
 if(r.candidates.length<2)row.append(lrEl('div',{class:'note',text:'No other screenshots near this one.'}));
 const msg=lrEl('span',{class:'note'});
 const apply=lrEl('button',{type:'button',text:'Save slides'});
 apply.onclick=()=>{
  const link=checks.filter(t=>t.checked&&['none','other','support'].includes(t.dataset.state)).map(t=>t.dataset.fileId);
  const unlink=checks.filter(t=>!t.checked&&t.dataset.state==='linked').map(t=>t.dataset.fileId);
  if(!link.length&&!unlink.length){msg.textContent='Nothing changed.';return;}
  const moving=checks.filter(t=>t.checked&&t.dataset.state==='other').length;
  if(moving&&!confirm(moving+' ticked screenshot(s) have their own listing. Linking moves that listing into this one (like Merge). Continue?'))return;
  if(typeof saved!=='undefined'&&!saved&&editSignature()!==baseline&&!confirm('Linking reloads this entry. Discard unsaved changes to the fields?'))return;
  apply.disabled=true;msg.textContent='Saving slides…';
  lrCall('link',[{sourceId:d.sourceId,groupId:d.groupId,link,unlink}]).then(res=>{
   msg.textContent='Linked '+res.linked+', unlinked '+res.unlinked+(res.skipped.length?' · Skipped: '+res.skipped.join('; '):'')+'.';
   const ctx=queue[queueIndex];if(ctx)lrPrefetch.delete(lrKey(ctx));if(res.linked)lrReadAfterLoad=d.groupId;navigate(0);
  },e=>{apply.disabled=false;msg.textContent=e.message;});
 };
 const linkedCount=r.candidates.filter(c=>c.state==='main'||c.state==='linked').length;
 const read=lrEl('button',{type:'button',text:'Read all linked slides for missing details'});read.disabled=linkedCount<2;
 read.title=linkedCount<2?'Link at least one more slide first.':'Gemini reads the '+linkedCount+' linked screenshots together. Uses one Gemini call.';
 // Pressing the button reads again even if an earlier answer is cached; linking reads once automatically.
 read.onclick=()=>lrReadSlides(d,true);
 box.append(lrEl('div',{style:'display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap'},apply,read,msg));
}
// ---- Comparing two screenshots side by side ----
// Long screenshots (poster plus caption) are shown at full width, top-aligned, in two panels that scroll
// together, so the same line of both stays level. A magnifier follows the pointer.
const LR_SIZES=[['fit','Whole'],['width','Fit width'],['150','150%'],['200','200%']],LR_LENSES=[['0','Off'],['2','2×'],['3','3×']];
function lrView(){return Object.assign({size:'width',sync:true,lens:'2'},lrSettings.view||{});}
function lrApplyView(){
 const v=lrView(),posters=document.querySelector('#lr-dialog .posters');if(!posters)return;
 posters.dataset.lrSize=v.size;posters.dataset.lrLens=v.lens;
 document.querySelectorAll('#lr-view [data-size]').forEach(b=>b.classList.toggle('on',b.dataset.size===v.size));
 document.querySelectorAll('#lr-view [data-lens]').forEach(b=>b.classList.toggle('on',b.dataset.lens===v.lens));
 const sync=document.getElementById('lr-sync');if(sync)sync.checked=v.sync;
}
function lrSetView(patch){lrSettings.view=Object.assign(lrView(),patch);lrSave();lrApplyView();}
function lrSetupCompare(){
 const posters=document.querySelector('#lr-dialog .posters');if(!posters||document.getElementById('lr-view'))return;
 const seg=(items,key)=>lrEl('span',{class:'seg'},items.map(([v,label])=>lrEl('button',{type:'button',['data-'+key]:v,onclick:()=>lrSetView({[key]:v})},label)));
 posters.before(lrEl('div',{id:'lr-view'},
  lrEl('span',{},'Size ',seg(LR_SIZES,'size')),
  lrEl('label',{},lrEl('input',{type:'checkbox',id:'lr-sync',onchange:e=>lrSetView({sync:e.target.checked})}),' Scroll both together'),
  lrEl('span',{},'Magnifier ',seg(LR_LENSES,'lens')),
  lrEl('span',{class:'hint',text:'Scroll inside either picture. Hover to magnify. Click for full screen.'})));
 // Wrap each picture in its own scroll panel; keep both panels level.
 const panes=['leftImg','rightImg'].map(id=>{const img=document.getElementById(id);const box=lrEl('div',{class:'lr-scroll'});img.before(box);box.append(img);return box;});
 let syncing=false;
 panes.forEach((box,i)=>box.addEventListener('scroll',()=>{if(syncing||!lrView().sync)return;const other=panes[1-i];syncing=true;other.scrollTop=box.scrollTop;other.scrollLeft=box.scrollLeft;requestAnimationFrame(()=>{syncing=false;});}));
 // Magnifier
 const lens=lrEl('div',{id:'lr-lens',hidden:''});document.body.append(lens);
 ['leftImg','rightImg'].forEach(id=>{const img=document.getElementById(id);
  img.addEventListener('mousemove',e=>{const factor=Number(lrView().lens);if(!factor||!img.src){lens.hidden=true;return;}
   const r=img.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,size=260;
   lens.hidden=false;lens.style.left=(e.clientX-size/2)+'px';lens.style.top=(e.clientY-size/2)+'px';
   lens.style.backgroundImage='url("'+img.src.replace(/"/g,'%22')+'")';
   lens.style.backgroundSize=(r.width*factor)+'px '+(r.height*factor)+'px';
   lens.style.backgroundPosition=(size/2-x*factor)+'px '+(size/2-y*factor)+'px';});
  img.addEventListener('mouseleave',()=>{lens.hidden=true;});
 });
 window.addEventListener('scroll',()=>{lens.hidden=true;},{passive:true});
 lrApplyView();
}
function lrResetCompare(){document.querySelectorAll('#lr-dialog .lr-scroll').forEach(b=>{b.scrollTop=0;b.scrollLeft=0;});const lens=document.getElementById('lr-lens');if(lens)lens.hidden=true;}
async function lrLoad(){
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(lrSettings.url)||lrSettings.token.length<32){lrShowSettings(lrSettings.url?'Check the endpoint URL and token.':'');return;}
 document.getElementById('lr-loaded').textContent='Loading list…';
 try{const r=await lrCall('list',[]);lrQueues=r.queues;lrSheetUrl=r.sheetUrl||'';lrLoadedAt=new Date(r.checked_at).toLocaleTimeString();}
 catch(e){lrShowSettings('Could not load the list: '+e.message);return;}
 lrRenderTabs();
 if(!lrStarted)lrSwitch(lrSettings.tab);
 else{const items=lrQueues[lrSettings.tab]||[],current=queue[queueIndex];queue.splice(0,queue.length,...items);const i=current?items.findIndex(q=>lrKey(q)===lrKey(current)):-1;if(i>=0)queueIndex=i;else{queueIndex=0;if(items.length)navigate(0);}lrRenderList();updateNavigation();}
}
window.addEventListener('beforeunload',e=>{if(lrPending){e.preventDefault();e.returnValue='';}});
document.getElementById('lr-refresh').onclick=()=>lrLoad();
document.getElementById('lr-reload').onclick=()=>{if(typeof queue!=='undefined'&&queue.length&&lrUnsavedOk()){lrPrefetch.delete(lrKey(queue[queueIndex]));navigate(0);}};
document.getElementById('lr-settings-btn').onclick=()=>lrShowSettings('');
document.getElementById('lr-sheet').onclick=()=>{if(lrSheetUrl)window.open(lrSheetUrl,'_blank');};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&typeof saveCurrent==='function'){e.preventDefault();saveCurrent(queueIndex<queue.length-1?1:0);}});
lrLoad();
