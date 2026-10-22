const assert=require('node:assert/strict'),{harness}=require('./harness.cjs');
const h=harness(),{run,context,rows}=h;run('withDataLock_(setupPipeline_)');
context.f=h.file('poster');context.geminiRequest_=()=>({text:JSON.stringify({events:[1,2].map(n=>({listing_kind:'event',title:'Workshop '+n,start_date:'2099-10-'+(20+n),venue:'Studio F-6 branch',address:'Street 4, F-6/2, Islamabad',source_account:'@studio',confidence:'high',uncertain_fields:[],poster_box:[0,100,1000,900],poster_confidence:'high'}))})});
run('processOneFile_(f)');const first=rows('Events')[0];context.g=first.group_id;
const review=run("getVisualReviewData({mode:'edit',groupId:g})");
context.payload={mode:'edit',action:'place',sourceId:first.id,groupId:'',fields:review.existing,reviewVersion:review.reviewVersion,placeType:'uncategorized',publication:{expiry_mode:'ongoing',area:'F-6'},confirmVenue:true};
run('saveVisualDecision(payload)');assert.equal(rows('Places & Activities').length,1);assert.equal(rows('Places & Activities')[0].group_id,first.group_id,'Move resolves missing client ID from immutable source');assert.equal(rows('Venue Directory').length,1);
context.record=rows('Places & Activities')[0];assert.equal(run("publicListing_(record,'place').area"),'F-6');
context.facts={...review.existing,address:''};assert.equal(run('researchVenueLocation({fields:facts}).confirmed'),true,'Confirmed venue lookup needs no Gemini');assert.equal(h.networkCalls(),0);
context.other={...review.existing,address:'Another branch, G-9'};assert.equal(run('confirmedVenue_(other)'),null);
assert.equal(run("explicitArea_('F-6/2 Islamabad')"),'F-6');assert.equal(run("explicitArea_('Transport from F-6 to G-9')"),'');assert.equal(run("explicitArea_('Studio Venue')"),'');
// Generated updated_at changes must not invalidate a bulk selection.
const second=rows('Events')[1];context.second=second;const version=run("bulkVersion_(second.group_id,PIPE.RECORDS)");run('withDataLock_(refreshEventViews_)');assert.equal(run("bulkVersion_(second.group_id,PIPE.RECORDS)"),version);
// A genuine edit still invalidates it.
run("withDataLock_(()=>{const r=visualEventRows_().find(r=>r.group_id===second.group_id);vrUpdateRow_(PIPE.UPCOMING,r._row,{title:'Changed title'});})");assert.notEqual(run("bulkVersion_(second.group_id,PIPE.RECORDS)"),version);
// Excluding one poster catches every workshop, including the moved place.
run('withDataLock_(()=>excludePosterLocked_(g))');assert.equal(rows('Places & Activities').length,0);assert(rows('Events').every(r=>r.match_status==='not_local'));assert.equal(rows('Publication Outbox').length,4);
// Manual crop is protected from subsequent automatic extraction.
run("withDataLock_(()=>storeCrop_('poster',[0,50,1000,950],'ready','Crop checked manually'))");context.raw=rows('Events');run("withDataLock_(()=>cacheExtractedCrops_('poster',raw))");assert.equal(rows('Poster Crops')[0].crop_json,'[0,50,1000,950]');
console.log('PASS: missing client group ID, one-save move, stable bulk version, venue reuse without AI, branch conflicts, area extraction, poster-wide exclusion, protected manual crop.');
