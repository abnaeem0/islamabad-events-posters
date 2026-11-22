import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import jpeg from 'jpeg-js';import {buildExport,posterCache} from './sync.mjs';
// A second build reuses cropped posters instead of downloading them again; a changed crop or
// crop code downloads again, and posters no longer used are removed.
test('poster cache skips repeat downloads and prunes unused posters',async()=>{const root=await mkdtemp(join(tmpdir(),'poster-cache-')),out=root+'/docs',dir=root+'/cache';try{
 await mkdir(out+'/assets',{recursive:true});await writeFile(out+'/assets/app.js','');await writeFile(out+'/styles.css','');
 const data=jpeg.encode({width:200,height:400,data:new Uint8Array(200*400*4).fill(200)},88).data;
 let downloads=0;const download=async()=>{downloads++;return {mime:'image/jpeg',data:Buffer.from(data).toString('base64')};};
 const listing=(crop)=>({version:'v'+crop[1],items:[{item:{id:'event:E_1',kind:'event',title:'One',start_date:'2099-01-01'},images:[{fileId:'f1',crop}]}]});
 const build=async(m,salt='a')=>{const cache=posterCache(dir,salt);const snap=await buildExport(m,download,async()=>m,out,new Map(),cache);return {snap,removed:await cache.prune()};};
 const first=await build(listing([0,0,1000,500]));assert.equal(downloads,1);
 const second=await build(listing([0,0,1000,500]));assert.equal(downloads,1,'cached poster reused');
 assert.equal(second.snap.items[0].poster,first.snap.items[0].poster);assert.equal(second.removed,0);
 const recropped=await build(listing([0,100,1000,600]));assert.equal(downloads,2,'new crop downloads again');assert.equal(recropped.removed,1,'old crop pruned');
 await build(listing([0,100,1000,600]),'b');assert.equal(downloads,3,'new crop code downloads again');
 assert.equal((await readdir(dir)).length,1);
}finally{await rm(root,{recursive:true,force:true});}});
