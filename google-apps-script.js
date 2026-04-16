// ─────────────────────────────────────────────────────────────────────────────
// ApartmentCare — Google Apps Script (v2)
// Deploy as: Web App → Execute as Me → Access: Anyone
//
// SETUP INSTRUCTIONS:
//   1. Open your Google Sheet
//   2. Extensions → Apps Script → paste this entire file
//   3. Set SPREADSHEET_ID below (get from your sheet URL)
//   4. Click Deploy → New deployment → Web app
//   5. Execute as: Me | Who has access: Anyone
//   6. Copy the Web App URL → paste into app Settings tab
//
// SHEET TABS CREATED AUTOMATICALLY:
//   WorkLog | Tickets | Findings | PartRequests | Expenses | Checkins
// ─────────────────────────────────────────────────────────────────────────────

var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← replace this

// ── Column definitions for each tab ──────────────────────────────────────────

var COLUMNS = {

  WorkLog: [
    'record_id', 'worker_id', 'worker_name', 'task_id', 'task_name',
    'category', 'date', 'status', 'location_id', 'outcome', 'outcome_note',
    'form_data_json', 'submitted_at', 'community_id',
  ],

  Tickets: [
    'record_id', 'resident_name', 'resident_phone', 'resident_alt',
    'source_channel', 'location_id', 'category', 'description', 'severity',
    'status', 'linked_task_id', 'sla_deadline', 'wa_notify', 'wa_sent',
    'community_id', 'created_by', 'created_at', 'resolved_at', 'notes',
  ],

  Findings: [
    'record_id', 'task_id', 'location_id', 'worker_id', 'worker_name',
    'type', 'description', 'severity', 'status', 'supervisor_note',
    'assigned_to', 'estimated_cost', 'community_id', 'created_at', 'resolved_at',
  ],

  PartRequests: [
    'record_id', 'task_id', 'location_id', 'worker_id', 'worker_name',
    'item_name', 'quantity', 'unit', 'urgency', 'status', 'supervisor_note',
    'issued_from', 'vendor', 'cost', 'community_id', 'created_at', 'resolved_at',
  ],

  Expenses: [
    'record_id', 'location_id', 'task_id', 'finding_id', 'part_request_id',
    'ticket_id', 'category', 'description', 'amount', 'vendor', 'receipt_url',
    'approved_by', 'community_id', 'created_at',
  ],

  Checkins: [
    'record_id', 'worker_id', 'task_id', 'location_id', 'method',
    'community_id', 'checked_in_at',
  ],
};

// ── Main entry point ─────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var tabName = data.sheet_tab || 'WorkLog';

    // Validate tab name
    if (!COLUMNS[tabName]) {
      return _jsonResponse({ status: 'error', message: 'Unknown sheet tab: ' + tabName });
    }

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = _getOrCreateSheet(ss, tabName);

    // Duplicate check — never overwrite
    var recordId = data.record_id || '';
    if (recordId && _isDuplicate(sheet, recordId)) {
      // For tickets/findings/parts — update status fields if record exists
      if (['Tickets','Findings','PartRequests'].indexOf(tabName) !== -1) {
        _updateExistingRow(sheet, recordId, data, tabName);
        return _jsonResponse({ status: 'updated', record_id: recordId });
      }
      return _jsonResponse({ status: 'duplicate', record_id: recordId });
    }

    // Build row from column definition
    var cols = COLUMNS[tabName];
    var row  = cols.map(function(col) {
      var val = data[col];
      if (val === undefined || val === null) return '';
      if (typeof val === 'boolean') return val ? 'yes' : 'no';
      return String(val);
    });

    sheet.appendRow(row);

    // Auto-trigger WhatsApp if it's a ticket close with wa_notify=yes
    if (tabName === 'Tickets' && data.wa_notify === 'yes' &&
        data.status === 'closed' && data.wa_sent !== 'yes') {
      _logWhatsAppPending(ss, data);
    }

    return _jsonResponse({ status: 'ok', record_id: recordId, tab: tabName });

  } catch (err) {
    return _jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput('ApartmentCare API v2 active — ' + new Date().toISOString());
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function _getOrCreateSheet(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    // Create the sheet and add header row
    sheet = ss.insertSheet(tabName);
    var cols = COLUMNS[tabName];

    // Header row — bold, frozen
    var headerRange = sheet.getRange(1, 1, 1, cols.length);
    headerRange.setValues([cols]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1B6EF3');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    // Auto-resize columns
    sheet.autoResizeColumns(1, cols.length);
  }

  return sheet;
}

function _isDuplicate(sheet, recordId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Check column A (record_id) for match
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(recordId)) return true;
  }
  return false;
}

// Update status/resolved fields for existing rows (tickets, findings, parts)
function _updateExistingRow(sheet, recordId, data, tabName) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(recordId)) {
      var rowNum = i + 2; // +2: 1-indexed + header row

      var cols     = COLUMNS[tabName];
      var statusIdx = cols.indexOf('status');
      var resolvedIdx = cols.indexOf('resolved_at');
      var waSentIdx   = cols.indexOf('wa_sent');
      var noteIdx     = cols.indexOf('notes') !== -1
                          ? cols.indexOf('notes')
                          : cols.indexOf('supervisor_note');

      if (statusIdx   >= 0 && data.status)
        sheet.getRange(rowNum, statusIdx + 1).setValue(data.status);
      if (resolvedIdx >= 0 && data.resolved_at)
        sheet.getRange(rowNum, resolvedIdx + 1).setValue(data.resolved_at);
      if (waSentIdx   >= 0 && data.wa_sent)
        sheet.getRange(rowNum, waSentIdx + 1).setValue(data.wa_sent);
      if (noteIdx >= 0 && (data.notes || data.supervisor_note))
        sheet.getRange(rowNum, noteIdx + 1).setValue(data.notes || data.supervisor_note || '');

      break;
    }
  }
}

// ── WhatsApp pending log ──────────────────────────────────────────────────────
// Creates a "WA_Pending" tab listing tickets that need WhatsApp confirmation
// This is a simple audit trail — actual sending is done by the app

function _logWhatsAppPending(ss, ticketData) {
  var sheet = _getOrCreateSheet(ss, 'WA_Pending');

  // Check if already logged
  if (_isDuplicate(sheet, ticketData.record_id)) return;

  sheet.appendRow([
    ticketData.record_id,
    ticketData.resident_name  || '',
    ticketData.resident_phone || '',
    ticketData.location_id    || '',
    ticketData.description    ? ticketData.description.slice(0, 100) : '',
    ticketData.resolved_at    || new Date().toISOString(),
    'PENDING',
  ]);
}

// Add WA_Pending columns when creating that sheet
var _origGetOrCreate = _getOrCreateSheet;

// ── JSON response helper ─────────────────────────────────────────────────────

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── One-time setup function ───────────────────────────────────────────────────
// Run this manually once from Apps Script editor to create all sheets upfront

function setupAllSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var tabsToCreate = Object.keys(COLUMNS);
  tabsToCreate.push('WA_Pending');

  tabsToCreate.forEach(function(tabName) {
    _getOrCreateSheet(ss, tabName);
  });

  // WA_Pending headers (not in COLUMNS)
  var waPending = ss.getSheetByName('WA_Pending');
  if (waPending && waPending.getLastRow() === 0) {
    var waHeaders = ['record_id','resident_name','resident_phone',
                     'location_id','description','resolved_at','wa_status'];
    var r = waPending.getRange(1, 1, 1, waHeaders.length);
    r.setValues([waHeaders]);
    r.setFontWeight('bold');
    r.setBackground('#25D366');
    r.setFontColor('#ffffff');
    waPending.setFrozenRows(1);
  }

  Logger.log('Setup complete — all sheets created');
}

// ── Useful manual triggers ────────────────────────────────────────────────────
// Run these from the Apps Script editor when needed

// Mark all WA_Pending items as sent (after you've sent them manually)
function markWAPendingAsSent() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('WA_Pending');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Column 7 = wa_status
  sheet.getRange(2, 7, lastRow - 1, 1)
       .setValue('SENT - ' + new Date().toLocaleDateString());

  Logger.log('Marked ' + (lastRow - 1) + ' WA items as sent');
}

// Get summary stats — run to see counts across all sheets
function getSummaryStats() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var stats = {};

  Object.keys(COLUMNS).forEach(function(tab) {
    var sheet = ss.getSheetByName(tab);
    stats[tab] = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  });

  Logger.log(JSON.stringify(stats, null, 2));
  return stats;
}
