/**
 * Pigsfield usage logger — Google Apps Script Web App.
 * Appends one row per resource "use" to the bound Google Sheet.
 * Deploy as a Web app (Execute as: Me · Access: Anyone). See SETUP.md.
 */
function doPost(e) {
  try {
    var data = {};
    try { data = JSON.parse(e.postData.contents); } catch (err) {}
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["timestamp", "id", "title", "app", "ns"]);
    }
    sheet.appendRow([
      new Date(),
      String(data.id || ""),
      String(data.title || ""),
      String(data.app || ""),
      String(data.ns || "")
    ]);
    return ContentService.createTextOutput("ok");
  } catch (err) {
    return ContentService.createTextOutput("err");
  }
}

// Optional: visit the /exec URL in a browser to confirm the script is deployed.
function doGet() {
  return ContentService.createTextOutput("Pigsfield usage logger is running.");
}
