// Instagram links point to the account that made the event; repost pages (Visitopia, Events Finder) go last.
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {writeFile,rm} from 'node:fs/promises';
const out=await build({entryPoints:['src/Noticeboard.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom']});
const tmp=new URL('./.instagram-links.tmp.mjs',import.meta.url);await writeFile(tmp,out.outputFiles[0].text);const {instagramLinks,findReposters}=await import(tmp.href);await rm(tmp);
const l=(source_account,organizer='',contact='',description='')=>instagramLinks({source_account,organizer,contact,description}).map(x=>(x.shared?'shared:':'')+x.handle);
test('instagram links',()=>{
 assert.deepEqual(l('islamabad.visitopia.online','Neko Studio','@nekostudio.art'),['nekostudio.art','shared:islamabad.visitopia.online'],'Organizer first, repost page last');
 assert.deepEqual(l('islamabad.visitopia.online','The Hill Walkers','0370 1521849'),['shared:islamabad.visitopia.online'],'No organizer handle: still link the repost page');
 assert.deepEqual(l('events.finder','','','Tickets via @Tantrums.Studio.'),['tantrums.studio','shared:events.finder'],'Events Finder counts as a repost page');
 assert.deepEqual(l('themeup_co and anthologycafe'),['themeup_co','anthologycafe'],'Several accounts: show all');
 assert.deepEqual(l('themakersbazar','','@themakersbazar'),['themakersbazar'],'No duplicates');
 assert.deepEqual(l(''),[]);
});
test('reposters are found from the listings',async()=>{
 const {readFile}=await import('node:fs/promises');const items=JSON.parse(await readFile('docs/data/listings.json','utf8')).items;
 const r=findReposters(items);
 assert.ok(r.has('islamabad.visitopia.online'),'Visitopia posts other people\'s events');
 for(const own of ['themakersbazar','meemsheenstudio_','harfun.studio','islamabadrunwithus','theblackholeislamabad','tantrums.studio','paktrails.pk','tpolarisclub'])assert.ok(!r.has(own),own+' posts its own events');
 const e=(source_account,organizer)=>({source_account,organizer});
 assert.ok(findReposters([e('newpage','Neko Studio'),e('newpage','HEAL'),e('newpage','Team Revenant')]).has('newpage'),'A new repost page is caught at 3 listings');
 assert.ok(!findReposters([e('newpage','Neko Studio'),e('newpage','HEAL')]).has('newpage'),'Not before 3');
 assert.deepEqual(instagramLinks({source_account:'newpage',organizer:'',contact:'@heal.community_',description:''},new Set(['newpage'])).map(x=>(x.shared?'shared:':'')+x.handle),['heal.community_','shared:newpage']);
});
