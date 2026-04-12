// ═══════════════════════════════════════════════════════════════════════════
// ApartmentCare — Google Apps Script Backend
// Deploy as: Extensions → Apps Script → Deploy → New deployment
//   Type: Web app | Execute as: Me | Who has access: Anyone
// ═══════════════════════════════════════════════════════════════════════════

// ▼▼▼ REPLACE THESE VALUES ▼▼▼
const SHEET_ID   = 'YOUR_GOOGLE_SHEET_ID_HERE';   // From the sheet URL
const FOLDER_ID  = 'YOUR_DRIVE_FOLDER_ID_HERE';   // For image uploads (optional)
const SHEET_NAME = 'WorkLog';                       // Sheet tab name
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

const HEADERS = [
  'record_id','worker_id','worker_name','task_id','task_name',
  'category','date','status','form_data_json','image_urls',
  'submitted_at','community_id','synced_at'
];

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Write headers
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Handle POST from PWA — body is JSON text (no-cors mode)
function doPost(e) {
  try {
    // no-cors sends body as plain text
    const raw  = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    if (!data.record_id) {
      return jsonResponse({ status: 'error', message: 'Missing record_id' });
    }

    const sheet = getSheet();

    // ── DUPLICATE CHECK — never overwrite ──────────────────────────────────
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      if (existingIds.includes(data.record_id)) {
        return jsonResponse({ status: 'duplicate', record_id: data.record_id });
      }
    }

    // ── APPEND ROW — never update existing ────────────────────────────────
    sheet.appendRow([
      data.record_id,
      data.worker_id      || '',
      data.worker_name    || '',
      data.task_id        || '',
      data.task_name      || '',
      data.category       || '',
      data.date           || '',
      data.status         || '',
      data.form_data_json || '{}',
      data.image_urls     || '{}',
      data.submitted_at   || new Date().toISOString(),
      data.community_id   || '',
      new Date().toISOString(),   // synced_at
    ]);

    return jsonResponse({ status: 'ok', record_id: data.record_id });

  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// Handle GET — for testing connectivity
function doGet(e) {
  const action = e.parameter ? e.parameter.action : '';

  if (action === 'stats') {
    try {
      const sheet   = getSheet();
      const lastRow = sheet.getLastRow();
      const count   = Math.max(0, lastRow - 1);
      return jsonResponse({ status: 'ok', total_rows: count });
    } catch (err) {
      return jsonResponse({ status: 'error', message: err.toString() });
    }
  }

  // Default: health check
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', service: 'ApartmentCare API', version: '1.0' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── UTILITY: Upload base64 image to Google Drive ───────────────────────────
// Call this if you want to store images in Drive instead of as base64
function uploadImageToDrive(base64Data, filename, mimeType) {
  try {
    const folder  = DriveApp.getFolderById(FOLDER_ID);
    const decoded = Utilities.base64Decode(base64Data.split(',')[1] || base64Data);
    const blob    = Utilities.newBlob(decoded, mimeType || 'image/jpeg', filename);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    console.error('Drive upload failed:', e);
    return '';
  }
}

// ── TEST FUNCTION — run manually from Apps Script editor ──────────────────
function testAppendRow() {
  const testData = {
    record_id:      'TEST-WK01-TPL003-20250411-143022',
    worker_id:      'WK-0001',
    worker_name:    'Rajan Kumar',
    task_id:        'TPL-003',
    task_name:      'Generator Check',
    category:       'Electrical',
    date:           '2025-04-11',
    status:         'completed',
    form_data_json: '{"fuel_level":"75","oil_level":"Full","generator_running":true}',
    image_urls:     '{}',
    submitted_at:   new Date().toISOString(),
    community_id:   'COMM-001',
  };
  const sheet = getSheet();
  sheet.appendRow(Object.values(testData).concat([new Date().toISOString()]));
  Logger.log('Test row appended successfully');
}
