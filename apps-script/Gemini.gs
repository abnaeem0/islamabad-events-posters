function extractEventFromPoster_(blob, filename) {
  const settings = getSettings_();
  const mimeType = blob.getContentType();

  if (CONFIG.SUPPORTED_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Unsupported image MIME type: ' + mimeType);
  }

  const prompt = [
    'You extract public event information from event posters for an Islamabad events guide.',
    '',
    'Read this poster carefully. Return a separate item for each genuinely separate event. Multiple days of one event can remain one item. Extract only information supported by the image.',
    'Do not invent missing facts.',
    'The event is expected to be relevant to Islamabad, Pakistan, but do not use that expectation to fill missing venue/address details.',
    '',
    'Date rules:',
    '- Return dates as YYYY-MM-DD only when the year/date can be determined from the poster.',
    '- If the year is not shown and cannot be safely established from the poster itself, return null and flag the field as uncertain.',
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

  const url = CONFIG.API_BASE +
    encodeURIComponent(settings.model) +
    ':generateContent';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': settings.apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Gemini HTTP ' + code + ': ' + truncate_(body, 1000));
  }

  let envelope;
  try {
    envelope = JSON.parse(body);
  } catch (err) {
    throw new Error('Gemini returned invalid response JSON.');
  }

  const candidate = envelope.candidates && envelope.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;

  if (!parts || !parts.length) {
    const reason = candidate && candidate.finishReason
      ? ' Finish reason: ' + candidate.finishReason
      : '';
    throw new Error('Gemini returned no usable content.' + reason);
  }

  const textPart = parts.find(function(part) {
    return typeof part.text === 'string';
  });

  if (!textPart) {
    throw new Error('Gemini response contained no text JSON.');
  }

  let result;
  try {
    result = JSON.parse(textPart.text);
  } catch (err) {
    throw new Error('Could not parse Gemini structured output: ' + truncate_(textPart.text, 1000));
  }

  if (!result || !Array.isArray(result.events)) throw new Error('Gemini did not return events array');
  return result.events.map(normalizeExtraction_).filter(function(e){return e.title || e.start_date || e.venue;});
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
    title: cleanNullable_(x.title),
    start_date: cleanNullable_(x.start_date),
    end_date: cleanNullable_(x.end_date),
    start_time: cleanNullable_(x.start_time),
    end_time: cleanNullable_(x.end_time),
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
