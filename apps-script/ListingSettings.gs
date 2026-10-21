const LISTING_SETTINGS = {TAB: 'Listing Settings', HEADERS: ['listing_id','approved_as_is','approval_signature','expiry_mode','valid_until','location_note','updated_at','area']};
function listingSettings_(record, kind) {
  return readOptionalRows_(LISTING_SETTINGS.TAB).find(r => String(r.listing_id) === kind + ':' + record.group_id) || {};
}
function approvalSignature_(record) {
  return digestKey_(JSON.stringify(VISUAL_FIELDS.map(k => vrString_(record && record[k], k)).concat(String(record && record.original_image_file_id || ''))));
}
function approvalApplies_(record, kind) {
  const settings = listingSettings_(record, kind);
  return String(settings.approved_as_is) === 'yes' && settings.approval_signature === approvalSignature_(record);
}
function expiryDetails_(record, kind) {
  const settings = listingSettings_(record, kind);
  const raw = readOptionalRows_(PIPE.RAW).find(r => String(r.group_id) === String(record.group_id));
  const explicit = raw && companionClues_(raw).promotion_end_date || '';
  return {expiry_mode: settings.expiry_mode || (kind === 'event' ? 'event' : explicit ? 'until' : 'ongoing'), valid_until: dateKey_(settings.listing_id ? (settings.expiry_mode === 'until' ? settings.valid_until : '') : explicit), location_note: String(settings.location_note || ''), approved_as_is: approvalApplies_(record, kind)};
}
function expiredListing_(record, kind) {
  const expiry = expiryDetails_(record, kind);
  const today = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
  return !!(expiry.valid_until && expiry.valid_until < today);
}
function prepareListingSettings_(record, kind, payload) {
  const previous = listingSettings_(record, kind), input = payload.publication || {};
  if (!payload.publication) return;
  const mode = String(input.expiry_mode || (kind === 'event' ? 'event' : 'ongoing'));
  if (!['event','until','ongoing'].includes(mode)) throw new Error('Choose an expiry option.');
  const until = String(input.valid_until || '').trim();
  if (until) vrNative_('end_date', until);
  if (mode === 'until' && !until) throw new Error('Choose the date this offer expires.');
  if (kind === 'event' && !dateKey_(record.start_date)) throw new Error('A dated event needs a start date. Choose ongoing or an offer expiry to save it in Places & Activities.');
  if (mode === 'until' && dateKey_(record.start_date) && until < dateKey_(record.start_date)) throw new Error('Expiry cannot be before the start date.');
  const approved = !!payload.approveAsIs, note = String(input.location_note || '').trim().slice(0,1200);
  if (approved && !blank_(record.title)) throw new Error('Give this listing a title before approval.');
  if (approved && !blank_(record.venue) && !blank_(record.address) && !note) throw new Error('Explain the missing location, for example “Meeting point supplied after booking”.');
  const row = {listing_id: kind + ':' + record.group_id, approved_as_is: approved ? 'yes' : '', approval_signature: approved ? approvalSignature_(record) : '', expiry_mode: mode, valid_until: mode === 'until' ? until : '', location_note: note, updated_at: new Date().toISOString(), area: String(input.area === undefined ? previous.area || '' : input.area).trim().slice(0,120)};
  return row;
}
function saveListingSettings_(record,kind,payload){
  const row=prepareListingSettings_(record,kind,payload);savePreparedListingSettings_(row);
}
function savePreparedListingSettings_(row){
  if(!row)return;
  const previous=readOptionalRows_(LISTING_SETTINGS.TAB).find(r=>r.listing_id===row.listing_id)||{},sh=table_(LISTING_SETTINGS.TAB,LISTING_SETTINGS.HEADERS);
  sh.getRange(previous._row || sh.getLastRow() + 1, 1, 1, LISTING_SETTINGS.HEADERS.length).setValues([LISTING_SETTINGS.HEADERS.map(k => nativeEventCell_(k, row[k] || ''))]);
  markPipelineDirty_();
}
