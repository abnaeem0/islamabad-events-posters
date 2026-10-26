const assert=require('node:assert/strict'),{harness}=require('./harness.cjs');
const h=harness(),{context:c,run,rows}=h;run('withDataLock_(setupPipeline_)');
h.props.set('PUBLICATION_TARGET','github');h.props.set('GITHUB_PAGES_URL','https://example.org/events/');
c.file=h.file('shared-poster');c.geminiRequest_=()=>({text:JSON.stringify({events:[1,2,3].map(n=>({listing_kind:'event',title:'Workshop '+n,start_date:'2099-11-21',venue:'Studio',confidence:'high',uncertain_fields:[]}))})});run('processOneFile_(file)');
const group=rows('Events')[0].group_id;c.group=group;c.now=Date.now();c.feed={items:[],exported_at:new Date(c.now).toISOString()};
run("withDataLock_(()=>storeCrop_('shared-poster',[0,50,1000,950],'review','Visual v2: uncertain bounds'))");
run('withDataLock_(()=>{updatePublicationAuditLocked_(feed,now);refreshEventViews_();})');
assert.equal(rows('Event Review').length,3);assert(rows('Event Review').every(r=>String(r.issue).startsWith('Publishing: ')));
assert.equal(run('eligiblePublicRecords_().length'),3,'Audit warnings must not exclude their own records');
run("withDataLock_(()=>{storeCrop_('shared-poster',[0,50,1000,950],'ready','Crop checked manually');refreshEventViews_();})");assert.equal(rows('Event Review').length,0,'Manual crop immediately clears stale crop warnings');
run('withDataLock_(()=>updatePublicationAuditLocked_(feed,now))');assert(rows('Publication Queue').every(r=>r.status==='pending'));
run('withDataLock_(()=>{updatePublicationAuditLocked_(feed,now+4*3600000);refreshEventViews_();})');assert(rows('Publication Queue').every(r=>r.status==='stuck'));assert.equal(rows('Event Review').length,3);
c.feed={items:run("eligiblePublicRecords_().map(x=>Object.assign(publicListing_(x.record,x.kind),{publication_hash:githubPublicationHash_(x.record,x.kind)}))"),exported_at:new Date(c.now+4*3600000).toISOString()};
run('withDataLock_(()=>{updatePublicationAuditLocked_(feed,now+4*3600000);refreshEventViews_();})');assert(rows('Publication Queue').every(r=>r.status==='live'));assert.equal(rows('Event Review').length,0);
// Network failure must not replace trustworthy audit results with fake missing entries.
c.UrlFetchApp.fetch=()=>{assert(!h.held());throw new Error('offline');};assert.equal(run('auditWebsitePublishing_(true).ok'),false);assert(rows('Publication Queue').every(r=>r.status==='live'));
// Existing ticks are explicit, validated, and exclude exactly their own groups.
const d=run("getVisualReviewData({mode:'edit',groupId:group})");assert.equal(d.posterTargets.length,3);
c.payload={mode:'edit',sourceId:d.sourceId,groupId:group,action:'not_local',notLocalItems:[]};assert.throws(()=>run('saveVisualDecision(payload)'),/Tick at least one/);assert(rows('Events').every(r=>r.match_status!=='not_local'));
c.payload.notLocalItems=[{groupId:'unrelated',version:'fake'}];assert.throws(()=>run('saveVisualDecision(payload)'),/not on this poster/);assert(rows('Events').every(r=>r.match_status!=='not_local'));
c.payload.notLocalItems=d.posterTargets.slice(0,2).map(r=>({groupId:r.groupId,version:r.version}));const result=run('saveVisualDecision(payload)');assert.equal(result.count,2);assert.equal(rows('Events').filter(r=>r.match_status==='not_local').length,2);assert.equal(rows('Upcoming Events').length,1);
assert.equal(h.networkCalls(),0,'Audit adds no Gemini calls');console.log('PASS: publication holds, pending/stuck/live transitions, no self-blocking, warning clearing, failed fetch preservation, exact checked selection, empty/unrelated rejection.');
