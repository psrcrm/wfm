'use strict';
const Sync = {
  SHEETS_URL: '', // Set your Google Apps Script Web App URL here
  DRIVE_URL: '',  // Set your Google Drive upload endpoint here

  async syncSubmission(submission) {
    if (!navigator.onLine) return;
    try {
      // In production: POST to Google Apps Script endpoint
      // const res = await fetch(this.SHEETS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(submission) });
      // Mark synced
      const sub = await DB.get('submissions', submission.recordId);
      if (sub) { sub.synced = true; await DB.put('submissions', sub); }
      await DB.delete('queue', submission.recordId);
      console.log('Synced:', submission.recordId);
    } catch (e) {
      console.error('Sync failed:', e);
    }
  },

  async processQueue() {
    if (!navigator.onLine) return;
    const queue = await DB.getAll('queue');
    if (queue.length === 0) return;
    App.showToast(`Syncing ${queue.length} pending submission${queue.length > 1 ? 's' : ''}...`);
    for (const item of queue) {
      await this.syncSubmission(item);
    }
    const remaining = await DB.getAll('queue');
    if (remaining.length === 0) App.showToast('All submissions synced ✓');
  },

  async getQueueCount() {
    const q = await DB.getAll('queue');
    return q.length;
  },

  init() {
    window.addEventListener('online', () => {
      document.getElementById('offline-banner').style.display = 'none';
      this.processQueue();
    });
    window.addEventListener('offline', () => {
      document.getElementById('offline-banner').style.display = 'block';
    });
    if (!navigator.onLine) document.getElementById('offline-banner').style.display = 'block';
  },

  // Build Google Apps Script append row payload
  buildSheetRow(submission) {
    return {
      record_id: submission.recordId,
      worker_id: submission.workerId,
      worker_name: submission.workerName,
      task_id: submission.templateId,
      task_name: submission.taskName,
      category: submission.category,
      date: submission.date,
      status: submission.status,
      form_data_json: JSON.stringify(submission.formData),
      image_urls: JSON.stringify(submission.imageUrls),
      submitted_at: submission.submittedAt,
      community_id: submission.communityId,
    };
  },
};
