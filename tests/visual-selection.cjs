const assert=require('node:assert/strict'),{harness}=require('./harness.cjs');
const {context,run,file}=harness();run('withDataLock_(setupPipeline_)');file('image');let calls=0;
context.geminiRequest_=(model,body)=>{calls++;assert(body.contents[0].parts[0].text.includes('FULL ORIGINAL'));return {text:JSON.stringify({use_image:true,box:[0,200,1000,650],confidence:'high',reason:'complete relevant poster'})};};
run("withDataLock_(()=>storeCrop_('image',[0,400,1000,500],'ready','Old extraction crop'))");
assert.equal(run("suggestPosterCrop_('image').crop_json"),'[0,200,1000,650]');run("suggestPosterCrop_('image')");assert.equal(calls,1,'Cached visual selection');
run("withDataLock_(()=>storeCrop_('image',[0,100,1000,800],'ready','Crop checked manually'))");run("suggestPosterCrop_('image')");assert.equal(calls,1,'Manual choice preserved');
file('text');context.geminiRequest_=()=>({text:JSON.stringify({use_image:false,box:[0,0,1000,1000],confidence:'high',reason:'Unhelpful comment slide'})});assert.equal(run("suggestPosterCrop_('text').crop_status"),'skip');
file('uncertain');context.geminiRequest_=()=>({text:JSON.stringify({use_image:false,box:[0,0,1000,1000],confidence:'low',reason:'Unclear post identity'})});assert.equal(run("suggestPosterCrop_('uncertain').crop_status"),'review');
console.log('PASS independent visual selection, legacy refresh, caching, manual protection, skip and uncertainty');
