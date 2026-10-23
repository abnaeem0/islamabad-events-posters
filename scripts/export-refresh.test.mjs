import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import jpeg from 'jpeg-js';import {buildLatestExport} from './sync.mjs';
test('refresh reuses images, applies crop edits and removals, and stops safely on continual changes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'export-refresh-')),out=join(root,'docs');
 try{
  await mkdir(out+'/assets',{recursive:true});await writeFile(out+'/assets/app.js','');await writeFile(out+'/styles.css','');await writeFile(out+'/data-placeholder','old');
  const pixels=new Uint8Array(100*200*4).fill(255),bytes=jpeg.encode({width:100,height:200,data:pixels},80).data;
  const entry=(id,crop=[0,0,1000,1000])=>({item:{id:'event:'+id,kind:'event',title:id},images:[{fileId:id,crop}]});
  const a={version:'a',items:[entry('keep'),entry('remove'),entry('edit')]};
  const b={version:'b',items:[entry('keep'),entry('edit',[0,250,1000,750]),entry('add')]};
  const calls=[];const download=async image=>{calls.push(image.fileId);return {mime:'image/jpeg',data:Buffer.from(bytes).toString('base64')};};
  const result=await buildLatestExport(a,download,async()=>b,out);assert.equal(result.version,'b');
  assert.equal(calls.filter(x=>x==='keep').length,1);assert.equal(calls.filter(x=>x==='edit').length,2);assert.equal(calls.filter(x=>x==='add').length,1);
  const saved=await readFile(out+'/data/listings.json','utf8'),feed=JSON.parse(saved);assert.deepEqual(feed.items.map(x=>x.title),['keep','edit','add']);
  assert.equal(jpeg.decode(await readFile(out+'/'+feed.items[1].poster)).height,100);assert(!saved.includes('fileId'));assert(!saved.includes('ticket'));
  const referenced=new Set(feed.items.flatMap(x=>x.posters));assert.equal((await readdir(out+'/posters')).length,referenced.size);
  let revision=0;await assert.rejects(buildLatestExport(b,download,async()=>({...b,version:'changing-'+(++revision),items:b.items.map((e,i)=>i?e:{...e,item:{...e.item,title:'Edit '+revision}})}),out),/all 3 attempts/);assert.equal(revision,3);assert.equal(await readFile(out+'/data/listings.json','utf8'),saved);
  const rotated={version:'rotated',items:[...b.items].reverse().map(e=>({...e,item:{...e.item,published_at:'new timestamp',last_checked:'new check'},images:e.images.map(i=>({...i,expires:99999,ticket:'new-ticket'}))}))};const equivalent=await buildLatestExport(b,download,async()=>rotated,out);assert.equal(equivalent.version,'rotated');
  const empty={version:'empty',items:[]};await buildLatestExport(b,download,async()=>empty,out);assert.equal(JSON.parse(await readFile(out+'/data/listings.json')).items.length,0);assert.equal((await readdir(out+'/posters')).length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
