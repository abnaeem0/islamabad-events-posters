/**
 * "Suggest a change" from the public website (2026-11-21, my request).
 * Anyone viewing a listing can send a short note. It lands in the "Suggestions" tab of the Sheet and shows
 * on the local review page, where I mark it done. Nothing is changed in any listing automatically.
 * Reached through doPost action 'suggest', with no token (the website is public), so:
 * - at most SUGGEST.DAILY_LIMIT notes a day (Islamabad date), then the site is told to try tomorrow;
 * - short text only, control characters removed, and values that would start a Sheet formula are made plain text;
 * - a hidden "website" field that people never see: bots that fill it get a fake "thanks" and nothing is saved.
 * The tab is separate from the listing tabs and is created on first use; no existing tab or header changes.
 */
const SUGGEST={TAB:'Suggestions',HEADERS:['received_at','listing_id','listing_title','message','contact','status','handled_at'],DAILY_LIMIT:30,COUNTER:'SUGGESTIONS_TODAY'};
function suggestText_(value,max){
 let s=String(value==null?'':value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
 if(/^[=+\-@]/.test(s))s="'"+s;
 return s;
}
function suggestionsSheet_(){
 const ss=SpreadsheetApp.openById(getSettings_().spreadsheetId);
 let sheet=ss.getSheetByName(SUGGEST.TAB);
 if(!sheet){sheet=ss.insertSheet(SUGGEST.TAB);sheet.getRange(1,1,1,SUGGEST.HEADERS.length).setValues([SUGGEST.HEADERS]);sheet.setFrozenRows(1);}
 return sheet;
}
function islamabadDay_(){return new Date(Date.now()+5*3600000).toISOString().slice(0,10);}
function receiveSuggestion_(body){
 if(String(body.website||''))return {ok:true};
 const message=suggestText_(body.message,1000);
 if(message.replace(/^'/,'').length<3)throw new Error('Please write a short note.');
 const id=String(body.listing_id||'').trim(),listingId=/^(event|place):[A-Za-z0-9_\-]{1,100}$/.test(id)?id:'';
 // No lock: the inbox run holds the script lock for minutes. An unlucky race can let one or two extra notes in.
 const props=PropertiesService.getScriptProperties(),day=islamabadDay_();
 let counter;try{counter=JSON.parse(props.getProperty(SUGGEST.COUNTER)||'{}');}catch(e){counter={};}
 const count=counter.day===day?Number(counter.count)||0:0;
 if(count>=SUGGEST.DAILY_LIMIT)throw new Error('We have received a lot of suggestions today. Please try again tomorrow.');
 props.setProperty(SUGGEST.COUNTER,JSON.stringify({day:day,count:count+1}));
 suggestionsSheet_().appendRow([new Date().toISOString(),listingId,suggestText_(body.listing_title,200),message,suggestText_(body.contact,100),'new','']);
 return {ok:true};
}
/** Open suggestions for the local review page, newest first. Read only. */
function openSuggestions_(){
 const ss=SpreadsheetApp.openById(getSettings_().spreadsheetId),sheet=ss.getSheetByName(SUGGEST.TAB);
 if(!sheet)return [];
 let site='';try{site=githubPublicUrl_();}catch(e){}
 return readObjects_(sheet).filter(r=>String(r.status||'')!=='done'&&String(r.message||'')).map(r=>({
  row:r._row,received_at:String(r.received_at||''),listing_id:String(r.listing_id||''),title:String(r.listing_title||''),
  message:String(r.message||''),contact:String(r.contact||''),
  url:site&&r.listing_id?site+'?item='+encodeURIComponent(String(r.listing_id)):''
 })).reverse().slice(0,200);
}
/** Mark one suggestion done. The row and its time must still match, so a moved or deleted row is never changed by mistake. */
function markSuggestionDone_(payload){
 const sheet=SpreadsheetApp.openById(getSettings_().spreadsheetId).getSheetByName(SUGGEST.TAB);
 if(!sheet)throw new Error('No Suggestions tab yet.');
 const row=Number(payload&&payload.row),rows=readObjects_(sheet),r=rows.find(x=>x._row===row);
 if(!r||String(r.received_at)!==String(payload.received_at))throw new Error('That suggestion moved in the Sheet. Refresh the list and try again.');
 const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
 sheet.getRange(row,headers.indexOf('status')+1).setValue('done');
 sheet.getRange(row,headers.indexOf('handled_at')+1).setValue(new Date().toISOString());
 return {ok:true};
}
