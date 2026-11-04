const assert=require('node:assert/strict'),crypto=require('node:crypto'),{harness}=require('./harness.cjs');
const h=harness(),{context,run}=h;
context.Utilities.computeHmacSha256Signature=(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest());context.Utilities.base64EncodeWebSafe=v=>Buffer.from(v).toString('base64url');
context.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
run('withDataLock_(setupPipeline_)');context.file=h.file('public-poster');context.geminiRequest_=()=>({text:JSON.stringify({events:[{listing_kind:'event',title:'Published event',start_date:'2099-12-20',venue:'Public park',confidence:'high',uncertain_fields:[],poster_box:[0,100,1000,900],poster_confidence:'high'}]})});run('processOneFile_(file)');
run("withDataLock_(()=>storeCrop_('public-poster',[0,100,1000,900],'ready','Visual v2: complete artwork'))");
h.props.set('GITHUB_EXPORT_TOKEN','test-'.repeat(10));h.props.set('PUBLICATION_TARGET','github');
function request(action,extra={},token=h.props.get('GITHUB_EXPORT_TOKEN')){context.request={postData:{contents:JSON.stringify({action,token,...extra})}};return JSON.parse(run('doPost(request).text'));}
assert.equal(request('manifest',{},'wrong').ok,false);
context.SpreadsheetApp.getActiveSpreadsheet=()=>null;
const manifest=request('manifest');assert(manifest.ok,manifest.error);assert.equal(manifest.items.length,1);assert(!JSON.stringify(manifest.items[0].item).includes('fileId'));
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
