/** Pure matching policy: change here without touching Sheets or Gemini. */
function matchCandidate_(incoming, existing) {
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
function conflictingFields_(base, add) {
  return ['start_date','start_time','venue','price','end_date'].filter(function(k) {
    const a = blank_(base[k]), b = blank_(add[k]);
    return a && b && wordKey_(a) !== wordKey_(b);
  });
}
