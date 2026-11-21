// "Suggest a change" from the website: public, capped, plain text only, shown on the review page, marked done there.
const assert=require('node:assert/strict'),{harness}=require('./harness.cjs');
const h=harness(),{context,run}=h;
context.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
const post=body=>{context.request={postData:{contents:JSON.stringify(body)}};return JSON.parse(run('doPost(request).text'));};
const suggest=extra=>post({action:'suggest',listing_id:'event:E_evt_1',listing_title:'Pottery Night',message:'The date is wrong, it is on Sunday.',...extra});
const tab=()=>h.rows('Suggestions');

assert.equal(suggest().ok,true);
assert.equal(tab().length,1);assert.equal(tab()[0].listing_title,'Pottery Night');assert.equal(tab()[0].status,'new');
assert.equal(suggest({message:'  '}).ok,false,'Empty notes are refused');
assert.equal(suggest({website:'http://spam'}).ok,true,'Bot field: fake thanks');assert.equal(tab().length,1,'…but nothing saved');
suggest({message:'=HYPERLINK("http://x","click")',contact:'+92300 1234567',listing_id:'bad id"; DROP'});
const r=tab()[1];assert.equal(r.message[0],"'",'A formula is saved as plain text');assert.equal(r.contact,"'+92300 1234567");assert.equal(r.listing_id,'','Odd listing ids are dropped');
suggest({message:'x'.repeat(5000)});assert.equal(tab().length,2,'Oversized request refused');
suggest({message:'y'.repeat(1500)});assert.equal(tab()[2].message.length,1000,'Long notes are cut to 1000 characters');
assert.equal(post({action:'suggest_nope'}).ok,false,'Other actions still need a token');

// Daily cap
h.props.set('SUGGESTIONS_TODAY',JSON.stringify({day:run('islamabadDay_()'),count:30}));
const capped=suggest();assert.equal(capped.ok,false);assert.match(capped.error,/tomorrow/);
h.props.set('SUGGESTIONS_TODAY',JSON.stringify({day:'2000-01-01',count:30}));assert.equal(suggest().ok,true,'A new day resets the cap');

// Review page
h.props.set('GITHUB_PAGES_URL','https://example.github.io/site/');
const open=run('openSuggestions_()');assert.equal(open.length,4);assert.equal(open[0].title,'Pottery Night','Newest first');
assert.equal(open[3].url,'https://example.github.io/site/?item=event%3AE_evt_1');
assert.throws(()=>run(`markSuggestionDone_({row:${open[0].row},received_at:'wrong'})`),/moved/);
run(`markSuggestionDone_(${JSON.stringify({row:open[0].row,received_at:open[0].received_at})})`);
assert.equal(run('openSuggestions_()').length,3);assert.ok(tab().find(x=>x._row===open[0].row).handled_at);
console.log('suggestions ok');
