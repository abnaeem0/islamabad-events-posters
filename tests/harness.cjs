const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
class Range{
 constructor(sheet,r,c,n=1,w=1){Object.assign(this,{sheet,r,c,n,w})}
 getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.w},(_,j)=>this.sheet.values[this.r+i-1]?.[this.c+j-1]??''))}
 setValues(values){assert.equal(values.length,this.n);values.forEach((row,i)=>{assert.equal(row.length,this.w,'range column count');this.sheet.values[this.r+i-1]??=[];row.forEach((v,j)=>this.sheet.values[this.r+i-1][this.c+j-1]=v)});return this}
 setValue(v){return this.setValues([[v]])} getValue(){return this.getValues()[0][0]}
 clearContent(){for(let i=0;i<this.n;i++)for(let j=0;j<this.w;j++)if(this.sheet.values[this.r+i-1])this.sheet.values[this.r+i-1][this.c+j-1]='';return this}
 getRow(){return this.r}getNumRows(){return this.n}getSheet(){return this.sheet}
}
for(const method of ['setNumberFormat','setFontWeight','setVerticalAlignment','setWrap','setDataValidation','clearDataValidations'])Range.prototype[method]=function(){return this};
class Sheet{
 constructor(name){this.name=name;this.values=[];this.maxRows=100;this.maxCols=50}
 getName(){return this.name}getLastRow(){for(let i=this.values.length-1;i>=0;i--)if(this.values[i]?.some(v=>v!==''&&v!==undefined&&v!==null))return i+1;return 0}
 getLastColumn(){return Math.max(0,...this.values.map(row=>row?.length||0))}getMaxRows(){return this.maxRows}getMaxColumns(){return this.maxCols}
 getRange(...args){return new Range(this,...args)}getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()))}
 appendRow(row){this.getRange(this.getLastRow()+1,1,1,row.length).setValues([row]);return this}deleteRow(r){this.values.splice(r-1,1)}insertColumnsAfter(n,c){this.maxCols+=c}insertRowsAfter(n,c){this.maxRows+=c}
}
for(const method of ['setFrozenRows','setFrozenColumns','setColumnWidth'])Sheet.prototype[method]=function(){return this};
function harness(){
 const tables=new Map(),props=new Map([['GEMINI_API_KEY','test'],['SPREADSHEET_ID','sheet'],['INBOX_FOLDER_ID','inbox']]),files=new Map();let held=false,networkCalls=0;
 const properties={getProperty:k=>props.get(k),getProperties:()=>Object.fromEntries(props),setProperty:(k,v)=>props.set(k,v),setProperties:o=>Object.entries(o).forEach(([k,v])=>props.set(k,v)),deleteProperty:k=>props.delete(k)};
 const spreadsheet={getSheetByName:n=>tables.get(n),insertSheet:n=>{const s=new Sheet(n);tables.set(n,s);return s},setSpreadsheetTimeZone:()=>{},toast:()=>{}};
 const fluent=new Proxy({}, {get:(_,k)=>k==='build'?()=>({}):()=>fluent});
 const context=vm.createContext({console,Date,Set,Map,JSON,PropertiesService:{getScriptProperties:()=>properties},SpreadsheetApp:{openById:()=>spreadsheet,getActiveSpreadsheet:()=>spreadsheet,newDataValidation:()=>fluent},LockService:{getScriptLock:()=>({tryLock:()=>{if(held)return false;held=true;return true},waitLock:()=>{assert(!held,'Nested lock');held=true},releaseLock:()=>{assert(held,'Release unlocked');held=false}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(typeof value==='string'?value:Buffer.from(value)).digest()),formatDate:(date,tz,format)=>{if(format==='yyyy-MM-dd')return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);if(format==='HH:mm')return new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(date);return date.toISOString()},base64Encode:v=>Buffer.from(v).toString('base64')},DriveApp:{getFileById:id=>{assert(!held,'Drive file request under data lock');return files.get(id)}},CacheService:{getUserCache:()=>({get:()=>null,getAll:()=>({}),putAll:()=>{},put:()=>{}})},UrlFetchApp:{fetch:()=>{assert(!held,'Network request under data lock');networkCalls++;throw new Error('Mock network response missing')}}});
 for(const f of fs.readdirSync('apps-script').filter(f=>f.endsWith('.gs')))vm.runInContext(fs.readFileSync('apps-script/'+f,'utf8'),context,{filename:f});
 const run=s=>vm.runInContext(s,context),rows=n=>tables.has(n)?run(`readObjects_(SpreadsheetApp.openById('sheet').getSheetByName(${JSON.stringify(n)}))`):[];
 function file(id,bytes=[1,2,3,4]){const value={getId:()=>id,getMimeType:()=>'image/jpeg',getName:()=>`Screenshot_20261015_110405_${id}.jpg`,getUrl:()=>`https://drive.google.com/file/d/${id}/view`,getDateCreated:()=>new Date('2026-01-01'),getBlob:()=>{assert(!held,'Drive blob under lock');return {getContentType:()=>'image/jpeg',getBytes:()=>bytes}}};files.set(id,value);return value}
 return {context,run,rows,props,tables,files,file,spreadsheet,held:()=>held,networkCalls:()=>networkCalls};
}
module.exports={harness,Sheet,Range};
