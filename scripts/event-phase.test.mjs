// Multi-day events: trips and workshops leave Upcoming once started; drop-in festivals stay until their last day.
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {writeFile,rm} from 'node:fs/promises';
const out=await build({entryPoints:['src/Noticeboard.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom']});
const tmp=new URL('./.event-phase.tmp.mjs',import.meta.url);await writeFile(tmp,out.outputFiles[0].text);const {eventPhase}=await import(tmp.href);await rm(tmp);
const day='2026-11-16',e=(title,categories,start_date,end_date='')=>({title,categories,start_date,end_date});
test('multi-day event phases',()=>{
 assert.equal(eventPhase(e('Churko Peak Expedition','Hiking | Trekking','2026-11-14','2026-11-18'),day),'past');
 assert.equal(eventPhase(e('GIRLS IN THE WILD','trip | adventure','2026-11-15','2026-11-17'),day),'past');
 assert.equal(eventPhase(e('Bamboo Build Camp','Architecture | Workshop','2026-11-15','2026-11-17'),day),'past');
 assert.equal(eventPhase(e('Islamabad Taste Festival','Food | Festival','2026-11-14','2026-11-18'),day),'ongoing');
 assert.equal(eventPhase(e('Lakeside Picnic','Family | Exhibition | Market','2026-11-15','2026-11-16'),day),'ongoing');
 assert.equal(eventPhase(e('Festival trip to Chitral','Festival | Trip','2026-11-15','2026-11-18'),day),'past','Trip words win');
 assert.equal(eventPhase(e('Mystery thing','Misc','2026-11-15','2026-11-18'),day),'past','Unclear type counts as a trip');
 assert.equal(eventPhase(e('Pottery','Workshop','2026-11-16'),day),'upcoming','Starts today');
 assert.equal(eventPhase(e('Hike','Hike','2026-11-20','2026-11-22'),day),'upcoming');
 assert.equal(eventPhase(e('Fair','Fair','2026-11-01','2026-11-10'),day),'past');
});
