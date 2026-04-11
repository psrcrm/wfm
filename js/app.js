'use strict';
// ── App Controller ──────────────────────────────────────────────────────────
const App = {
  currentScreen: 'splash',
  history: [],

  navigate(screenId) {
    const oldEl = document.getElementById('screen-' + this.currentScreen);
    const newEl = document.getElementById('screen-' + screenId);
    if (!newEl) return;
    if (oldEl && this.currentScreen !== 'splash') {
      oldEl.classList.add('prev');
      setTimeout(() => { oldEl.classList.remove('active', 'prev'); }, 300);
    } else if (oldEl) {
      oldEl.classList.remove('active');
    }
    newEl.classList.add('active');
    if (this.currentScreen !== 'splash') this.history.push(this.currentScreen);
    this.currentScreen = screenId;
  },

  goBack() {
    const prev = this.history.pop();
    if (prev) this.navigate(prev);
  },

  showToast(msg, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), duration);
  },

  showDialog(title, body, actions) {
    const existing = document.querySelector('.dialog-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body">${body}</div>
        <div class="dialog-actions">
          <button class="btn btn-outline btn-md flex-1" id="dialog-cancel">Cancel</button>
          ${actions.map((a, i) => `<button class="btn ${a.class} btn-md flex-1" id="dialog-action-${i}">${a.label}</button>`).join('')}
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(overlay);
    overlay.querySelector('#dialog-cancel').addEventListener('click', () => overlay.remove());
    actions.forEach((a, i) => {
      overlay.querySelector('#dialog-action-' + i).addEventListener('click', () => { overlay.remove(); a.action(); });
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  },

  initNavigation() {
    // Worker nav tabs
    document.getElementById('worker-nav').querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        if (!screen) return;
        document.querySelectorAll('#worker-nav .nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (screen === 'worker-home') { this.navigate('worker-home'); Tasks.loadWorkerHome(); }
        else if (screen === 'worker-calendar') { this.navigate('worker-calendar'); Cal.workerYear = new Date().getFullYear(); Cal.workerMonth = new Date().getMonth(); Cal.renderWorkerCalendar(); }
        else if (screen === 'worker-history') { this.navigate('worker-history'); Tasks.loadHistory(); }
        else if (screen === 'worker-settings') { this.navigate('worker-settings'); Tasks.renderWorkerSettings(); }
      });
    });

    // Calendar nav tabs
    document.querySelectorAll('.screen:not(#screen-worker-home) .nav-item[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        if (screen === 'worker-home') { this.navigate('worker-home'); Tasks.loadWorkerHome(); }
        else if (screen === 'worker-calendar') { this.navigate('worker-calendar'); Cal.renderWorkerCalendar(); }
        else if (screen === 'worker-history') { this.navigate('worker-history'); Tasks.loadHistory(); }
        else if (screen === 'worker-settings') { this.navigate('worker-settings'); Tasks.renderWorkerSettings(); }
      });
    });

    // Back buttons
    document.getElementById('task-back').addEventListener('click', () => { this.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('wcal-prev').addEventListener('click', () => {
      Cal.workerMonth--; if (Cal.workerMonth < 0) { Cal.workerMonth = 11; Cal.workerYear--; }
      Cal.renderWorkerCalendar();
    });
    document.getElementById('wcal-next').addEventListener('click', () => {
      Cal.workerMonth++; if (Cal.workerMonth > 11) { Cal.workerMonth = 0; Cal.workerYear++; }
      Cal.renderWorkerCalendar();
    });
    document.getElementById('wcal-back').addEventListener('click', () => { this.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('whist-back').addEventListener('click', () => { this.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('wset-back').addEventListener('click', () => { this.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('add-worker-back').addEventListener('click', () => { this.navigate('admin-home'); });
    document.getElementById('add-tpl-back').addEventListener('click', () => { this.navigate('admin-home'); });
    document.getElementById('assign-back').addEventListener('click', () => { this.navigate('admin-home'); });

    // Task filters
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => Tasks.applyFilter(btn.dataset.filter));
    });
  },

  async init() {
    await DB.open();
    await seedData();
    Sync.init();
    initPinPad();
    this.initNavigation();

    // Try auto-login
    const user = await Auth.autoLogin();
    if (user) {
      setTimeout(() => {
        if (user.role === 'admin' || user.role === 'supervisor') {
          this.navigate('admin-home');
          Admin.init();
        } else {
          this.navigate('worker-home');
          Tasks.loadWorkerHome();
        }
      }, 1000);
    } else {
      setTimeout(() => this.navigate('login'), 1000);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
      }).catch(err => console.log('SW error:', err));
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
