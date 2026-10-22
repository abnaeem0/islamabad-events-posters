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
