/** Fenced removals survive network failures and cannot be undone by an older in-flight publish. */
const PUBLIC_OUTBOX = {TAB:'Publication Outbox', HEADERS:['listing_id','revision','action','last_error','updated_at']};
function enqueueRemovalLocked_(ids) {
  if(githubPublishing_()){markPipelineDirty_();return;}
  const sh=table_(PUBLIC_OUTBOX.TAB,PUBLIC_OUTBOX.HEADERS);
  ids.forEach(id=>{
    const old=readObjects_(sh).find(r=>r.listing_id===id),revision=nextPublicRevision_();
    sh.getRange(old?old._row:sh.getLastRow()+1,1,1,PUBLIC_OUTBOX.HEADERS.length).setValues([[id,revision,'remove','',new Date().toISOString()]]);
  });
}
function flushRemovalOutbox_() {
  if(githubPublishing_())return; // The next complete GitHub snapshot applies removals.
  if(!sharingConnection_().token)return;
  const rows=readOptionalRows_(PUBLIC_OUTBOX.TAB);
  for(const row of rows){
    try{
      publicRequest_({action:'remove',ids:[row.listing_id],revision:Number(row.revision)});
      withDataLock_(function(){
        const sh=table_(PUBLIC_OUTBOX.TAB,PUBLIC_OUTBOX.HEADERS),live=readObjects_(sh).find(r=>r.listing_id===row.listing_id);
        if(live&&Number(live.revision)===Number(row.revision))sh.deleteRow(live._row);
        const states=table_(SHARING.STATE,SHARING.STATE_HEADERS),state=readObjects_(states).find(r=>r.listing_id===row.listing_id);
        if(state&&Number(state.remote_revision||0)<=Number(row.revision))states.deleteRow(state._row);
      });
    }catch(e){withDataLock_(function(){const sh=table_(PUBLIC_OUTBOX.TAB,PUBLIC_OUTBOX.HEADERS),live=readObjects_(sh).find(r=>r.listing_id===row.listing_id);if(live&&Number(live.revision)===Number(row.revision))sh.getRange(live._row,PUBLIC_OUTBOX.HEADERS.indexOf('last_error')+1).setValue(String(e.message).slice(0,800));});console.warn('Removal remains queued: '+e.message);break;}
  }
}
