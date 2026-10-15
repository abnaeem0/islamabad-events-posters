/** Normalization is isolated so future formatting changes do not alter ingestion. */
function blank_(v) {
  if (v === null || v === undefined) return '';
  const x = String(v).trim();
  return /^(null|undefined|n\/a|unavailable|not provided|none)$/i.test(x) ? '' : x;
}
/** Date keys are ISO dates, validated against the real calendar. */
function dateKey_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const k = Utilities.formatDate(v, 'Asia/Karachi', 'yyyy-MM-dd');
    return validDateKey_(k) ? k : '';
  }
  const x = blank_(v);
  if (validDateKey_(x)) return x;
  return '';
}
function validDateKey_(x) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const parts=x.split('-').map(Number);
  if(parts[0]<2000 || parts[0]>2100) return false;
  const d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  return d.getUTCFullYear()===parts[0] && d.getUTCMonth()+1===parts[1] && d.getUTCDate()===parts[2];
}
/** Return 24-hour clock text, including spreadsheet Date objects (1899 serial time). */
function timeKey_(v) {
  if(v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v,'Asia/Karachi','HH:mm');
  if(typeof v==='number' && isFinite(v) && v>=0 && v<1) {
    const minutes=Math.round(v*1440)%1440;
    return ('0'+Math.floor(minutes/60)).slice(-2)+':'+('0'+(minutes%60)).slice(-2);
  }
  const x=blank_(v);
  const m=x.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return m ? ('0'+Number(m[1])).slice(-2)+':'+m[2] : '';
}
/** Native Google Sheets date/time values, not strings or 1899 display dates. */
function nativeEventCell_(header,value) {
  if(header==='start_date'||header==='end_date'||header==='existing_date'||header==='incoming_date') {
    const d=dateKey_(value);
    return d ? new Date(d+'T12:00:00+05:00') : '';
  }
  if(header==='start_time'||header==='end_time'||header==='existing_time'||header==='incoming_time') {
    const t=timeKey_(value);
    return t ? new Date('2000-01-01T'+t+':00+05:00') : '';
  }
  return serializeCell_(value);
}
function applyEventColumnFormats_(sheet,headers) {
  headers.forEach(function(h,i) {
    if(['start_date','end_date','existing_date','incoming_date'].indexOf(h)>=0)
      sheet.getRange(2,i+1,Math.max(1,sheet.getMaxRows()-1),1).setNumberFormat('yyyy-mm-dd');
    if(['start_time','end_time','existing_time','incoming_time'].indexOf(h)>=0)
      sheet.getRange(2,i+1,Math.max(1,sheet.getMaxRows()-1),1).setNumberFormat('hh:mm');
  });
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
  if (phones.length) {
    // Keep emails, landlines and contact notes alongside mobiles.
    const rest=raw.replace(/(?:\+?92|0092|0)?[\s().-]*3\d{2}[\s().-]*\d{3}[\s().-]*\d{4}/g,' ').replace(/[\s\[\]{}"',;|:+().-]/g,'');
    return rest ? readableContact_(raw) : phones.join('; ');
  }
  return readableContact_(raw); // preserve emails, landlines and other non-mobile contact information
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

/** Decode legacy array-shaped contacts without evaluating text. */
function readableContact_(value){
 if(Array.isArray(value))return value.map(readableContact_).filter(Boolean).join('; ');
 const raw=blank_(value);if(!/^\s*\[/.test(raw)||! /\]\s*$/.test(raw))return raw;
 try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed.map(readableContact_).join('; ');}catch(e){}
 const quoted=raw.match(/^\[\s*'[^']*'(?:\s*,\s*'[^']*')*\s*\]$/);
 return quoted?(raw.match(/'([^']*)'/g)||[]).map(x=>x.slice(1,-1)).join('; '):raw;
}
