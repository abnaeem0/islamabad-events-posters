function extractEventFromPoster_(blob, filename, companionBlobs) {
  const settings = getSettings_();
  const mimeType = blob.getContentType();

  if (CONFIG.SUPPORTED_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Unsupported image MIME type: ' + mimeType);
  }

  const extractionToday = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
  const prompt = [
    'You extract public event information from event posters for an Islamabad events guide.',
    '',
    'Read this screenshot carefully. It may advertise an event, an evergreen place/activity, or only one slide of a carousel. Return a separate item for each genuinely separate listing. Multiple days of one event can remain one item. Extract only information supported by the image.',
    'For an address-only/contact-only slide, return a partial item with null missing fields; do not invent its event name or date. Preserve visible matching clues.',
    'Set listing_kind to event, place, course, recurring, ad, partial or unknown. A gym/riding club/attraction/day-trip destination without a specific dated session is a place; a dated session at that business is an event. Never fabricate dates for places.',
    'Record visible_text (literal relevant text, maximum 3000 characters), visible Instagram handles, any event-specific booking link/reference, and visible carousel_index/carousel_total. Use null for absent carousel numbers. Do not confuse capture/upload dates with event dates.',
    'When several screenshots are supplied, read them as one confirmed post. Return EVERY distinct workshop/event, even when the images share design or venue. An overview slide and detail slide for the same session are one item. Apply a clearly shared venue/address/contact to all relevant workshops unless separate locations are shown. Preserve distinct dates, times, prices and titles. Missing fields stay null.',
    'Return poster_box as [left,top,right,bottom] on a 0..1000 scale for the COMPLETE promotional artwork in THIS image. Exclude phone bars, Instagram controls and surrounding caption text; keep all poster details and branding. For multiple listings on the same image use the same whole-poster box for every listing. An already cropped poster uses [0,0,1000,1000]. poster_confidence is high only when a complete clean promotional crop is clear. Never classify a private message or personal screenshot as a promotional poster. Use low confidence when no clean promotional crop exists.',
    'promotion_end_date is the explicit expiry/deadline of an offer, YYYY-MM-DD, or null. Never invent a 90-day validity or treat the screenshot date as an offer deadline. Courses and recurring activities without a specific dated session are not missing-date events.',
    'Set intake_route to listing for ANY recognizable third-party public event poster, ad, course, recurring activity or place promotion, even if date, venue or many other details are missing. Do not park recognizable promotional material in research. Use research for personal/unrelated screenshots, notes, or fragments with too little evidence to identify a public listing; use listing_kind partial or unknown in that case. Include a short intake_reason. Preserve text even when it is not an event.',
    'Do not invent missing facts.',
    'The event is expected to be relevant to Islamabad, Pakistan, but do not use that expectation to fill missing venue/address details.',
    '',
    'Date rules (reference date '+ extractionToday + ' in Islamabad):',
    '- Output full YYYY-MM-DD dates. Use the explicit poster year if given.',
    '- If year is absent, assume the CURRENT calendar year. When processing in November/December and poster date is January/February, assume NEXT year.',
    '- Do NOT push a past month to next year just because the poster was collected late. Historical posters are allowed.',
    '- If a weekday is printed, check it agrees with the chosen date; if not, note uncertain date instead of silently changing facts.',
    '- Never output 1899 dates. A poster saying Sunday 27 September at 7am is a September calendar date, not an 1899 timestamp.',
    '',
    'Time rules:',
    '- Return time as HH:MM in 24-hour format when clear.',
    '- Do not guess AM/PM.',
    '',
    'Price rules:',
    '- Keep price concise and human-readable.',
    '- If explicitly free, use "Free".',
    '',
    'Confidence:',
    '- high = key details are clear',
    '- medium = useful extraction but one or more important details are unclear',
    '- low = poster is difficult to read or key event identity/date/location is ambiguous',
    '',
    'Contact rules: preserve every phone number, email, or other contact shown. Separate multiple contacts with semicolons.',
    'If a later poster explicitly announces a rescheduling or relocation, note it verbatim in extraction_notes.',
    'Today in Islamabad: ' + Utilities.formatDate(new Date(),'Asia/Karachi','yyyy-MM-dd'),
    'Filename: ' + filename
  ].join('\n');

  const schema = getGeminiResponseSchema_();

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: Utilities.base64Encode(blob.getBytes())
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  (companionBlobs||[]).forEach(function(extra){if(CONFIG.SUPPORTED_MIME_TYPES.indexOf(extra.getContentType())<0)throw new Error('Unsupported image MIME type');payload.contents[0].parts.push({inlineData:{mimeType:extra.getContentType(),data:Utilities.base64Encode(extra.getBytes())}});});
  const response=geminiRequest_(settings.model,payload);
  const result=parseGeminiJson_(response.text);

  if (!result || !Array.isArray(result.events)) throw new Error('Gemini did not return events array');
  return result.events.map(normalizeExtraction_).filter(function(e){return e.companion_clues.intake_route==='research' || e.title || e.start_date || e.venue || e.address || e.contact || e.source_account || e.companion_clues.visible_text;});
}

function getGeminiResponseSchema_() {
  return {
    type:'OBJECT',
    properties:{events:{type:'ARRAY',items:getSingleEventSchema_()}},
    required:['events']
  };
}
function getSingleEventSchema_() {
  return {
    type: 'OBJECT',
    properties: {
      intake_route:{type:'STRING',enum:['listing','research']},
      intake_reason:{type:'STRING'},
      poster_box:{type:'ARRAY',items:{type:'NUMBER'}},
      poster_confidence:{type:'STRING',enum:['high','medium','low']},
      promotion_end_date:{type:'STRING',nullable:true},
      listing_kind:{type:'STRING',enum:['event','place','course','recurring','ad','partial','unknown']},
      place_type:{type:'STRING',enum:['activity','experience','course','recurring_event','attraction','day_trip','restaurant']},
      visible_text:{type:'STRING',nullable:true},
      visible_handles:{type:'ARRAY',items:{type:'STRING'}},
      booking_reference:{type:'STRING',nullable:true},
      carousel_index:{type:'INTEGER',nullable:true},
      carousel_total:{type:'INTEGER',nullable:true},
      title: { type: 'STRING', nullable: true },
      start_date: { type: 'STRING', nullable: true },
      end_date: { type: 'STRING', nullable: true },
      start_time: { type: 'STRING', nullable: true },
      end_time: { type: 'STRING', nullable: true },
      venue: { type: 'STRING', nullable: true },
      address: { type: 'STRING', nullable: true },
      organizer: { type: 'STRING', nullable: true },
      price: { type: 'STRING', nullable: true },
      contact: { type: 'STRING', nullable: true },
      registration_url: { type: 'STRING', nullable: true },
      description: { type: 'STRING', nullable: true },
      categories: {
        type: 'ARRAY',
        items: { type: 'STRING' }
      },
      age_info: { type: 'STRING', nullable: true },
      source_account: { type: 'STRING', nullable: true },
      confidence: {
        type: 'STRING',
        enum: ['high', 'medium', 'low']
      },
      uncertain_fields: {
        type: 'ARRAY',
        items: { type: 'STRING' }
      },
      extraction_notes: { type: 'STRING', nullable: true }
    },
    required: [
      'intake_route','intake_reason','poster_box','poster_confidence','promotion_end_date','listing_kind','place_type','visible_text','visible_handles','booking_reference','carousel_index','carousel_total',
      'title',
      'start_date',
      'end_date',
      'start_time',
      'end_time',
      'venue',
      'address',
      'organizer',
      'price',
      'contact',
      'registration_url',
      'description',
      'categories',
      'age_info',
      'source_account',
      'confidence',
      'uncertain_fields',
      'extraction_notes'
    ]
  };
}

function normalizeExtraction_(x) {
  x = x || {};

  const confidence = ['high', 'medium', 'low'].indexOf(x.confidence) !== -1
    ? x.confidence
    : 'low';

  return {
    companion_clues:{
      intake_route:x.intake_route==='research'?'research':'listing',
      intake_reason:truncate_(cleanNullable_(x.intake_reason)||'',600),
      poster_box:validCrop_(x.poster_box)?x.poster_box:null,
      poster_confidence:['high','medium','low'].includes(x.poster_confidence)?x.poster_confidence:'low',
      promotion_end_date:dateKey_(x.promotion_end_date),
      listing_kind:['event','place','course','recurring','ad','partial','unknown'].indexOf(x.listing_kind)>=0?x.listing_kind:'unknown',
      place_type:['activity','experience','course','recurring_event','attraction','day_trip','restaurant'].indexOf(x.place_type)>=0?x.place_type:'activity',
      visible_text:truncate_(cleanNullable_(x.visible_text)||'',3000),
      visible_handles:cleanArray_(x.visible_handles),booking_reference:cleanNullable_(x.booking_reference),
      carousel_index:Number.isInteger(x.carousel_index)&&x.carousel_index>0?x.carousel_index:null,
      carousel_total:Number.isInteger(x.carousel_total)&&x.carousel_total>0?x.carousel_total:null
    },
    title: cleanNullable_(x.title),
    start_date: dateKey_(x.start_date) || null,
    end_date: dateKey_(x.end_date) || null,
    start_time: timeKey_(x.start_time) || null,
    end_time: timeKey_(x.end_time) || null,
    venue: cleanNullable_(x.venue),
    address: cleanNullable_(x.address),
    organizer: cleanNullable_(x.organizer),
    price: cleanNullable_(x.price),
    contact: normalizedContact_(x.contact),
    registration_url: cleanNullable_(x.registration_url),
    description: cleanNullable_(x.description),
    categories: cleanArray_(x.categories),
    age_info: cleanNullable_(x.age_info),
    source_account: cleanNullable_(x.source_account),
    confidence: confidence,
    uncertain_fields: cleanArray_(x.uncertain_fields),
    extraction_notes: cleanNullable_(x.extraction_notes)
  };
}

/** Shared HTTP wrapper. Transient failures pause calls until a later trigger; never switch to paid models. */
function geminiBusyUntil_(){return Number(PropertiesService.getScriptProperties().getProperty('GEMINI_BUSY_UNTIL')||0);}
function isTransientGeminiError_(error){return !!(error&&error.geminiTransient)||/Gemini HTTP (408|429|500|502|503|504)|Gemini temporarily busy/i.test(String(error&&error.message||error));}
function geminiRetryError_(message,until){const e=new Error(message);e.geminiTransient=true;e.retryAt=until;return e;}
function geminiRequest_(model,payload){
  const settings=getSettings_(),props=PropertiesService.getScriptProperties(),busy=geminiBusyUntil_();
  if(busy>Date.now())throw geminiRetryError_('Gemini temporarily busy. Automatic retry after '+new Date(busy).toISOString(),busy);
  const response=UrlFetchApp.fetch(CONFIG.API_BASE+encodeURIComponent(model)+':generateContent',{
    method:'post',contentType:'application/json',headers:{'x-goog-api-key':settings.apiKey},payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  const code=response.getResponseCode(),body=response.getContentText();
  if(typeof recordGeminiUsage_==='function')recordGeminiUsage_(payload,code);
  if([408,429,500,502,503,504].includes(code)){
    const failures=Math.min(6,Number(props.getProperty('GEMINI_BUSY_COUNT')||0)+1),headers=response.getAllHeaders?response.getAllHeaders():{},retryHeader=Object.keys(headers).find(k=>k.toLowerCase()==='retry-after');
    let retry=retryHeader?Number(headers[retryHeader])*1000:0;if(!isFinite(retry)||retry<0)retry=0;
    const delay=Math.min(3600000,Math.max(retry,(code===429?15:2)*60000*Math.pow(2,failures-1))),until=Date.now()+delay;
    props.setProperties({GEMINI_BUSY_UNTIL:String(until),GEMINI_BUSY_COUNT:String(failures)});
    throw geminiRetryError_('Gemini HTTP '+code+': temporarily unavailable. Retrying after '+new Date(until).toISOString()+'. '+truncate_(body,500),until);
  }
  if(code<200||code>=300)throw new Error('Gemini HTTP '+code+': '+truncate_(body,700));
  props.deleteProperty('GEMINI_BUSY_UNTIL');props.deleteProperty('GEMINI_BUSY_COUNT');
  let envelope;try{envelope=JSON.parse(body);}catch(e){throw new Error('Gemini returned invalid response JSON.');}
  const candidate=envelope.candidates&&envelope.candidates[0];
  const parts=candidate&&candidate.content&&candidate.content.parts||[];
  const text=parts.filter(function(p){return typeof p.text==='string'&&!p.thought;}).map(function(p){return p.text;}).join('\n');
  if(!text)throw new Error('Gemini returned no usable text.');
  return {text:text,candidate:candidate,usage:envelope.usageMetadata||{}};
}
function parseGeminiJson_(text){
  const clean=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(clean);}catch(e){throw new Error('Gemini output could not be parsed as JSON.');}
}
