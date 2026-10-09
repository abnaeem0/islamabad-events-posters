/** Normalization is isolated so future formatting changes do not alter ingestion. */
function blank_(v) {
  if (v === null || v === undefined) return '';
  const x = String(v).trim();
  return /^(null|undefined|n\/a|unavailable|not provided|none)$/i.test(x) ? '' : x;
}
function dateKey_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, 'Asia/Karachi', 'yyyy-MM-dd');
  const x = blank_(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '';
}
function wordKey_(x) {
  return blank_(x).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9\s]/g,' ')
    .replace(/\bfest\b/g,'festival').replace(/\b(the|at|in|islamabad|event|edition)\b/g,' ').replace(/\s+/g,' ').trim();
}
function titleSimilarity_(a,b) {
  const aa = wordKey_(a), bb = wordKey_(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const A = aa.split(' '), B = bb.split(' ');
  const common = A.filter(function(x){return B.indexOf(x)>=0;}).length;
  return 2*common/(A.length+B.length);
}
function normalizePhones_(value) {
  const chunks = Array.isArray(value) ? value : String(value || '').split(/[,;|\n]+/);
  const numbers = [];
  chunks.forEach(function(chunk) {
    const re = /(?:\+?92|0092|0)?[\s().-]*3\d{2}[\s().-]*\d{3}[\s().-]*\d{4}/g;
    String(chunk).replace(re, function(hit) {
      let s = hit.replace(/\D/g,'');
      if (s.indexOf('0092') === 0) s = s.slice(2);
      if (s.indexOf('92') === 0 && s.length === 12) s = s.slice(2);
      if (s.indexOf('0') === 0 && s.length === 11) s = s.slice(1);
      if (s.length === 10 && s[0] === '3') {
        const n = '+92'+s;
        if (numbers.indexOf(n) === -1) numbers.push(n);
      }
      return hit;
    });
  });
  return numbers;
}
function normalizedContact_(value) {
  const phones = normalizePhones_(value);
  const raw = blank_(Array.isArray(value) ? value.join(' ') : value);
  if (phones.length) return JSON.stringify(phones);
  return raw; // preserve emails, landlines and other non-mobile contact information
}
function isPast_(row) {
  const d = dateKey_(row.end_date) || dateKey_(row.start_date);
  const today = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
  return Boolean(d && d < today);
}
function eventFields_() {
  return ['title','start_date','end_date','start_time','end_time','venue','address','organizer',
    'price','contact','registration_url','description','categories','age_info','source_account'];
}
