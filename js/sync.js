'use strict';
// ── Sync — Google Sheets integration ─────────────────────────────────────────
// SETUP: Paste your Google Apps Script Web App URL below after deployment
const Sync = {
  // ▼▼▼ PASTE YOUR APPS SCRIPT URL HERE ▼▼▼
  SHEETS_URL: 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec',
  // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

  get isConfigured() {
    return this.SHEETS_URL && !this.SHEETS_URL.includes('REPLACE_WITH');
  },

  async syncSubmission(submission) {
    if (!navigator.onLine) {
      await DB.put('queue', { recordId: submission.recordId, ...submission });
      return false;
    }
    if (!this.isConfigured) {
      console.warn('Google Sheets URL not configured — submission stored locally only');
      return false;
    }
    try {
      const payload = this.buildSheetRow(submission);
      // Must use no-cors for Apps Script from GitHub Pages (CORS limitation)
      // Apps Script doPost handles the append; we can't read the response with no-cors
      await fetch(this.SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      // Mark synced in local DB
      const sub = await DB.get('submissions', submission.recordId);
      if (sub) { sub.synced = true; await DB.put('submissions', sub); }
      await DB.delete('queue', submission.recordId).catch(() => {});
      console.log('Synced to Sheets:', submission.recordId);
      return true;
    } catch (e) {
      console.error('Sync failed, queuing:', e);
      await DB.put('queue', { recordId: submission.recordId, ...submission });
      return false;
    }
  },

  async processQueue() {
    if (!navigator.onLine || !this.isConfigured) return;
    const queue = await DB.getAll('queue');
    if (!queue.length) return;
    App.showToast(`Syncing ${queue.length} queued submission${queue.length > 1 ? 's' : ''}…`);
    let synced = 0;
    for (const item of queue) {
      const ok = await this.syncSubmission(item);
      if (ok) synced++;
    }
    const remaining = await DB.getAll('queue');
    if (!remaining.length) App.showToast(`All ${synced} submissions synced ✓`);
  },

  buildSheetRow(sub) {
    return {
      record_id:      sub.recordId,
      worker_id:      sub.workerId,
      worker_name:    sub.workerName,
      task_id:        sub.templateId,
      task_name:      sub.taskName,
      category:       sub.category,
      date:           sub.date,
      status:         sub.status,
      form_data_json: JSON.stringify(sub.formData || {}),
      image_urls:     JSON.stringify(sub.imageUrls || {}),
      submitted_at:   sub.submittedAt,
      community_id:   sub.communityId || 'COMM-001',
    };
  },

  init() {
    // Fix offline banner — only show if actually offline
    const banner = document.getElementById('offline-banner');
    banner.style.display = navigator.onLine ? 'none' : 'block';

    window.addEventListener('online', () => {
      banner.style.display = 'none';
      this.processQueue();
    });
    window.addEventListener('offline', () => {
      banner.style.display = 'block';
    });
  },
};

window.Sync = Sync;
