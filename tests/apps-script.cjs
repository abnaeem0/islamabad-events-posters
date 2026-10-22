const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {harness}=require('./harness.cjs');const {context}=harness();
const run=s=>vm.runInContext(s,context);
assert.equal(run('validCrop_([0,100,1000,900])'),true);assert.equal(run('validCrop_([900,100,100,800])'),false);assert.equal(run('validCrop_([0,0,1001,1000])'),false);assert.equal(run('validCrop_([0,0,NaN,1000])'),false);
run(`globalThis.data={
 'Event Review':[{group_id:'bad'},{group_id:'new',suggested_group_id:'target'}],
 'Upcoming Events':[{group_id:'good',title:'Good',venue:'Park',start_date:'2099-10-17',publication_status:'ready',original_image_file_id:'a'},{group_id:'bad',title:'Bad',venue:'Park',start_date:'2099-10-17',publication_status:'ready',original_image_file_id:'b'},{group_id:'target',title:'Target',venue:'Park',start_date:'2099-10-17',publication_status:'ready',original_image_file_id:'c'},{group_id:'held',title:'Held',venue:'Park',start_date:'2099-10-17',publication_status:'held',original_image_file_id:'d'}],
 'Places & Activities':[{group_id:'place',title:'Trail',venue:'Margalla',original_image_file_id:'p'}]};
 vrRows_=name=>data[name]||[];dateKey_=v=>String(v||'');
`);
assert.deepEqual(JSON.parse(run('JSON.stringify(eligiblePublicRecords_().map(x=>x.kind+":"+x.record.group_id))')),['event:good','place:place']);
const listing=JSON.parse(run(`JSON.stringify(publicListing_({group_id:'p',title:'Trail',venue:'Margalla',manual_notes:'secret notes',event_snapshot:JSON.stringify({start_date:'2026-10-01',start_time:'09:00'}),original_image_url:'private',research_sources:'private',place_type:'day_trip'},'place'))`));
assert.equal(listing.start_date,'2026-10-01');assert.equal(listing.start_time,'09:00');assert.equal(listing.id,'place:p');assert(!('manual_notes' in listing));assert(!('original_image_url' in listing));assert(!('research_sources' in listing));
run(`globalThis.sheet={getLastColumn:()=>3,getLastRow:()=>5,getRange:(r,c,n,w)=>({getValues:()=>r===1?[['title','group_id','venue']]:Array.from({length:n},(_,i)=>['G1','G2','G2','G3'][r+i-2]).map(x=>[x])})};globalThis.ranges=[{getRow:()=>2,getNumRows:()=>3},{getRow:()=>4,getNumRows:()=>2}];`);
assert.deepEqual(JSON.parse(run('JSON.stringify(selectionGroupIds_(sheet,ranges))')),['G1','G2','G3']);
// Menus point to actual handlers; direct move/copy does not open BulkDialog.
const uiCode=fs.readFileSync('apps-script/ReviewUI.gs','utf8'),menuCode=fs.readFileSync('apps-script/MenuActions.gs','utf8');assert(uiCode.includes("addSubMenu(move)"));assert(!menuCode.includes('showModalDialog'));
const pipeline=fs.readFileSync('apps-script/EventsPipeline.gs','utf8');assert(pipeline.includes("['not_local','trash','research'].indexOf(x.match_status)>=0"));assert(pipeline.includes('match_status:blocked.match_status'));
console.log('Passed: crop validation, public eligibility/conflict holds, field whitelist, place date context, selected row dedupe, menu moves, Trash suppression.');
