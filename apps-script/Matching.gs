/** Pure matching policy: change here without touching Sheets or Gemini. */
function matchCandidate_(incoming, existing) {
  // Exact details can identify duplicates even when a venue is missing.
  // Without a date, require the same Drive file: generic recurring activities
  // on unrelated posters must not collapse into one event.
  if(eventDetailsEqual_(incoming,existing) &&
     ((blank_(incoming.title) && dateKey_(incoming.start_date)) ||
      (blank_(incoming.original_image_file_id) && incoming.original_image_file_id===existing.original_image_file_id)))
    return {type:'merge',score:1,reason:'Identical event details'};
  if (!dateKey_(incoming.start_date) || !dateKey_(existing.start_date)) return {type:'none', score:0};
  const title = titleSimilarity_(incoming.title, existing.title);
  if (title < 0.63) return {type:'none', score:title};
  const sameDate = dateKey_(incoming.start_date) === dateKey_(existing.start_date);
  const venueA = wordKey_(incoming.venue), venueB = wordKey_(existing.venue);
  const venueMatch = venueA && venueB && (venueA === venueB || titleSimilarity_(venueA, venueB)>0.85);
  const rescheduled = /\b(rescheduled|postponed|new date|date changed|venue changed|relocated)\b/i.test(
    blank_(incoming.extraction_notes) + ' ' + blank_(incoming.description));
  // Different date = different event by default. Explicit reschedule is only a suggestion.
  if (!sameDate) return rescheduled && title >= 0.84 ? {type:'review',score:title,reason:'Possible reschedule — dates differ'} : {type:'none',score:0};
  if (title >= 0.84 && venueMatch) {
    if (blank_(incoming.start_time) && blank_(existing.start_time) && blank_(incoming.start_time)!==blank_(existing.start_time))
      return {type:'review',score:title,reason:'Time differs — possible separate session or update'};
    return {type:'merge',score:title};
  }
  if (title >= 0.90 && (!venueA || !venueB)) return {type:'review',score:title,reason:'Venue missing — possible duplicate'};
  if (title >= 0.80) return {type:'review',score:title,reason:'Same date, venue or title differs'};
  return {type:'none',score:0};
}
/** Compare extracted event facts, not model confidence or processing metadata. */
function eventDetailsEqual_(a,b){
  return eventFields_().filter(function(k){return k!=='source_account';}).every(function(k){
    return eventDetailKey_(k,a[k])===eventDetailKey_(k,b[k]);
  });
}
function eventDetailKey_(key,value){
  if(/_date$/.test(key))return dateKey_(value);
  if(/_time$/.test(key))return timeKey_(value);
  const text=blank_(value).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  if(key==='contact'||key==='categories'){
    try{const items=Array.isArray(value)?value:JSON.parse(text);if(Array.isArray(items))return JSON.stringify(items.map(function(x){return blank_(x).toLowerCase().replace(/\s+/g,' ').trim();}).sort());}catch(e){}
  }
  return text;
}
function conflictingFields_(base, add) {
  return eventFields_().filter(function(k) {
    if(k==='source_account')return false;
    const a = blank_(base[k]), b = blank_(add[k]);
    return a && b && wordKey_(a) !== wordKey_(b);
  });
}
