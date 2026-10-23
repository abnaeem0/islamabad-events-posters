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
