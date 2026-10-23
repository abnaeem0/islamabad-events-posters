/** Run once from the spreadsheet-bound Apps Script project. Never put the token in source code. */
function setupGitHubExportToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'GitHub export token',
    'Paste your random password (at least 32 characters).',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const token = response.getResponseText().trim();
  if (token.length < 32) {
    ui.alert('Token must contain at least 32 characters. Nothing saved.');
    return;
  }

  PropertiesService.getScriptProperties()
    .setProperty('GITHUB_EXPORT_TOKEN', token);

  ui.alert('Export token saved.');
}

/** Run once after saving EXPORT_URL and EXPORT_TOKEN in GitHub. */
function enableGitHubPublishing() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('GITHUB_EXPORT_TOKEN') || '').length < 32) {
    ui.alert('Save the export token first using setupGitHubExportToken.');
    return;
  }
  const response = ui.prompt(
    'Enable GitHub publishing',
    'Paste your public GitHub Pages website URL (not the Google /exec URL).\n' +
    'For this repository, unless you use a custom domain:\n' +
    'https://abnaeem0.github.io/islamabad-events-posters/',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const url = response.getResponseText().trim().replace(/\/+$/, '') + '/';
  if (!/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?\/$/.test(url) ||
      /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com)(?:\/|$)/i.test(url)) {
    ui.alert('Enter the public website HTTPS URL. Nothing changed.');
    return;
  }
  props.setProperties({
    GITHUB_PAGES_URL: url,
    PUBLICATION_TARGET: 'github',
    PIPELINE_DIRTY: '1'
  }, false);
  ui.alert('GitHub publishing enabled. Updates now go to GitHub; the previous website will stop receiving updates.');
}
