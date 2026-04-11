'use strict';
// ── Admin ─────────────────────────────────────────────────────────────────────
const Admin = {
  currentTab: 'dashboard',
  assignState: { step: 1, templates: [], workers: [], frequency: 'Daily', startDate: '', endDate: '', dueTime: '08:00' },

  init() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.renderTab(tab.dataset.tab);
      });
    });
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
      Auth.logout();
      App.navigate('login');
    });
    this.renderTab('dashboard');
  },

  async renderTab(tab) {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink3)">Loading...</div>';
    switch (tab) {
      case 'dashboard': await this.renderDashboard(); break;
      case 'workers': await this.renderWorkers(); break;
      case 'templates': await this.renderTemplates(); break;
      case 'assign': this.startAssignWizard(); break;
      case 'calendar': await this.renderAdminCalendar(); break;
    }
  },

  async renderDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const allTasks = await DB.getAll('tasks');
    const todayTasks = allTasks.filter(t => t.date === today);
    const total = todayTasks.length;
    const done = todayTasks.filter(t => t.status === 'completed').length;
    const pending = todayTasks.filter(t => t.status === 'pending').length;
    const missed = todayTasks.filter(t => t.status === 'missed').length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;

    const workers = await DB.getAll('workers');
    const activeWorkers = workers.filter(w => w.role !== 'admin' && w.isActive);

    // Per-worker stats
    const workerStats = activeWorkers.map(w => {
      const wTasks = todayTasks.filter(t => t.workerId === w.id);
      return { ...w, total: wTasks.length, done: wTasks.filter(t => t.status === 'completed').length };
    }).filter(w => w.total > 0);

    const content = document.getElementById('admin-content');
    content.innerHTML = `
      <div style="font-size:12px;font-weight:500;color:var(--ink3);margin-bottom:10px">Today · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number" style="color:var(--blue)">${total}</div><div class="stat-label">Assigned</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--emerald)">${done}</div><div class="stat-label">Completed</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--amber)">${pending}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--rose)">${missed}</div><div class="stat-label">Missed</div></div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">Completion Rate</div>
        <div class="progress-big-num" style="color:var(--emerald)">${pct}%</div>
        <div class="prog-bar-full"><div class="prog-bar-fill" style="background:var(--emerald);width:${pct}%"></div></div>
        <div class="prog-foot"><span>${done} done</span><span>${total - done} remaining</span></div>
      </div>
      <div class="section-header">Worker Performance</div>
      <div class="rounded" style="background:var(--surface)">
        ${workerStats.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--ink3)">No tasks assigned today</div>' :
          workerStats.map(w => {
            const pct = w.total > 0 ? Math.round(w.done / w.total * 100) : 0;
            return `<div class="perf-row">
              <div class="worker-avatar" style="width:38px;height:38px;background:${w.avatarBg};color:${w.avatarColor}">${w.initials}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">${w.name}</div>
                <div class="perf-bar"><div class="perf-fill" style="background:${pct >= 80 ? 'var(--emerald)' : pct >= 50 ? 'var(--amber)' : 'var(--rose)'};width:${pct}%"></div></div>
              </div>
              <div style="font-size:13px;font-weight:700;color:${pct >= 80 ? 'var(--emerald)' : pct >= 50 ? 'var(--amber)' : 'var(--rose)'}">${w.done}/${w.total}</div>
            </div>`;
          }).join('')}
      </div>
    `;
  },

  async renderWorkers() {
    const workers = await DB.getAll('workers');
    const active = workers.filter(w => w.role !== 'admin');
    const content = document.getElementById('admin-content');
    content.innerHTML = `
      <button class="btn btn-primary btn-sm" id="add-worker-btn" style="margin-bottom:12px">+ Add Worker</button>
      <div class="rounded" style="background:var(--surface)">
        ${active.map(w => `
          <div class="worker-list-item">
            <div class="worker-avatar" style="background:${w.avatarBg};color:${w.avatarColor}">${w.initials}</div>
            <div class="worker-info">
              <div class="worker-name">${w.name}</div>
              <div class="worker-meta">${w.category} · ${w.mobile}</div>
            </div>
            <div class="worker-actions">
              <span class="badge ${w.isActive ? 'badge-done' : 'badge-gray'}">${w.isActive ? 'Active' : 'Inactive'}</span>
              <button class="btn btn-sm btn-ghost" data-worker-id="${w.id}" onclick="Admin.editWorker('${w.id}')">⋯</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('add-worker-btn').addEventListener('click', () => this.showAddWorkerScreen());
  },

  showAddWorkerScreen() {
    const body = document.getElementById('add-worker-body');
    const avColors = [['#EBF2FF','#1B6EF3'],['#ECFDF5','#059669'],['#FFF1F2','#E11D48'],['#F5F3FF','#7C3AED'],['#FFFBEB','#D97706']];
    const colors = avColors[Math.floor(Math.random() * avColors.length)];
    body.innerHTML = `
      <div class="card">
        <div class="field"><label class="field-label">Full Name *</label><input type="text" class="field-input" id="aw-name" placeholder="Worker full name"></div>
        <div class="field"><label class="field-label">Mobile Number *</label><input type="tel" class="field-input" id="aw-mobile" placeholder="10-digit mobile" maxlength="10" inputmode="numeric"></div>
        <div class="field"><label class="field-label">Category *</label>
          <select class="field-input" id="aw-cat">
            <option value="Plumbing">Plumbing</option>
            <option value="Electrical">Electrical</option>
            <option value="Housekeeping">Housekeeping</option>
            <option value="Security">Security</option>
          </select>
        </div>
        <div class="field"><label class="field-label">Role</label>
          <select class="field-input" id="aw-role">
            <option value="worker">Worker</option>
            <option value="supervisor">Supervisor</option>
          </select>
        </div>
        <div class="field"><label class="field-label">Default PIN * (4–6 digits)</label><input type="password" class="field-input" id="aw-pin" maxlength="6" inputmode="numeric" placeholder="••••"></div>
        <div id="aw-error" class="error-msg"></div>
        <button class="btn btn-success btn-full btn-lg" id="aw-save-btn">Create Worker</button>
      </div>
    `;
    App.navigate('admin-add-worker');
    document.getElementById('aw-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('aw-name').value.trim();
      const mobile = document.getElementById('aw-mobile').value.trim();
      const cat = document.getElementById('aw-cat').value;
      const role = document.getElementById('aw-role').value;
      const pin = document.getElementById('aw-pin').value.trim();
      const err = document.getElementById('aw-error');
      err.textContent = '';
      if (!name) { err.textContent = 'Name is required'; return; }
      if (!/^\d{10}$/.test(mobile)) { err.textContent = 'Enter valid 10-digit mobile'; return; }
      if (pin.length < 4) { err.textContent = 'PIN must be at least 4 digits'; return; }
      const all = await DB.getAll('workers');
      if (all.find(w => w.mobile === mobile)) { err.textContent = 'Mobile number already exists'; return; }
      const id = 'WK-' + String(all.length + 1).padStart(4, '0');
      const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
      await DB.put('workers', {
        id, name, mobile, pinHash: pin, role, category: cat, isActive: true,
        communityId: 'COMM-001', initials,
        avatarBg: colors[0], avatarColor: colors[1],
        createdAt: new Date().toISOString(), isFirstLogin: true,
      });
      App.showToast(`${name} added! Default PIN: ${pin}`);
      App.navigate('admin-home');
      this.renderTab('workers');
      this.currentTab = 'workers';
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'workers'));
    });
  },

  async editWorker(workerId) {
    const w = await DB.get('workers', workerId);
    if (!w) return;
    App.showDialog(
      `${w.name}`,
      `Mobile: ${w.mobile} | Category: ${w.category}`,
      [
        { label: w.isActive ? 'Deactivate' : 'Activate', class: 'btn-warn', action: async () => {
          w.isActive = !w.isActive;
          await DB.put('workers', w);
          this.renderTab('workers');
          App.showToast(`${w.name} ${w.isActive ? 'activated' : 'deactivated'}`);
        }},
        { label: 'Reset PIN', class: 'btn-outline', action: async () => {
          const newPin = prompt('Enter new PIN for ' + w.name + ':');
          if (newPin && newPin.length >= 4) {
            await Auth.resetPin(workerId, newPin);
            App.showToast('PIN reset to: ' + newPin);
          }
        }},
      ]
    );
  },

  async renderTemplates() {
    const templates = await DB.getAll('templates');
    const active = templates.filter(t => !t.isDeleted);
    const cats = ['Plumbing', 'Electrical', 'Housekeeping', 'Security'];
    const content = document.getElementById('admin-content');

    let html = `<button class="btn btn-primary btn-sm" id="add-tpl-btn" style="margin-bottom:12px">+ New Template</button>`;
    cats.forEach(cat => {
      const catTpls = active.filter(t => t.category === cat);
      if (catTpls.length === 0) return;
      html += `<div class="section-header">${cat}</div>`;
      catTpls.forEach(t => {
        html += `<div class="tpl-card" style="border-left-color:${t.borderColor}">
          <div class="tpl-name">${t.icon} ${t.name}</div>
          <div class="tpl-meta">${t.fields.length} fields · Active</div>
          <div class="tpl-actions">
            <button class="btn btn-sm btn-ghost" onclick="Admin.editTemplate('${t.id}')">Edit</button>
            <button class="btn btn-sm btn-ghost" onclick="Admin.duplicateTemplate('${t.id}')">Duplicate</button>
            <button class="btn btn-sm btn-danger" onclick="Admin.deleteTemplate('${t.id}')">Delete</button>
          </div>
        </div>`;
      });
    });

    content.innerHTML = html;
    document.getElementById('add-tpl-btn').addEventListener('click', () => this.showTemplateEditor(null));
  },

  showTemplateEditor(templateId) {
    const isEdit = !!templateId;
    document.getElementById('add-tpl-title').textContent = isEdit ? 'Edit Template' : 'New Template';
    const body = document.getElementById('add-tpl-body');
    let fields = [];
    let tpl = null;

    const renderFieldsList = () => {
      const fl = document.getElementById('fields-list');
      if (!fl) return;
      fl.innerHTML = fields.map((f, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${f.label || 'Untitled field'}</div>
            <div style="font-size:11px;color:var(--ink3)">${f.type}</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="Admin.removeField(${i})">✕</button>
        </div>
      `).join('') || '<div style="color:var(--ink3);font-size:13px;text-align:center;padding:12px">No fields yet</div>';
    };

    body.innerHTML = `
      <div class="card">
        <div class="field"><label class="field-label">Template Name *</label><input type="text" class="field-input" id="tpl-name" placeholder="e.g. Pump Room Check"></div>
        <div class="field"><label class="field-label">Category *</label>
          <select class="field-input" id="tpl-cat">
            <option value="Plumbing">Plumbing</option>
            <option value="Electrical">Electrical</option>
            <option value="Housekeeping">Housekeeping</option>
            <option value="Security">Security</option>
          </select>
        </div>
        <div class="field"><label class="field-label">Icon (emoji)</label>
          <input type="text" class="field-input" id="tpl-icon" placeholder="e.g. 🔧" maxlength="4"></div>
      </div>

      <div class="section-header">Form Fields</div>
      <div class="card">
        <div id="fields-list"></div>
        <div style="margin-top:12px">
          <div class="field-label" style="margin-bottom:8px">Add field type:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <button class="chip" onclick="Admin.addField('checkbox')">☑ Checkbox</button>
            <button class="chip" onclick="Admin.addField('text')">📝 Text</button>
            <button class="chip" onclick="Admin.addField('number')">🔢 Number</button>
            <button class="chip" onclick="Admin.addField('dropdown')">▼ Dropdown</button>
            <button class="chip" onclick="Admin.addField('image')">📷 Photo</button>
            <button class="chip" onclick="Admin.addField('date')">📅 Date</button>
          </div>
        </div>
      </div>

      <div id="tpl-error" class="error-msg"></div>
      <button class="btn btn-success btn-full btn-lg" id="save-tpl-btn">Save Template</button>
    `;

    this._tempFields = fields;
    this._renderFieldsList = renderFieldsList;
    renderFieldsList();
    App.navigate('admin-add-template');

    document.getElementById('save-tpl-btn').addEventListener('click', async () => {
      const name = document.getElementById('tpl-name').value.trim();
      const cat = document.getElementById('tpl-cat').value;
      const icon = document.getElementById('tpl-icon').value.trim() || '📋';
      const err = document.getElementById('tpl-error');
      if (!name) { err.textContent = 'Template name is required'; return; }
      if (this._tempFields.length === 0) { err.textContent = 'Add at least one field'; return; }
      const borderColors = { Plumbing: '#1B6EF3', Electrical: '#D97706', Housekeeping: '#059669', Security: '#7C3AED' };
      const id = templateId || ('TPL-' + Date.now());
      await DB.put('templates', { id, name, category: cat, icon, borderColor: borderColors[cat], fields: [...this._tempFields], isDeleted: false, createdAt: new Date().toISOString() });
      App.showToast('Template saved!');
      App.navigate('admin-home');
      this.renderTab('templates');
      this.currentTab = 'templates';
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'templates'));
    });
  },

  addField(type) {
    const label = prompt(`Field label for ${type}:`) || type + ' field';
    const field = { id: 'f' + Date.now(), type, label, required: false };
    if (type === 'dropdown') {
      const opts = prompt('Enter options separated by comma:') || 'Option 1,Option 2';
      field.options = opts.split(',').map(o => o.trim());
    }
    if (type === 'text' || type === 'number') {
      field.placeholder = prompt('Placeholder text (optional):') || '';
    }
    this._tempFields.push(field);
    this._renderFieldsList && this._renderFieldsList();
  },

  removeField(index) {
    this._tempFields.splice(index, 1);
    this._renderFieldsList && this._renderFieldsList();
  },

  async editTemplate(id) {
    this.showTemplateEditor(id);
  },

  async duplicateTemplate(id) {
    const t = await DB.get('templates', id);
    if (!t) return;
    const copy = { ...t, id: 'TPL-' + Date.now(), name: t.name + ' (Copy)', createdAt: new Date().toISOString() };
    await DB.put('templates', copy);
    App.showToast('Template duplicated!');
    this.renderTab('templates');
  },

  async deleteTemplate(id) {
    App.showDialog('Delete Template?', 'This template will no longer be available for new assignments.', [
      { label: 'Delete', class: 'btn-danger', action: async () => {
        const t = await DB.get('templates', id);
        if (t) { t.isDeleted = true; await DB.put('templates', t); }
        App.showToast('Template deleted');
        this.renderTab('templates');
      }},
    ]);
  },

  startAssignWizard() {
    this.assignState = { step: 1, templates: [], workers: [], frequency: 'Daily', startDate: new Date().toISOString().split('T')[0], endDate: '', dueTime: '08:00' };
    App.navigate('admin-assign');
    this.renderAssignStep(1);
  },

  renderAssignStep(step) {
    this.assignState.step = step;
    document.getElementById('assign-step-label').textContent = `Step ${step}/4`;
    const stepsUI = document.getElementById('assign-steps-ui');
    stepsUI.innerHTML = [1,2,3,4].map((s, i) => `
      ${i > 0 ? `<div class="step-line ${step > s - 1 ? 'done' : ''}"></div>` : ''}
      <div class="step-dot ${step > s ? 'done' : step === s ? 'current' : 'upcoming'}">${step > s ? '✓' : s}</div>
    `).join('');

    const content = document.getElementById('assign-content');
    const footer = document.getElementById('assign-footer');

    if (step === 1) this.renderAssignStep1(content, footer);
    else if (step === 2) this.renderAssignStep2(content, footer);
    else if (step === 3) this.renderAssignStep3(content, footer);
    else if (step === 4) this.renderAssignStep4(content, footer);
  },

  async renderAssignStep1(content, footer) {
    const templates = (await DB.getAll('templates')).filter(t => !t.isDeleted);
    const sel = this.assignState.templates;
    content.innerHTML = `
      <div style="font-size:15px;font-weight:600;letter-spacing:-.02em;margin-bottom:4px">Select Templates</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">Choose one or more task templates</div>
      <div class="rounded" style="background:var(--surface)">
        ${templates.map(t => `
          <div class="selectable ${sel.includes(t.id) ? 'selected' : ''}" data-tpl-id="${t.id}">
            <input type="checkbox" ${sel.includes(t.id) ? 'checked' : ''}>
            <div style="font-size:18px">${t.icon}</div>
            <div>
              <div style="font-size:13px;font-weight:600">${t.name}</div>
              <div style="font-size:11px;color:var(--ink3)">${t.category} · ${t.fields.length} fields</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    footer.innerHTML = `
      <div style="font-size:12px;color:var(--ink3);margin-bottom:8px" id="tpl-sel-count">${sel.length} selected</div>
      <button class="btn btn-primary btn-full btn-lg" id="as-next1">Next: Select Workers →</button>
    `;
    content.querySelectorAll('.selectable').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.tplId;
        const chk = el.querySelector('input');
        chk.checked = !chk.checked;
        if (chk.checked) { if (!sel.includes(id)) sel.push(id); el.classList.add('selected'); }
        else { const i = sel.indexOf(id); if (i > -1) sel.splice(i, 1); el.classList.remove('selected'); }
        document.getElementById('tpl-sel-count').textContent = sel.length + ' selected';
      });
    });
    document.getElementById('as-next1').addEventListener('click', () => {
      if (sel.length === 0) { App.showToast('Select at least one template'); return; }
      this.renderAssignStep(2);
    });
  },

  async renderAssignStep2(content, footer) {
    const workers = (await DB.getAll('workers')).filter(w => w.role !== 'admin' && w.isActive);
    const sel = this.assignState.workers;
    content.innerHTML = `
      <div style="font-size:15px;font-weight:600;letter-spacing:-.02em;margin-bottom:4px">Select Workers</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:10px">Assign to individuals or teams</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-ghost btn-sm" onclick="Admin.selectAllWorkers()">All Workers</button>
        <button class="btn btn-ghost btn-sm" onclick="Admin.selectWorkerGroup('Plumbing')">🚰 Plumbing</button>
        <button class="btn btn-ghost btn-sm" onclick="Admin.selectWorkerGroup('Electrical')">⚡ Electrical</button>
        <button class="btn btn-ghost btn-sm" onclick="Admin.selectWorkerGroup('Housekeeping')">🧹 Housekeeping</button>
        <button class="btn btn-ghost btn-sm" onclick="Admin.selectWorkerGroup('Security')">🔒 Security</button>
      </div>
      <div class="rounded" style="background:var(--surface)" id="worker-sel-list">
        ${workers.map(w => `
          <div class="selectable ${sel.includes(w.id) ? 'selected' : ''}" data-worker-id="${w.id}">
            <input type="checkbox" ${sel.includes(w.id) ? 'checked' : ''}>
            <div class="worker-avatar" style="width:34px;height:34px;background:${w.avatarBg};color:${w.avatarColor};font-size:12px">${w.initials}</div>
            <div>
              <div style="font-size:13px;font-weight:600">${w.name}</div>
              <div style="font-size:11px;color:var(--ink3)">${w.category}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    this._assignWorkers = workers;
    footer.innerHTML = `
      <div style="font-size:12px;color:var(--ink3);margin-bottom:8px" id="wk-sel-count">${sel.length} workers selected</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-md" onclick="Admin.renderAssignStep(1)">← Back</button>
        <button class="btn btn-primary btn-md flex-1" id="as-next2">Next: Schedule →</button>
      </div>
    `;
    content.querySelectorAll('.selectable').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.workerId;
        const chk = el.querySelector('input');
        chk.checked = !chk.checked;
        if (chk.checked) { if (!sel.includes(id)) sel.push(id); el.classList.add('selected'); }
        else { const i = sel.indexOf(id); if (i > -1) sel.splice(i, 1); el.classList.remove('selected'); }
        document.getElementById('wk-sel-count').textContent = sel.length + ' workers selected';
      });
    });
    document.getElementById('as-next2').addEventListener('click', () => {
      if (sel.length === 0) { App.showToast('Select at least one worker'); return; }
      this.renderAssignStep(3);
    });
  },

  selectAllWorkers() {
    if (!this._assignWorkers) return;
    this.assignState.workers = this._assignWorkers.map(w => w.id);
    document.querySelectorAll('#worker-sel-list .selectable').forEach(el => {
      el.classList.add('selected'); el.querySelector('input').checked = true;
    });
    const c = document.getElementById('wk-sel-count');
    if (c) c.textContent = this.assignState.workers.length + ' workers selected';
  },

  selectWorkerGroup(cat) {
    if (!this._assignWorkers) return;
    const grp = this._assignWorkers.filter(w => w.category === cat).map(w => w.id);
    grp.forEach(id => { if (!this.assignState.workers.includes(id)) this.assignState.workers.push(id); });
    document.querySelectorAll('#worker-sel-list .selectable').forEach(el => {
      if (grp.includes(el.dataset.workerId)) { el.classList.add('selected'); el.querySelector('input').checked = true; }
    });
    const c = document.getElementById('wk-sel-count');
    if (c) c.textContent = this.assignState.workers.length + ' workers selected';
  },

  renderAssignStep3(content, footer) {
    const s = this.assignState;
    content.innerHTML = `
      <div style="font-size:15px;font-weight:600;letter-spacing:-.02em;margin-bottom:4px">Set Schedule</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">Choose when tasks should repeat</div>
      <div class="field"><label class="field-label">Frequency</label>
        <div class="freq-grid">
          ${['Daily','Weekly','Monthly','Ad-hoc','Once'].map(f =>
            `<button class="freq-btn ${s.frequency === f ? 'active' : ''}" onclick="Admin.setFreq('${f}',this)">${f}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field"><label class="field-label">Start Date *</label>
        <input type="date" class="field-input" id="as-start" value="${s.startDate}"></div>
      <div class="field" id="end-date-field"><label class="field-label">End Date (optional)</label>
        <input type="date" class="field-input" id="as-end" value="${s.endDate}"></div>
      <div class="field"><label class="field-label">Due Time</label>
        <input type="time" class="field-input" id="as-time" value="${s.dueTime}"></div>
      <div class="field"><label class="field-label">Priority</label>
        <select class="field-input" id="as-priority"><option>Normal</option><option>High</option><option>Urgent</option></select>
      </div>
    `;
    footer.innerHTML = `
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-md" onclick="Admin.renderAssignStep(2)">← Back</button>
        <button class="btn btn-primary btn-md flex-1" id="as-next3">Review →</button>
      </div>
    `;
    document.getElementById('as-start').addEventListener('change', e => s.startDate = e.target.value);
    document.getElementById('as-end').addEventListener('change', e => s.endDate = e.target.value);
    document.getElementById('as-time').addEventListener('change', e => s.dueTime = e.target.value);
    document.getElementById('as-next3').addEventListener('click', () => {
      s.startDate = document.getElementById('as-start').value;
      s.endDate = document.getElementById('as-end').value;
      s.dueTime = document.getElementById('as-time').value;
      if (!s.startDate) { App.showToast('Start date is required'); return; }
      this.renderAssignStep(4);
    });
  },

  setFreq(freq, btn) {
    this.assignState.frequency = freq;
    document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  },

  async renderAssignStep4(content, footer) {
    const s = this.assignState;
    const templates = await Promise.all(s.templates.map(id => DB.get('templates', id)));
    const workers = await Promise.all(s.workers.map(id => DB.get('workers', id)));
    const days = s.startDate && s.endDate ? Math.ceil((new Date(s.endDate) - new Date(s.startDate)) / 86400000) + 1 : 1;
    const total = s.templates.length * s.workers.length * (s.frequency === 'Daily' ? days : 1);

    content.innerHTML = `
      <div style="font-size:15px;font-weight:600;letter-spacing:-.02em;margin-bottom:4px">Review & Confirm</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:14px">Check everything before creating task instances</div>
      <div class="card" style="background:#ECFDF5;border-color:#6EE7B7">
        <div style="font-size:12px;font-weight:600;color:var(--emerald);margin-bottom:12px">Assignment Summary</div>
        <div class="review-row"><span class="review-label">Templates</span><span class="review-value">${s.templates.length} selected</span></div>
        <div class="review-row"><span class="review-label">Workers</span><span class="review-value">${s.workers.length} workers</span></div>
        <div class="review-row"><span class="review-label">Frequency</span><span class="review-value">${s.frequency}</span></div>
        <div class="review-row"><span class="review-label">Start Date</span><span class="review-value">${s.startDate}</span></div>
        <div class="review-row"><span class="review-label">End Date</span><span class="review-value">${s.endDate || 'Ongoing'}</span></div>
        <div class="review-row"><span class="review-label">Due Time</span><span class="review-value">${s.dueTime}</span></div>
        <div class="review-row" style="border-top:2px solid rgba(5,150,105,.2);padding-top:12px;margin-top:4px">
          <span style="font-weight:600">Total task instances</span>
          <span class="review-total">${total}</span>
        </div>
      </div>
      <div class="card">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">Templates</div>
        ${templates.map(t => `<div style="font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)">${t ? t.icon + ' ' + t.name : 'Unknown'}</div>`).join('')}
      </div>
      <div class="card">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">Workers</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${workers.map(w => w ? `<span class="badge badge-blue">${w.name}</span>` : '').join('')}
        </div>
      </div>
    `;
    footer.innerHTML = `
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-md" onclick="Admin.renderAssignStep(3)">← Back</button>
        <button class="btn btn-success btn-md flex-1" id="as-create">Create ${total} Tasks 🚀</button>
      </div>
    `;
    document.getElementById('as-create').addEventListener('click', () => this.createTaskInstances(templates, workers, days, total));
  },

  async createTaskInstances(templates, workers, days, total) {
    const s = this.assignState;
    const btn = document.getElementById('as-create');
    btn.textContent = 'Creating...';
    btn.disabled = true;
    let created = 0;
    const start = new Date(s.startDate);
    const iterations = s.frequency === 'Daily' ? days : 1;
    for (let d = 0; d < iterations; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      for (const tpl of templates) {
        if (!tpl) continue;
        for (const worker of workers) {
          if (!worker) continue;
          const taskId = `${worker.id}-${tpl.id}-${dateStr}`;
          const existing = await DB.get('tasks', taskId);
          if (existing) continue;
          await DB.put('tasks', {
            id: taskId, workerId: worker.id, templateId: tpl.id,
            templateName: tpl.name, templateIcon: tpl.icon, category: tpl.category,
            date: dateStr, dueTime: s.dueTime, status: 'pending',
            communityId: worker.communityId, assignedAt: new Date().toISOString(),
          });
          created++;
        }
      }
    }
    App.showToast(`${created} tasks created successfully!`);
    App.navigate('admin-home');
    this.renderTab('dashboard');
    this.currentTab = 'dashboard';
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'dashboard'));
  },

  async renderAdminCalendar() {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <select class="field-input" id="ac-worker-filter" style="flex:1;font-size:12px;padding:8px 10px">
          <option value="">All Workers</option>
        </select>
        <select class="field-input" id="ac-cat-filter" style="flex:1;font-size:12px;padding:8px 10px">
          <option value="">All Categories</option>
          <option>Plumbing</option><option>Electrical</option><option>Housekeeping</option><option>Security</option>
        </select>
      </div>
      <div class="card" id="admin-cal-card"></div>
      <div class="admin-cal-legend">
        <span><span class="legend-dot" style="background:var(--emerald)"></span>All done</span>
        <span><span class="legend-dot" style="background:var(--amber)"></span>Pending</span>
        <span><span class="legend-dot" style="background:var(--rose)"></span>Missed</span>
      </div>
      <div class="card" id="admin-drill-down" style="display:none"></div>
    `;
    const workers = (await DB.getAll('workers')).filter(w => w.role !== 'admin');
    const wSel = document.getElementById('ac-worker-filter');
    workers.forEach(w => { const o = document.createElement('option'); o.value = w.id; o.textContent = w.name; wSel.appendChild(o); });

    const renderCal = () => Cal.renderAdminCalendar(document.getElementById('admin-cal-card'), wSel.value, document.getElementById('ac-cat-filter').value);
    renderCal();
    wSel.addEventListener('change', renderCal);
    document.getElementById('ac-cat-filter').addEventListener('change', renderCal);
  },
};
