function isSupportedImage_(file) {
  return CONFIG.SUPPORTED_MIME_TYPES.indexOf(file.getMimeType()) !== -1;
}

function makeEventId_() {
  return 'evt_' +
    Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd_HHmmss') +
    '_' +
    Utilities.getUuid().slice(0, 8);
}

function cleanNullable_(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text ? text : null;
}

function cleanArray_(value) {
  if (!Array.isArray(value)) return [];

  const seen = {};
  return value
    .map(function(x) { return String(x || '').trim(); })
    .filter(function(x) {
      const key = x.toLowerCase();
      if (!x || seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function serializeCell_(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function truncate_(text, maxLength) {
  text = String(text || '');
  return text.length <= maxLength
    ? text
    : text.slice(0, maxLength) + '…';
}

function processedPropertyKey_(fileId) {
  return 'PROCESSED_' + fileId;
}

function isProcessed_(fileId) {
  return PropertiesService
    .getScriptProperties()
    .getProperty(processedPropertyKey_(fileId)) === '1';
}

function markProcessed_(fileId) {
  PropertiesService
    .getScriptProperties()
    .setProperty(processedPropertyKey_(fileId), '1');
}

/**
 * Development helper: allows one Drive image to be processed again.
 */
function unmarkProcessed(fileId) {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(processedPropertyKey_(fileId));
}
