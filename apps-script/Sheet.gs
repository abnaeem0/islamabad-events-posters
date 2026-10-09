function ensureEventsSheet_() {
  const settings = getSettings_();
  const ss = SpreadsheetApp.openById(settings.spreadsheetId);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length)
      .setValues([CONFIG.HEADERS]);

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length)
      .setFontWeight('bold');

    sheet.getRange(1, 1, sheet.getMaxRows(), CONFIG.HEADERS.length)
      .setVerticalAlignment('top');

    addStatusValidation_(sheet);
  } else {
    validateHeaders_(sheet);
    addStatusValidation_(sheet);
  }

  return sheet;
}

function validateHeaders_(sheet) {
  const actual = sheet
    .getRange(1, 1, 1, CONFIG.HEADERS.length)
    .getValues()[0];

  for (let i = 0; i < CONFIG.HEADERS.length; i++) {
    if (actual[i] !== CONFIG.HEADERS[i]) {
      throw new Error(
        'Unexpected Events sheet header at column ' +
        (i + 1) +
        '. Expected "' + CONFIG.HEADERS[i] +
        '", found "' + actual[i] + '".'
      );
    }
  }
}

function addStatusValidation_(sheet) {
  const statusCol = CONFIG.HEADERS.indexOf('status') + 1;

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      CONFIG.STATUS.PENDING,
      CONFIG.STATUS.APPROVED,
      CONFIG.STATUS.REJECTED,
      CONFIG.STATUS.ERROR
    ], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, statusCol, Math.max(sheet.getMaxRows() - 1, 1), 1)
    .setDataValidation(rule);
}

function appendEventRow_(rowObject) {
  const sheet = ensureEventsSheet_();
  const row = CONFIG.HEADERS.map(function(header) {
    return serializeCell_(rowObject[header]);
  });

  sheet.appendRow(row);
}

function appendErrorRow_(file, err) {
  appendEventRow_({
    id: makeEventId_(),
    status: CONFIG.STATUS.ERROR,
    source_platform: 'instagram_screenshot',
    confidence: 'low',
    original_image_file_id: file.getId(),
    original_image_url: file.getUrl(),
    original_filename: file.getName(),
    processed_at: new Date().toISOString(),
    error: truncate_(String(err && err.message ? err.message : err), 2000)
  });
}

function buildEventRow_(file, extraction) {
  return {
    id: makeEventId_(),
    status: CONFIG.STATUS.PENDING,

    title: extraction.title,
    start_date: extraction.start_date,
    end_date: extraction.end_date,
    start_time: extraction.start_time,
    end_time: extraction.end_time,
    venue: extraction.venue,
    address: extraction.address,
    organizer: extraction.organizer,
    price: extraction.price,
    contact: extraction.contact,
    registration_url: extraction.registration_url,
    description: extraction.description,
    categories: extraction.categories,
    age_info: extraction.age_info,

    source_platform: 'instagram_screenshot',
    source_account: extraction.source_account,

    confidence: extraction.confidence,
    uncertain_fields: extraction.uncertain_fields,
    extraction_notes: extraction.extraction_notes,

    original_image_file_id: file.getId(),
    original_image_url: file.getUrl(),
    original_filename: file.getName(),
    processed_at: new Date().toISOString(),
    error: ''
  };
}
