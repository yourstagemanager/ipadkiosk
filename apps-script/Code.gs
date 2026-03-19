// ============================================
// iPad Kiosk - Google Apps Script Backend
// ============================================
// Uses Google Sheets as a simple CMS.
// Serves the kiosk display page and editor PWA.
// ============================================

var CONFIG_SHEET = 'KioskContent';
var LOG_SHEET = 'ProofOfPlay';

// --- Web App Entry Points ---

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'kiosk';

  if (page === 'editor') {
    return HtmlService.createHtmlOutputFromFile('editor')
      .setTitle('Kiosk Editor')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  if (page === 'data') {
    // JSON API endpoint for the local fetcher script
    var data = getKioskData();
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'ping') {
    logPlay('ping');
    return ContentService.createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  if (page === 'render') {
    // Returns raw kiosk HTML (for local fetcher to cache)
    logPlay('render');
    var template = HtmlService.createTemplateFromFile('kiosk');
    template.kioskData = JSON.stringify(getKioskData());
    // Return raw HTML string instead of HtmlOutput
    var html = template.evaluate().getContent();
    return ContentService.createTextOutput(html)
      .setMimeType(ContentService.MimeType.TEXT);
  }

  // Default: serve kiosk display directly
  logPlay('direct-load');
  var template = HtmlService.createTemplateFromFile('kiosk');
  template.kioskData = JSON.stringify(getKioskData());
  return template.evaluate()
    .setTitle('Kiosk')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'update') {
      updateKioskData(data.fields);
      return jsonResponse({ success: true });
    }

    if (action === 'upload') {
      var url = saveImage(data.image, data.filename);
      return jsonResponse({ success: true, url: url });
    }

    if (action === 'getData') {
      return jsonResponse(getKioskData());
    }

    if (action === 'getLog') {
      return jsonResponse(getPlayLog());
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// --- Data Layer ---

function getKioskData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET);
    var defaults = [
      ['message', 'Welcome'],
      ['fontSize', '64'],
      ['fontColor', '#FFFFFF'],
      ['bgColor', '#1a1a2e'],
      ['fontFamily', 'Helvetica, Arial, sans-serif'],
      ['imageUrl', ''],
      ['imagePosition', 'above'],
      ['imageMaxWidth', '60'],
      ['watermarkUrl', ''],
      ['watermarkUrl2', ''],
      ['headerText', ''],
      ['footerText', ''],
      ['refreshInterval', '300'],
      ['lastUpdated', new Date().toISOString()]
    ];
    sheet.getRange(1, 1, defaults.length, 2).setValues(defaults);
  }

  var data = {};
  var rows = sheet.getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    data[rows[i][0]] = rows[i][1];
  }
  return data;
}

function updateKioskData(fields) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    getKioskData(); // Initialize with defaults
    sheet = ss.getSheetByName(CONFIG_SHEET);
  }

  var rows = sheet.getDataRange().getValues();
  var keyRowMap = {};
  for (var i = 0; i < rows.length; i++) {
    keyRowMap[rows[i][0]] = i + 1; // 1-indexed
  }

  for (var key in fields) {
    if (fields.hasOwnProperty(key)) {
      if (keyRowMap[key]) {
        sheet.getRange(keyRowMap[key], 2).setValue(fields[key]);
      } else {
        // New key, append
        sheet.appendRow([key, fields[key]]);
      }
    }
  }

  // Always update timestamp
  if (keyRowMap['lastUpdated']) {
    sheet.getRange(keyRowMap['lastUpdated'], 2).setValue(new Date().toISOString());
  }
}

// --- Image Upload ---

function saveImage(base64Data, filename) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parentFolders = DriveApp.getFileById(ss.getId()).getParents();
  var folder = parentFolders.hasNext() ? parentFolders.next() : DriveApp.getRootFolder();

  var imgFolders = folder.getFoldersByName('kiosk-images');
  var imgFolder;
  if (imgFolders.hasNext()) {
    imgFolder = imgFolders.next();
  } else {
    imgFolder = folder.createFolder('kiosk-images');
  }

  // Detect mime type from base64 header or default to jpeg
  var mimeType = 'image/jpeg';
  if (base64Data.indexOf('data:') === 0) {
    var parts = base64Data.split(',');
    mimeType = parts[0].split(':')[1].split(';')[0];
    base64Data = parts[1];
  }

  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType,
    filename || 'kiosk-image-' + Date.now() + '.jpg'
  );

  var file = imgFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Use the direct image URL format
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

// --- Proof of Play Logging ---

function logPlay(event) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    sheet.appendRow(['Timestamp', 'Event']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  }

  sheet.appendRow([new Date().toISOString(), event || 'page-load']);

  // Keep only last 2000 entries to avoid bloat
  var lastRow = sheet.getLastRow();
  if (lastRow > 2001) {
    sheet.deleteRows(2, lastRow - 2001);
  }
}

function getPlayLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var result = [];
  var start = Math.max(1, data.length - 100);
  for (var i = data.length - 1; i >= start; i--) {
    result.push({ timestamp: data[i][0], event: data[i][1] });
  }
  return result;
}

// --- Helpers ---

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Functions callable from editor via google.script.run ---

function clientGetData() {
  return getKioskData();
}

function clientSaveData(fields) {
  updateKioskData(fields);
  return { success: true };
}

function clientUploadImage(base64Data, filename) {
  return saveImage(base64Data, filename);
}

function clientGetLog() {
  return getPlayLog();
}
