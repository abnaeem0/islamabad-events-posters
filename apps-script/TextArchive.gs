/** Original extraction history; never regenerated from later manual corrections. */
const TEXT_ARCHIVE={TAB:'Text Archive',HEADERS:['source_id','image_file_id','image_url','filename','extracted_at','title','visible_text','summary','categories','listing_kind','intake_route','intake_reason','extraction_json']};
function archiveExtractions_(sources){
 const sh=table_(TEXT_ARCHIVE.TAB,TEXT_ARCHIVE.HEADERS),known=new Set(readObjects_(sh).map(r=>String(r.source_id)));
 const fresh=sources.filter(r=>r.id&&!known.has(String(r.id))&&r.status!==CONFIG.STATUS.ERROR);
 if(!fresh.length)return;
 const rows=fresh.map(r=>{const clues=companionClues_(r),record={source_id:r.id,image_file_id:r.original_image_file_id,image_url:r.original_image_url,filename:r.original_filename,extracted_at:r.processed_at,title:r.title,visible_text:clues.visible_text||'',summary:r.description||'',categories:r.categories,listing_kind:clues.listing_kind,intake_route:clues.intake_route||'listing',intake_reason:clues.intake_reason||'',extraction_json:JSON.stringify(portableRecord_(r))};return TEXT_ARCHIVE.HEADERS.map(k=>nativeEventCell_(k,record[k]||''));});
 sh.getRange(sh.getLastRow()+1,1,rows.length,TEXT_ARCHIVE.HEADERS.length).setValues(rows);
}
function routeNewResearch_(sources){
 // Recognizable promotional material is never parked solely for missing facts.
 const candidates=sources.filter(r=>{const c=companionClues_(r);return c.intake_route==='research'&&!['event','ad','place','course','recurring'].includes(c.listing_kind)&&r.match_status!=='research';});
 if(!candidates.length)return;
 const ids=[];
 candidates.forEach(r=>{
  // Give non-listing notes their own identity; never park a matched public event.
  const id='note-'+r.id;vrUpdateRow_(PIPE.RAW,r._row,{group_id:id,match_status:'new',suggested_group_id:'',review_reason:''});ids.push(id);
 });
 parkResearchLocked_(ids);
}
