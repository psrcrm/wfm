'use strict';
// ── App Controller ──────────────────────────────────────────────────────────
const App = {
  currentScreen: 'splash',
  history: [],

  navigate(screenId) {
    const oldEl = document.getElementById('screen-' + this.currentScreen);
    const newEl = document.getElementById('screen-' + screenId);
    if (!newEl) { console.warn('Screen not found:', screenId); return; }
    if (oldEl && this.currentScreen !== 'splash') {
      oldEl.classList.add('prev');
      setTimeout(() => oldEl.classList.remove('active', 'prev'), 300);
    } else if (oldEl) {
      oldEl.classList.remove('active');
    }
    newEl.classList.add('active');
    if (this.currentScreen !== 'splash') this.history.push(this.currentScreen);
    this.currentScreen = screenId;
    // Scroll new screen to top
    const scroll = newEl.querySelector('.scroll-area');
    if (scroll) scroll.scrollTop = 0;
  },

  goBack() {
    const prev = this.history.pop();
    if (prev) this.navigate(prev);
  },

  showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('visible'), duration);
  },

  showDialog(title, body, actions) {
    document.querySelector('.dialog-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body">${body}</div>
        <div class="dialog-actions">
          <button class="btn btn-outline btn-md flex-1" id="dlg-cancel">Cancel</button>
          ${actions.map((a, i) => `<button class="btn ${a.class} btn-md flex-1" id="dlg-act-${i}">${a.label}</button>`).join('')}
        </div>
      </div>`;
    document.getElementById('app').appendChild(overlay);
    overlay.querySelector('#dlg-cancel').addEventListener('click', () => overlay.remove());
    actions.forEach((a, i) => overlay.querySelector('#dlg-act-' + i).addEventListener('click', () => { overlay.remove(); a.action(); }));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  },

  // Replaces prompt() — shows a dialog with a text input
  showInputDialog(title, subtitle, placeholder, callback) {
    document.querySelector('.dialog-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body" style="margin-bottom:12px">${subtitle}</div>
        <input type="text" class="field-input" id="dlg-input" placeholder="${placeholder}" style="margin-bottom:16px">
        <div class="dialog-actions">
          <button class="btn btn-outline btn-md flex-1" id="dlg-cancel">Cancel</button>
          <button class="btn btn-primary btn-md flex-1" id="dlg-ok">OK</button>
        </div>
      </div>`;
    document.getElementById('app').appendChild(overlay);
    const input = overlay.querySelector('#dlg-input');
    input.focus();
    const confirm = () => { const v = input.value.trim(); overlay.remove(); if (v) callback(v); };
    overlay.querySelector('#dlg-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dlg-ok').addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  },

  initNavigation() {
    // Worker bottom nav
    document.querySelectorAll('#worker-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen; if (!screen) return;
        document.querySelectorAll('#worker-nav .nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (screen === 'worker-home')     { App.navigate('worker-home'); Tasks.loadWorkerHome(); }
        else if (screen === 'worker-calendar') { App.navigate('worker-calendar'); Cal.workerYear = new Date().getFullYear(); Cal.workerMonth = new Date().getMonth(); Cal.renderWorkerCalendar(); }
        else if (screen === 'worker-history') { App.navigate('worker-history'); Tasks.loadHistory(); }
        else if (screen === 'worker-settings') { App.navigate('worker-settings'); Tasks.renderWorkerSettings(); }
      });
    });

    // Other screens' nav items
    document.querySelectorAll('.screen:not(#screen-worker-home) .nav-item[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.screen;
        if (s === 'worker-home')     { App.navigate('worker-home'); Tasks.loadWorkerHome(); }
        else if (s === 'worker-calendar') { App.navigate('worker-calendar'); Cal.renderWorkerCalendar(); }
        else if (s === 'worker-history') { App.navigate('worker-history'); Tasks.loadHistory(); }
        else if (s === 'worker-settings') { App.navigate('worker-settings'); Tasks.renderWorkerSettings(); }
      });
    });

    // Back buttons
    document.getElementById('task-back').addEventListener('click', () => { App.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('wcal-back').addEventListener('click', () => { App.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('whist-back').addEventListener('click', () => { App.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('wset-back').addEventListener('click', () => { App.navigate('worker-home'); Tasks.loadWorkerHome(); });
    document.getElementById('add-worker-back').addEventListener('click', () => App.navigate('admin-home'));
    document.getElementById('add-tpl-back').addEventListener('click', () => App.navigate('admin-home'));
    document.getElementById('assign-back').addEventListener('click', () => App.navigate('admin-home'));

    // Calendar prev/next
    document.getElementById('wcal-prev').addEventListener('click', () => {
      Cal.workerMonth--; if (Cal.workerMonth < 0) { Cal.workerMonth = 11; Cal.workerYear--; }
      Cal.renderWorkerCalendar();
    });
    document.getElementById('wcal-next').addEventListener('click', () => {
      Cal.workerMonth++; if (Cal.workerMonth > 11) { Cal.workerMonth = 0; Cal.workerYear++; }
      Cal.renderWorkerCalendar();
    });

    // Task filters
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => Tasks.applyFilter(btn.dataset.filter));
    });
  },

  async init() {
    try {
      await DB.open();
      await seedData();
    } catch (e) {
      console.error('DB init error:', e);
    }
    Sync.init();
    initPinPad();
    this.initNavigation();

    // Try auto-login from last session
    const user = await Auth.autoLogin();
    if (user) {
      setTimeout(() => {
        if (user.role === 'admin' || user.role === 'supervisor') {
          App.navigate('admin-home');
          Admin.init();
        } else {
          App.navigate('worker-home');
          Tasks.loadWorkerHome();
        }
      }, 800);
    } else {
      setTimeout(() => App.navigate('login'), 800);
    }

    // PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=3')
        .then(r => console.log('SW registered:', r.scope))
        .catch(e => console.log('SW:', e));
    }
  },
};

// Expose globally
window.App   = App;
window.Admin = Admin;
window.Cal   = Cal;
window.Tasks = Tasks;
window.Auth  = Auth;

document.addEventListener('DOMContentLoaded', () => App.init());

// Force reload when a new service worker takes over (clears bad cache in installed PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
