const assert=require('node:assert/strict'),crypto=require('node:crypto'),{harness}=require('./harness.cjs');
const h=harness(),{context,run}=h;
context.Utilities.computeHmacSha256Signature=(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest());context.Utilities.base64EncodeWebSafe=v=>Buffer.from(v).toString('base64url');
context.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
run('withDataLock_(setupPipeline_)');context.file=h.file('public-poster');context.geminiRequest_=()=>({text:JSON.stringify({events:[{listing_kind:'event',title:'Published event',start_date:'2099-12-20',venue:'Public park',credited_accounts:['@Neko.Studio.','neko.studio','123','heal.community_'],confidence:'high',uncertain_fields:[],poster_box:[0,100,1000,900],poster_confidence:'high'}]})});run('processOneFile_(file)');
run("withDataLock_(()=>storeCrop_('public-poster',[0,100,1000,900],'ready','Visual v2: complete artwork'))");
h.props.set('GITHUB_EXPORT_TOKEN','test-'.repeat(10));h.props.set('PUBLICATION_TARGET','github');
function request(action,extra={},token=h.props.get('GITHUB_EXPORT_TOKEN')){context.request={postData:{contents:JSON.stringify({action,token,...extra})}};return JSON.parse(run('doPost(request).text'));}
assert.equal(request('manifest',{},'wrong').ok,false);
context.SpreadsheetApp.getActiveSpreadsheet=()=>null;
const manifest=request('manifest');assert(manifest.ok,manifest.error);assert.equal(manifest.items.length,1);assert(!JSON.stringify(manifest.items[0].item).includes('fileId'));
assert.equal(manifest.items[0].item.credited_accounts,'neko.studio, heal.community_','Credited accounts are cleaned and exported');
const image=manifest.items[0].images[0];assert.equal(request('file',image).ok,true);assert.equal(request('file',{...image,fileId:'private-chat'}).ok,false);
run("withDataLock_(()=>storeCrop_('public-poster',[0,100,1000,900],'review','Check crop'))");const held=request('manifest');assert.equal(held.items.length,0);assert.equal(held.held,1);assert.notEqual(held.version,manifest.version);
assert.equal(h.networkCalls(),0);console.log('PASS: authentication, web-app sheet access, approved-only export, signed file tickets, crop holds and snapshot versions.');

run("withDataLock_(()=>storeCrop_('public-poster',[0,0,1000,1000],'skip','Visual v2: no useful visual'))");
const noImage=request('manifest');assert.equal(noImage.items.length,1);assert.equal(noImage.items[0].images.length,0);

// Local review page: its own token, list of work, open and save through the same code as the Sheet dialog.
h.props.set('LOCAL_REVIEW_TOKEN','review-'.repeat(6));const reviewToken=h.props.get('LOCAL_REVIEW_TOKEN');
const review=(fn,args=[],token=reviewToken)=>request('review',{fn,args},token);
assert.equal(review('list',[],'wrong').ok,false);
assert.equal(review('list',[],h.props.get('GITHUB_EXPORT_TOKEN')).ok,false,'GitHub token must not use the review page calls');
assert.equal(request('manifest',{},reviewToken).ok,false,'review token must not export');
assert.equal(request('file',image,reviewToken).ok,false,'review token must not download files');
assert.equal(review('nope').ok,false,'only listed calls are allowed');
const before=JSON.stringify(run("vrRows_(PIPE.REVIEW)"));
const list=review('list');assert(list.ok,list.error);assert(list.result.queues.upcoming.length>=1);assert.equal(JSON.stringify(run("vrRows_(PIPE.REVIEW)")),before,'listing changes nothing');
// Open and save an event from the upcoming list, the way the page does it.
const ctx=list.result.queues.upcoming[0];const opened=review('get',[ctx]);assert(opened.ok,opened.error);assert.equal(opened.result.existing.title,'Published event');
const fields=Object.assign({},opened.result.existing,{title:'Published event (checked)'});
h.props.delete&&h.props.delete('PIPELINE_DIRTY');
const saved=review('save',[{action:'edit',fields,mode:ctx.mode,sourceId:opened.result.sourceId,groupId:opened.result.groupId,suggestedGroupId:'',posterChoice:'existing',placeType:'uncategorized',researchSelections:[],applySharedVenue:false,sharedVenueIds:[],reviewVersion:opened.result.reviewVersion,confirmVenue:false,approveAsIs:false,publication:{area:'',expiry_mode:'event',valid_until:'',location_note:''}}]);
assert(saved.ok,saved.error);assert(saved.result.ok);
assert.equal(run("vrRows_(PIPE.UPCOMING)[0].title"),'Published event (checked)');
assert.equal(h.props.get('PIPELINE_DIRTY'),'1','page saves leave the rebuild to the next inbox run');
const stale=review('save',[{action:'edit',fields,mode:ctx.mode,sourceId:opened.result.sourceId,groupId:opened.result.groupId,reviewVersion:opened.result.reviewVersion,publication:{}}]);
assert.equal(stale.ok,false,'a save based on an out-of-date view is refused');
console.log('PASS: review page token is separate, lists work, opens and saves through the Sheet dialog code, defers the rebuild, refuses stale saves.');

// Slides of one post: link a screenshot with no listing (extra slide) and one with its own listing (moves in), then unlink.
{
 const slideFile=h.file('slide-2');const own=h.file('slide-3');
 context.geminiRequest_=()=>({text:JSON.stringify({events:[{listing_kind:'event',title:'Slide three details',start_date:'2099-12-21',venue:'Somewhere',confidence:'high',uncertain_fields:[]}]})});context.ownFile=own;run('processOneFile_(ownFile)');
 run("(function(){const r=vrRows_(PIPE.RAW).find(x=>x.original_image_file_id==='slide-3');vrUpdateRow_(PIPE.RAW,r._row,{group_id:'E_'+r.id,match_status:'separate'});})()");
 const main=run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='public-poster')");
 const cands=review('slides',[{sourceId:main.id,groupId:main.group_id}]);assert(cands.ok,cands.error);
 const st=Object.fromEntries(cands.result.candidates.map(c=>[c.fileId,c.state]));
 assert.equal(st['public-poster'],'main');assert.equal(st['slide-2'],'none');assert.equal(st['slide-3'],'other');
 const linked=review('link',[{sourceId:main.id,groupId:main.group_id,link:['slide-2','slide-3']}]);assert(linked.ok,linked.error);assert.equal(linked.result.linked,2);
 assert.equal(run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='slide-3').group_id"),String(main.group_id));
 assert(run("companionClues_(vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='public-poster')).source_images.some(x=>x.fileId==='slide-2')"));
 assert(run("isProcessed_('slide-2')"),'a linked slide is not extracted on its own later');
 const again=review('slides',[{sourceId:main.id,groupId:main.group_id}]).result.candidates;assert(again.filter(c=>c.state==='linked').length===2);
 const stale=review('link',[{sourceId:main.id,groupId:'wrong',link:['slide-2']}]);assert.equal(stale.ok,false);
 // Read all linked slides together: suggestions only for missing fields, cached, nothing saved.
 let calls=0,seenImages=0;context.geminiRequest_=(m,payload)=>{calls++;seenImages=payload.contents[0].parts.filter(p=>p.inlineData).length;return {text:JSON.stringify({suggestions:[
  {field:'address',value:'House 5, Street 10, F-7/2, Islamabad',confidence:'high',reason:'Address slide',image_indices:[1]},
  {field:'price',value:'Rs 1500',confidence:'low',reason:'blurry',image_indices:[2]},
  {field:'title',value:'Something else',confidence:'high',reason:'x',image_indices:[0]},
  {field:'contact',value:'0300 1234567',confidence:'medium',reason:'Caption',image_indices:[9]}]})};};
 const mainNow=run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='public-poster')");
 const fields={title:'Published event',start_date:'2099-12-20',venue:'Somewhere'};
 const read=review('read_slides',[{sourceId:mainNow.id,groupId:mainNow.group_id,mode:'edit',fields}]);assert(read.ok,read.error);
 assert.equal(calls,1);assert(seenImages>=2,'all linked slides go to Gemini together');
 assert.deepEqual(read.result.suggestions.map(x=>x.field),['address','title'],'confident, sourced values: missing fields filled, clear mistakes flagged');
 assert(/^Differs from the current value "Published event"/.test(read.result.suggestions[1].reason));
 assert(read.result.key&&read.result.sources.length>=2);
 const again2=review('read_slides',[{sourceId:mainNow.id,groupId:mainNow.group_id,mode:'edit',fields}]);assert(again2.ok&&again2.result.cached);assert.equal(calls,1,'same slides and facts: cached, no second Gemini call');
 assert.equal(run("vrRows_(PIPE.UPCOMING)[0].address||''"),'','reading slides saves nothing');
 const forced=review('read_slides',[{sourceId:mainNow.id,groupId:mainNow.group_id,mode:'edit',fields,force:true}]);assert(forced.ok&&!forced.result.cached);assert.equal(calls,2,'Read again makes a fresh call');
 const un=review('link',[{sourceId:main.id,groupId:main.group_id,unlink:['slide-2','slide-3']}]);assert(un.ok,un.error);assert.equal(un.result.unlinked,2);
 assert.notEqual(run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='slide-3').group_id"),String(main.group_id));
 // A screenshot that produced two listings is used as a supporting slide: attached, not moved.
 const multi=h.file('two-workshops',[7,7,7,7,7]);context.geminiRequest_=()=>({text:JSON.stringify({events:[{listing_kind:'event',title:'Workshop A',start_date:'2099-12-22',venue:'Studio',confidence:'high',uncertain_fields:[]},{listing_kind:'event',title:'Workshop B',start_date:'2099-12-23',venue:'Studio',confidence:'high',uncertain_fields:[]}]})});context.multiFile=multi;run('processOneFile_(multiFile)');
 run("vrRows_(PIPE.RAW).filter(x=>x.original_image_file_id==='two-workshops').forEach(r=>vrUpdateRow_(PIPE.RAW,r._row,{group_id:'E_'+r.id,match_status:'separate'}))");
 const m2=run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='public-poster')");
 assert.equal(review('slides',[{sourceId:m2.id,groupId:m2.group_id}]).result.candidates.find(c=>c.fileId==='two-workshops').state,'support');
 const sup=review('link',[{sourceId:m2.id,groupId:m2.group_id,link:['two-workshops']}]);assert(sup.ok,sup.error);
 assert.equal(run("vrRows_(PIPE.RAW).filter(x=>x.original_image_file_id==='two-workshops'&&x.group_id==="+JSON.stringify(String(m2.group_id))+").length"),0,'its listings stay where they are');
 assert.equal(review('slides',[{sourceId:m2.id,groupId:m2.group_id}]).result.candidates.find(c=>c.fileId==='two-workshops').state,'linked');
 // "Just a slide": a screenshot with its own listing lends its picture but keeps its listing.
 {const keep=h.file('own-workshop',[8,8,8,8]);context.geminiRequest_=()=>({text:JSON.stringify({events:[{listing_kind:'event',title:'Workshop C',start_date:'2099-12-24',end_date:'2099-12-26',venue:'Studio',confidence:'high',uncertain_fields:[]}]})});context.keepFile=keep;run('processOneFile_(keepFile)');
  run("(function(){const r=vrRows_(PIPE.RAW).find(x=>x.original_image_file_id==='own-workshop');vrUpdateRow_(PIPE.RAW,r._row,{group_id:'E_'+r.id,match_status:'separate'});})()");
  const m3=run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='public-poster')");
  const res=review('link',[{sourceId:m3.id,groupId:m3.group_id,support:['own-workshop']}]);assert(res.ok,res.error);
  assert.notEqual(run("vrRows_(PIPE.RAW).find(x=>x.original_image_file_id==='own-workshop').group_id"),String(m3.group_id),'its own listing stays');
  assert.equal(review('slides',[{sourceId:m3.id,groupId:m3.group_id}]).result.candidates.find(c=>c.fileId==='own-workshop').state,'linked');
  // "Same event": its rows join, but never fill the listing's empty fields by themselves (no surprise end date).
  const un2=review('link',[{sourceId:m3.id,groupId:m3.group_id,unlink:['own-workshop']}]);assert(un2.ok,un2.error);
  // A fresh listing I have never edited (so the old blank-filling would apply).
  const fresh=h.file('fresh-main',[6,6,6,6]);context.geminiRequest_=()=>({text:JSON.stringify({events:[{listing_kind:'event',title:'Night Market',start_date:'2099-12-24',venue:'F-9 Park',confidence:'high',uncertain_fields:[]}]})});context.freshFile=fresh;run('processOneFile_(freshFile)');
  run("(function(){const r=vrRows_(PIPE.RAW).find(x=>x.original_image_file_id==='fresh-main');vrUpdateRow_(PIPE.RAW,r._row,{group_id:'E_'+r.id,match_status:'separate'});})()");run('withDataLock_(refreshEventViews_)');
  const m4=run("vrRows_(PIPE.RAW).find(r=>r.original_image_file_id==='fresh-main')");
  const res2=review('link',[{sourceId:m4.id,groupId:m4.group_id,link:['own-workshop']}]);assert(res2.ok,res2.error);
  assert(run("companionClues_(vrRows_(PIPE.RAW).find(x=>x.original_image_file_id==='own-workshop')).slide_of_post"));
  run('withDataLock_(refreshEventViews_)');
  const listing=run("vrRows_(PIPE.UPCOMING).concat(vrRows_(PIPE.RECORDS)).find(r=>String(r.group_id)==="+JSON.stringify(String(m4.group_id))+")");
  assert(listing,'listing still there');assert.equal(String(listing.end_date||''),'','a linked slide does not turn the listing into a multi-day event');}
 console.log('PASS: slides of a post can be listed, linked and unlinked, with no Drive calls under the lock.');
}
{
 const m=request('manifest');assert(m.ok,m.error);
 const ack=request('ack',{version:m.version,skipped:['event:X "Rise and Ride": Crop too small']});assert(ack.ok,ack.error);
 const status=JSON.parse(h.props.get('PUBLIC_SYNC_STATUS'));assert.deepEqual(status.skipped,['event:X "Rise and Ride": Crop too small']);
 console.log('PASS: listings left off by the build are recorded for the Sheet publishing status.');
}
{
 // Prefetch: several entries opened in one request; a bad one does not spoil the rest.
 const lists=review('list').result.queues,ctxs=lists.upcoming.slice(0,2).concat([{mode:'edit',sourceId:'',groupId:'no-such-group'}]);
 const many=review('get_many',[ctxs]);assert(many.ok,many.error);
 assert.equal(many.result.length,3);assert(many.result[0].ok&&many.result[0].result.groupId);assert.equal(many.result[2].ok,false);
 assert.equal(run('vrRowsMemo_'),null,'read memo is cleared after the batch');
 // Any review call marks a review session, which postpones the inbox rebuild.
 assert(run('reviewActive_()'));
 h.props.set('PIPELINE_DIRTY','1');run('processCompanionsWorker_(Date.now()+1000)');assert.equal(h.props.get('PIPELINE_DIRTY'),'1','no rebuild while reviewing');
 h.props.set('REVIEW_ACTIVE_UNTIL',String(Date.now()-1));assert(!run('reviewActive_()'));
 console.log('PASS: batched opens for prefetch; inbox rebuild waits while I review.');
}
