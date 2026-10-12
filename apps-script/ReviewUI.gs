/**
 * LIGHTWEIGHT SPREADSHEET-BOUND COMPANION.
 * Install only this file and ReviewDialog.html via Extensions > Apps Script
 * from the SAME spreadsheet. The standalone collector remains unchanged.
 * No new Script Properties or API keys required here.
 */
const VISUAL_FIELDS=['title','start_date','end_date','start_time','end_time','venue','address','organizer','price','contact','registration_url','description','categories','age_info','source_account'];
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Events')
    .addItem('Review selected event', 'openVisualReview')
    .addToUi();
}
function vrRows_(tab){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if(!sh)throw new Error('Missing sheet '+tab);
  if(sh.getLastRow()<2)return [];
  const vals=sh.getDataRange().getValues(), heads=vals[0];
  return vals.slice(1).map((v,i)=>{
    const obj={_row:i+2};heads.forEach((h,j)=>obj[h]=v[j]);return obj;
  });
}
function vrString_(v,key){
  if(v===undefined||v===null||v==='')return '';
  if(v instanceof Date){
    if(/date/.test(key))return Utilities.formatDate(v,'Asia/Karachi','yyyy-MM-dd');
    if(/time/.test(key))return Utilities.formatDate(v,'Asia/Karachi','HH:mm');
    return Utilities.formatDate(v,'Asia/Karachi','yyyy-MM-dd HH:mm');
  }
  return String(v);
}
function vrImage_(id) {
  if(!id)return '';
  try {
    const b=DriveApp.getFileById(String(id)).getBlob();
    if(b.getBytes().length>6*1024*1024 || !/^image\/(jpeg|png|webp|gif)$/.test(b.getContentType()))return '';
    return 'data:'+b.getContentType()+';base64,'+Utilities.base64Encode(b.getBytes());
  } catch(e){return '';}
}
function openVisualReview(){
  const sh=SpreadsheetApp.getActiveRange()&&SpreadsheetApp.getActiveRange().getSheet();
  const row=SpreadsheetApp.getActiveRange()&&SpreadsheetApp.getActiveRange().getRow();
  if(!sh || row<2 || !['Event Review','Upcoming Events'].includes(sh.getName())){
    SpreadsheetApp.getUi().alert('Select a row in Event Review or Upcoming Events first.');return;
  }
  const template=HtmlService.createTemplateFromFile('ReviewDialog');
  template.context=JSON.stringify({mode:sh.getName()==='Event Review'?'review':'edit',row:row});
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(1160).setHeight(760),'Review event');
}
function getVisualReviewData(context){
  const reviews=vrRows_('Event Review'),incomingReview=reviews.find(r=>r._row===Number(context.row));
  const upcoming=vrRows_('Upcoming Events');const sources=vrRows_('Events');
  const canon=context.mode==='edit' ? upcoming.find(r=>r._row===Number(context.row)) : upcoming.find(r=>String(r.group_id)===String(incomingReview&& (incomingReview.suggested_group_id || incomingReview.group_id)));
  const event=context.mode==='edit'?canon:incomingReview;
  if(!event)throw new Error('The selected row no longer exists.');
  const source=context.mode==='edit'?sources.find(r=>String(r.group_id)===String(event.group_id)):sources.find(r=>String(r.id)===String(event.source_id));
  const current=canon||source||{};
  const existingSource=sources.find(r=>String(r.group_id)===String(current.group_id))||current;
  const fields=(x)=>{const obj={};VISUAL_FIELDS.forEach(k=>obj[k]=vrString_(x&&x[k],k));return obj;};
  return {
    mode:context.mode,row:Number(context.row),sourceId:source&&String(source.id)||'',
    groupId:context.mode==='edit'?String(event.group_id):String(event.group_id||''),
    suggestedGroupId:context.mode==='review'?String(event.suggested_group_id||''):'',
    title:current.title||source&&source.title||'Unnamed event',
    reviewReason:context.mode==='review'?String(event.issue||'Review event'): 'Edit event information',
    existing:fields(current),incoming:fields(source||current),
    existingLink:existingSource.original_image_url||'',incomingLink:source&&source.original_image_url||'',
    existingImage:vrImage_(existingSource.original_image_file_id),incomingImage:vrImage_(source&&source.original_image_file_id)
  };
}
function vrUpdateRow_(tab, rowNumber, updates){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  const headings=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  Object.keys(updates).forEach(k=>{
    const idx=headings.indexOf(k);
    if(idx>=0)sh.getRange(rowNumber,idx+1).setValue(updates[k]);
  });
}
function vrNative_(key,value){
  const val=String(value===null||value===undefined?'':value).trim();
  if(!val)return '';
  if(['start_date','end_date'].includes(key)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(val))throw new Error('Invalid '+key+': use YYYY-MM-DD');
    const parts=val.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    if(date.getUTCFullYear()!==parts[0]||date.getUTCMonth()!==parts[1]-1||date.getUTCDate()!==parts[2])throw new Error('Invalid '+key);
    return new Date(val+'T12:00:00+05:00');
  }
  if(['start_time','end_time'].includes(key)){
    if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(val))throw new Error('Invalid '+key+': use HH:mm');
    return new Date('2000-01-01T'+val+':00+05:00');
  }
  return val;
}
function saveVisualDecision(payload){
  const lock=LockService.getDocumentLock();lock.waitLock(20000);
  try {
    const sheet=SpreadsheetApp.getActiveSpreadsheet();
    const source=vrRows_('Events').find(r=>String(r.id)===String(payload.sourceId));
    const action=String(payload.action||'edit');
    let groupId=String(payload.groupId||'');
    if(action==='merge'){
      if(!source||!payload.suggestedGroupId)throw new Error('Merge requires a suggested group.');
      groupId=String(payload.suggestedGroupId);
      vrUpdateRow_('Events',source._row,{group_id:groupId,match_status:'manual',review_reason:'',suggested_group_id:''});
    } else if(action==='separate'){
      if(!source)throw new Error('Could not find source record.');
      groupId='E_'+String(source.id);
      vrUpdateRow_('Events',source._row,{group_id:groupId,match_status:'separate',review_reason:'',suggested_group_id:''});
    }else if(source && payload.mode==='review') {
      vrUpdateRow_('Events',source._row,{match_status:'manual',review_reason:'',suggested_group_id:''});
    }
    if(!groupId)throw new Error('Missing event group ID.');
    const upSheet=sheet.getSheetByName('Upcoming Events');
    const existing=vrRows_('Upcoming Events').find(r=>String(r.group_id)===groupId);
    const newRow=existing?existing._row:upSheet.getLastRow()+1;
    if(!existing){
      const heads=upSheet.getRange(1,1,1,upSheet.getLastColumn()).getValues()[0];
      const defaults=source||{};
      upSheet.getRange(newRow,1,1,heads.length).setValues([heads.map(k=>k==='group_id'?groupId:(defaults[k]||''))]);
    }
    const updated={manual_notes:'Manually reviewed '+new Date().toISOString()};
    VISUAL_FIELDS.forEach(k=>{
      if(Object.prototype.hasOwnProperty.call(payload.fields||{},k))updated[k]=vrNative_(k,payload.fields[k]);
    });
    vrUpdateRow_('Upcoming Events',newRow,updated);
    if(payload.mode==='review'){
      // Clear resolved row now. The main collector later rebuilds review from stored decision metadata.
      const rev=sheet.getSheetByName('Event Review');
      const row=vrRows_('Event Review').find(r=>String(r.source_id)===String(payload.sourceId));
      if(row)rev.deleteRow(row._row);
    }
    return {ok:true,groupId};
  }finally{lock.releaseLock();}
}
