const CONFIG = Object.freeze({
  SHEET_NAME: 'Events',

  // Override with Script Property GEMINI_MODEL without editing code.
  // Keep this configurable because available/recommended Gemini models change.
  DEFAULT_GEMINI_MODEL: 'gemini-3.5-flash-lite',

  API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models/',

  MAX_FILES_PER_RUN: 10,
  MAX_IMAGE_BYTES: 15 * 1024 * 1024,

  TRIGGER_EVERY_MINUTES: 5,

  STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ERROR: 'error'
  },

  SUPPORTED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ],

  HEADERS: [
    'id',
    'status',
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
    'source_platform',
    'source_account',
    'confidence',
    'uncertain_fields',
    'extraction_notes',
    'original_image_file_id',
    'original_image_url',
    'original_filename',
    'processed_at',
    'error'
  ]
});

function getSettings_() {
  const props = PropertiesService.getScriptProperties();

  const settings = {
    apiKey: props.getProperty('GEMINI_API_KEY'),
    inboxFolderId: props.getProperty('INBOX_FOLDER_ID'),
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    model: props.getProperty('GEMINI_MODEL') || CONFIG.DEFAULT_GEMINI_MODEL
  };

  const missing = [];
  if (!settings.apiKey) missing.push('GEMINI_API_KEY');
  if (!settings.inboxFolderId) missing.push('INBOX_FOLDER_ID');
  if (!settings.spreadsheetId) missing.push('SPREADSHEET_ID');

  if (missing.length) {
    throw new Error('Missing Script Properties: ' + missing.join(', '));
  }

  return settings;
}
