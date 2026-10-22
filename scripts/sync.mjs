import {readFile,writeFile,mkdir,copyFile,rm,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{render}=require('./render.cjs'),{cropPoster}=require('./crop.cjs');
export function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export async function request(action,extra={}){
 const endpoint=process.env.EXPORT_URL,token=process.env.EXPORT_TOKEN;
 if(!endpoint||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)||!token||token.length<32)throw new Error('Set EXPORT_URL and EXPORT_TOKEN repository secrets.');
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action,...extra}),signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw new Error('Export request failed (HTTP '+response.status+').');
 let result;try{result=await response.json();}catch{throw new Error('Export returned a sign-in page or non-JSON response. Check Web App deployment access.');}
 if(!result.ok)throw new Error(result.error||'Export rejected');return result;
}
export async function buildExport(manifest,getImage,verify,output='docs'){
 if(!manifest||!Array.isArray(manifest.items)||manifest.items.length>10000||typeof manifest.version!=='string')throw new Error('Invalid manifest');
 const stage=output+'-staging';await rm(stage,{recursive:true,force:true});await mkdir(stage+'/posters',{recursive:true});await mkdir(stage+'/assets',{recursive:true});await mkdir(stage+'/data',{recursive:true});
 for(const file of ['styles.css','assets/app.js'])await copyFile(output+'/'+file,stage+'/'+file);
 const cache=new Map(),fields=['id','kind','title','start_date','end_date','start_time','end_time','venue','address','area','organizer','price','contact','registration_url','description','categories','age_info','source_account','place_type','last_checked','published_at','location_note','valid_until','expiry_mode'];
 const items=[];
 // Sequential source downloads avoid concurrent Apps Script/Drive quota pressure.
 for(const entry of manifest.items){
  if(!entry.item||!Array.isArray(entry.images)||entry.images.length>50)throw new Error('Invalid listing gallery');
  const item={};for(const field of fields)item[field]=typeof entry.item[field]==='string'?entry.item[field]:'';
  if(!/^(event|place):[A-Za-z0-9_-]{1,180}$/.test(item.id)||!item.id.startsWith(item.kind+':')||!item.title)throw new Error('Invalid listing');
  if(!/^https?:\/\//i.test(item.registration_url))item.registration_url='';
  const posters=[];
  for(const image of entry.images){
   const key=JSON.stringify([image.fileId,image.crop]);let local=cache.get(key);
   if(!local){const result=await getImage(image);const bytes=Buffer.from(result.data||'','base64');if(bytes.length>6*1024*1024)throw new Error('Source exceeds size limit');
    const crop=cropPoster(bytes,result.mime,image.crop);local='posters/'+createHash('sha256').update(crop).digest('hex')+'.jpg';await writeFile(stage+'/'+local,crop);cache.set(key,local);
   }if(!posters.includes(local))posters.push(local);
  }
  item.poster=posters[0]||'';item.posters=posters;items.push(item);
 }
 const current=await verify();if(current.version!==manifest.version)throw new Error('Listings or crops changed during export; keeping previous site. Rerun the workflow.');
 const snapshot={items,status:null,exported_at:new Date().toISOString()},base=String(process.env.PUBLIC_URL||'').replace(/\/?$/,'/');
 if(base!=='/'&&!/^https:\/\//.test(base))throw new Error('PUBLIC_URL must use HTTPS');
 const json=JSON.stringify(snapshot).replace(/</g,'\\u003c');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Islamabad, Out &amp; About</title><meta name="description" content="Discover upcoming events, workshops and things to do in Islamabad.">'+(base!=='/'?'<link rel="canonical" href="'+escapeHtml(base)+'">':'')+'<link rel="stylesheet" href="./styles.css"></head><body><div id="root">'+render(snapshot)+'</div><p style="text-align:center;font:12px Arial;color:#65717f">Last site update: '+escapeHtml(snapshot.exported_at)+' (UTC)</p><script id="snapshot" type="application/json">'+json+'</script><script defer src="./assets/app.js"></script></body></html>';
 await writeFile(stage+'/index.html',html);await writeFile(stage+'/data/listings.json',JSON.stringify(snapshot));await writeFile(stage+'/.nojekyll','');await writeFile(stage+'/robots.txt','User-agent: *\nAllow: /\n'+(base!=='/'?'Sitemap: '+base+'sitemap.xml\n':''));
 if(base!=='/')await writeFile(stage+'/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+escapeHtml(base)+'</loc></url></urlset>');
 const backup=output+'-previous';await rm(backup,{recursive:true,force:true});await rename(output,backup);try{await rename(stage,output);}catch(e){await rename(backup,output);throw e;}await rm(backup,{recursive:true,force:true});
 console.log('Built '+items.length+' listings from '+cache.size+' approved image/crop combinations.');return snapshot;
}
async function main(){if(process.argv.includes('--ack')){await request('ack',{version:(await readFile('.export-version','utf8')).trim()});return;}
 const manifest=await request('manifest');await buildExport(manifest,image=>request('file',image),()=>request('manifest'));await writeFile('.export-version',manifest.version);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
