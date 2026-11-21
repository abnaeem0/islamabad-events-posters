// Mobile numbers in the contact become WhatsApp links naming the event and linking back to our page.
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {writeFile,rm} from 'node:fs/promises';
const out=await build({entryPoints:['src/Noticeboard.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom']});
const tmp=new URL('./.whatsapp-contact.tmp.mjs',import.meta.url);await writeFile(tmp,out.outputFiles[0].text);const {contactParts}=await import(tmp.href);await rm(tmp);
const nums=c=>contactParts(c,'Pottery Night','https://x.test/?item=1').filter(p=>p.wa).map(p=>p.wa.split('?')[0].slice(14));
test('whatsapp contact links',()=>{
 assert.deepEqual(nums('+923365776777'),['923365776777']);
 assert.deepEqual(nums('+923105191227; +923092532769'),['923105191227','923092532769']);
 assert.deepEqual(nums('Ibrahim Qureshi 0370 1521849; Asma Khan 0329 5470240'),['923701521849','923295470240']);
 assert.deepEqual(nums('051-20063602-3; 0342-5100710'),['923425100710'],'Landline stays plain');
 assert.deepEqual(nums('051-9258371-7 Ext. 173'),[]);
 assert.deepEqual(nums('@nekostudio.art'),[]);
 const p=contactParts('0322 3003220; amdigi@tourism.gov.pk','Pottery Night','https://x.test/?item=1');
 assert.equal(p.map(x=>x.text).join(''),'0322 3003220; amdigi@tourism.gov.pk','Text is kept as written');
 const msg=decodeURIComponent(p[0].wa.split('text=')[1]);
 assert.match(msg,/Pottery Night/);assert.match(msg,/https:\/\/x\.test\/\?item=1/);
});
