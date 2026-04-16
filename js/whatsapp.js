// ─────────────────────────────────────────────────────────────────────────────
// ApartmentCare — WhatsApp Module (v2)
// Handles: resident close notifications, supervisor escalation alerts
// Modes:
//   1. WATI / Twilio API  — if waApiUrl is set in Settings (full automation)
//   2. WhatsApp Web link  — fallback, opens wa.me link (one tap for supervisor)
// Depends on: db.js (window.DB)
// ─────────────────────────────────────────────────────────────────────────────

window.WhatsAppModule = (() => {

  // ── Message templates ───────────────────────────────────────────────────────

  const TEMPLATES = {

    // Sent to resident when their complaint ticket is closed
    ticketResolved: (ticket, task) => {
      const loc = ticket.locationId
        ? `at ${ticket.locationId.split('-').slice(-2).join(' ')}` : '';
      return [
        `Dear ${ticket.residentName || 'Resident'},`,
        ``,
        `Your complaint${loc ? ' ' + loc : ''} has been resolved.`,
        ``,
        `Issue: ${ticket.description ? ticket.description.slice(0, 80) : 'reported issue'}`,
        `Resolved: ${_formatDate(new Date())}`,
        ``,
        `Thank you for reporting this. We are committed to maintaining your home.`,
        ``,
        `— ${ticket.communityId || 'ApartmentCare'} Management`,
      ].join('\n');
    },

    // Sent to resident when ticket is acknowledged (optional early response)
    ticketAcknowledged: (ticket) => [
      `Dear ${ticket.residentName || 'Resident'},`,
      ``,
      `We have received your complaint and our team is working on it.`,
      ``,
      `Issue: ${ticket.description ? ticket.description.slice(0, 80) : 'reported issue'}`,
      `Expected by: ${ticket.slaDeadline ? _formatDate(new Date(ticket.slaDeadline)) : 'today'}`,
      ``,
      `We will update you once resolved.`,
      ``,
      `— ${ticket.communityId || 'ApartmentCare'} Management`,
    ].join('\n'),

    // Sent to supervisor phone when escalation is raised by worker
    escalationAlert: (finding, worker) => [
      `🔺 ESCALATION — ${finding.communityId || 'ApartmentCare'}`,
      ``,
      `Worker: ${finding.workerName || worker?.name || 'Unknown'}`,
      `Location: ${finding.locationId || 'unknown'}`,
      `Issue: ${finding.description || ''}`,
      `Severity: ${(finding.severity || '').toUpperCase()}`,
      `Time: ${_formatDate(new Date(finding.createdAt || new Date()))}`,
      ``,
      `Please review in the admin dashboard.`,
    ].join('\n'),

    // Sent to supervisor when a part request is raised
    partRequestAlert: (partReq, worker) => [
      `🔧 PART REQUEST — ${partReq.communityId || 'ApartmentCare'}`,
      ``,
      `Worker: ${partReq.workerName || worker?.name || 'Unknown'}`,
      `Location: ${partReq.locationId || 'unknown'}`,
      `Part needed: ${partReq.itemName} × ${partReq.quantity} ${partReq.unit}`,
      `Urgency: ${(partReq.urgency || 'normal').toUpperCase()}`,
      ``,
      `Please action in the admin queue.`,
    ].join('\n'),

  };

  // ── Core send function ──────────────────────────────────────────────────────

  async function _send(phone, message) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return { ok: false, reason: 'No phone number' };

    const waApiUrl = await DB.settings.get('waApiUrl') || '';
    const apiKey   = await DB.settings.get('waApiKey') || '';

    // Mode 1: WATI API (https://app.wati.io)
    if (waApiUrl && waApiUrl.includes('wati')) {
      return _sendViaWATI(waApiUrl, apiKey, cleanPhone, message);
    }

    // Mode 2: Twilio API
    if (waApiUrl && waApiUrl.includes('twilio')) {
      return _sendViaTwilio(waApiUrl, apiKey, cleanPhone, message);
    }

    // Mode 3: WhatsApp Web link (fallback — opens in browser for supervisor to tap)
    _openWhatsAppWeb(cleanPhone, message);
    return { ok: true, mode: 'web_link' };
  }

  async function _sendViaWATI(apiUrl, apiKey, phone, message) {
    try {
      const base    = apiUrl.replace(/\/$/, '');
      const endpoint = `${base}/api/v1/sendSessionMessage/${phone}`;
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ messageText: message }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, mode: 'wati', response: data };
    } catch (err) {
      console.warn('[WA] WATI send failed:', err);
      _openWhatsAppWeb(phone, message);
      return { ok: false, mode: 'wati_fallback', error: err.message };
    }
  }

  async function _sendViaTwilio(apiUrl, apiKey, phone, message) {
    // apiKey format expected: "ACCOUNT_SID:AUTH_TOKEN:FROM_NUMBER"
    try {
      const [sid, token, from] = (apiKey || '').split(':');
      if (!sid || !token || !from) throw new Error('Twilio config incomplete');

      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const body = new URLSearchParams({
        From: `whatsapp:+${from.replace(/\D/g,'')}`,
        To:   `whatsapp:+${phone}`,
        Body:  message,
      });
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, mode: 'twilio', response: data };
    } catch (err) {
      console.warn('[WA] Twilio send failed:', err);
      _openWhatsAppWeb(phone, message);
      return { ok: false, mode: 'twilio_fallback', error: err.message };
    }
  }

  function _openWhatsAppWeb(phone, message) {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  // ── Public: notify resident on ticket close ─────────────────────────────────

  async function notifyTicketResolved(ticketId) {
    const ticket = await DB.tickets.get(ticketId);
    if (!ticket) return { ok: false, reason: 'Ticket not found' };
    if (!ticket.whatsappNotify) return { ok: false, reason: 'WA notify disabled' };
    if (ticket.waMessageSent)   return { ok: false, reason: 'Already sent' };
    if (!ticket.residentPhone)  return { ok: false, reason: 'No phone number' };

    const task = ticket.linkedTaskId
      ? await DB.tasks.get(ticket.linkedTaskId) : null;

    const message = TEMPLATES.ticketResolved(ticket, task);
    const result  = await _send(ticket.residentPhone, message);

    // Mark as sent regardless of mode (web link = supervisor sent it manually)
    await DB.tickets.update(ticketId, { waMessageSent: true });

    // Sync updated ticket to Sheets
    if (window.SyncModule) SyncModule.enqueueRecord('tickets', ticketId);

    return result;
  }

  // ── Public: send acknowledged message to resident ──────────────────────────

  async function notifyTicketAcknowledged(ticketId) {
    const ticket = await DB.tickets.get(ticketId);
    if (!ticket?.residentPhone) return { ok: false, reason: 'No phone' };

    const message = TEMPLATES.ticketAcknowledged(ticket);
    return _send(ticket.residentPhone, message);
  }

  // ── Public: alert supervisor of escalation ─────────────────────────────────

  async function alertEscalation(findingId) {
    const finding = await DB.findings.get(findingId);
    if (!finding) return { ok: false, reason: 'Finding not found' };

    const worker = finding.workerId ? await DB.workers.get(finding.workerId) : null;

    // Get supervisor phone from settings
    const supervisorPhone = await DB.settings.get('supervisorPhone') || '';
    if (!supervisorPhone) return { ok: false, reason: 'No supervisor phone in Settings' };

    const message = TEMPLATES.escalationAlert(finding, worker);
    return _send(supervisorPhone, message);
  }

  // ── Public: alert supervisor of part request ───────────────────────────────

  async function alertPartRequest(partRequestId) {
    const pr = await DB.parts.get(partRequestId);
    if (!pr) return { ok: false, reason: 'Part request not found' };

    const worker = pr.workerId ? await DB.workers.get(pr.workerId) : null;

    const supervisorPhone = await DB.settings.get('supervisorPhone') || '';
    if (!supervisorPhone) return { ok: false, reason: 'No supervisor phone in Settings' };

    const message = TEMPLATES.partRequestAlert(pr, worker);
    return _send(supervisorPhone, message);
  }

  // ── Public: compose and open WhatsApp reply to resident ───────────────────

  async function replyToResident(ticketId, customMessage = '') {
    const ticket = await DB.tickets.get(ticketId);
    if (!ticket?.residentPhone) return;

    const message = customMessage ||
      `Dear ${ticket.residentName || 'Resident'}, thank you for contacting us. ` +
      `Our team is looking into your complaint and will update you shortly. ` +
      `— ${ticket.communityId || 'ApartmentCare'} Management`;

    _openWhatsAppWeb(ticket.residentPhone, message);
  }

  // ── Public: close ticket and send WA notification in one step ─────────────

  async function closeTicketAndNotify(ticketId, closingNote = '') {
    // 1. Close the ticket in DB
    await DB.tickets.close(ticketId, closingNote);

    // 2. Send WhatsApp if enabled
    const result = await notifyTicketResolved(ticketId);

    // 3. Sync to Sheets
    if (window.SyncModule) SyncModule.enqueueRecord('tickets', ticketId);

    return result;
  }

  // ── Helper: format date nicely ─────────────────────────────────────────────

  function _formatDate(d) {
    return d.toLocaleString([], {
      day:    '2-digit',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  }

  // ── Settings UI injection (adds WA fields to admin Settings tab) ───────────
  // Call this after admin Settings tab renders

  async function injectSettingsFields(container) {
    if (!container) return;
    const supervisorPhone = await DB.settings.get('supervisorPhone') || '';
    const waApiKey        = await DB.settings.get('waApiKey')        || '';

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-section-label" style="margin-top:16px;">WHATSAPP — SUPERVISOR ALERT</div>
      <div class="field">
        <label class="field-label">Supervisor WhatsApp number</label>
        <input type="tel" id="set-sup-phone" class="field-input"
          value="${supervisorPhone}" placeholder="+91 98765 00000">
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
          Receives escalation and part request alerts
        </div>
      </div>
      <div class="form-section-label" style="margin-top:16px;">WHATSAPP API (WATI / TWILIO)</div>
      <div class="field">
        <label class="field-label">API key / credentials</label>
        <input type="text" id="set-wa-key" class="field-input"
          value="${waApiKey}" placeholder="WATI: Bearer token · Twilio: SID:TOKEN:FROM">
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
          Leave blank to use WhatsApp web links (supervisor taps to send)
        </div>
      </div>
      <div class="wa-mode-info">
        <b>Without API key:</b> WhatsApp opens in browser, pre-filled — supervisor taps Send.<br>
        <b>With WATI key:</b> Messages sent automatically on ticket close.<br>
        <b>With Twilio:</b> Format key as <code>ACCOUNT_SID:AUTH_TOKEN:FROM_NUMBER</code>
      </div>`;

    container.appendChild(wrap);

    // Save these fields when the main settings Save button is clicked
    const saveBtn = container.querySelector('#set-save');
    if (saveBtn) {
      const origClick = saveBtn.onclick;
      saveBtn.onclick = async () => {
        const ph  = document.getElementById('set-sup-phone')?.value.trim();
        const key = document.getElementById('set-wa-key')?.value.trim();
        if (ph  !== undefined) await DB.settings.set('supervisorPhone', ph);
        if (key !== undefined) await DB.settings.set('waApiKey', key);
        if (origClick) origClick();
      };
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    notifyTicketResolved,
    notifyTicketAcknowledged,
    alertEscalation,
    alertPartRequest,
    replyToResident,
    closeTicketAndNotify,
    injectSettingsFields,
    TEMPLATES,
  };

})();
