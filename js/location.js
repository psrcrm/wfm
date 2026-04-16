// ─────────────────────────────────────────────────────────────────────────────
// ApartmentCare — Location Module (v2)
// Handles: QR scan, manual picker, check-in recording
// Depends on: db.js (window.DB)
// ─────────────────────────────────────────────────────────────────────────────

window.LocationModule = (() => {

  // ── Internal state ──────────────────────────────────────────────────────────
  let _scanStream    = null;   // active camera MediaStream
  let _onConfirm     = null;   // callback(locationId, method)
  let _pendingTaskId = null;

  // ── QR scan via jsQR (loaded from CDN in index.html) ───────────────────────
  function _startCamera(videoEl, canvasEl, onDecode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('Camera not supported on this device'));
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        _scanStream = stream;
        videoEl.srcObject = stream;
        videoEl.setAttribute('playsinline', true);
        videoEl.play();

        const tick = () => {
          if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            canvasEl.height = videoEl.videoHeight;
            canvasEl.width  = videoEl.videoWidth;
            const ctx = canvasEl.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
            const img  = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            const code = window.jsQR && jsQR(img.data, img.width, img.height,
                           { inversionAttempts: 'dontInvert' });
            if (code && code.data) {
              onDecode(code.data);
              return;
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
  }

  function _stopCamera() {
    if (_scanStream) {
      _scanStream.getTracks().forEach(t => t.stop());
      _scanStream = null;
    }
  }

  // ── Build the location confirm screen HTML ──────────────────────────────────
  function _buildScreen() {
    return `
    <div id="screen-location-confirm" class="screen">
      <div class="topbar">
        <button class="back-btn" id="loc-back">←</button>
        <div class="topbar-title">Confirm location</div>
      </div>

      <div class="scroll-area" style="padding:12px 16px;">

        <!-- Task info bar -->
        <div id="loc-task-info" class="loc-task-bar"></div>

        <!-- QR scan area -->
        <div class="loc-scan-card" id="loc-scan-card">
          <div class="loc-scan-label">Scan QR sticker at this location</div>
          <div class="loc-video-wrap" id="loc-video-wrap">
            <video id="loc-video" playsinline style="width:100%;border-radius:8px;display:none;"></video>
            <canvas id="loc-canvas" style="display:none;"></canvas>
            <div class="loc-scan-placeholder" id="loc-scan-placeholder">
              <div class="loc-scan-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="4"  y="4"  width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
                  <rect x="28" y="4"  width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
                  <rect x="4"  y="28" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
                  <rect x="28" y="28" width="6"  height="6"  rx="1" fill="currentColor"/>
                  <rect x="38" y="28" width="6"  height="6"  rx="1" fill="currentColor"/>
                  <rect x="28" y="38" width="6"  height="6"  rx="1" fill="currentColor"/>
                  <rect x="38" y="38" width="6"  height="6"  rx="1" fill="currentColor"/>
                </svg>
              </div>
            </div>
          </div>
          <button class="btn btn-secondary btn-full" id="loc-scan-btn">
            Open camera to scan
          </button>
          <div id="loc-scan-status" class="loc-scan-status"></div>
        </div>

        <!-- Divider -->
        <div class="loc-divider"><span>or pick manually</span></div>

        <!-- Manual picker -->
        <div class="card" style="padding:14px;">
          <div class="field" style="margin-bottom:10px;">
            <label class="field-label">Block / area</label>
            <select id="loc-block-select" class="field-input">
              <option value="">Select block...</option>
            </select>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label class="field-label">Flat / unit</label>
            <select id="loc-unit-select" class="field-input" disabled>
              <option value="">Select unit...</option>
            </select>
          </div>
        </div>

        <!-- Confirmed pill -->
        <div id="loc-confirmed-bar" class="loc-confirmed-bar" style="display:none;">
          <div class="loc-confirmed-icon">✓</div>
          <div>
            <div class="loc-confirmed-key" id="loc-confirmed-key"></div>
            <div class="loc-confirmed-name" id="loc-confirmed-name"></div>
            <div class="loc-confirmed-time" id="loc-confirmed-time"></div>
          </div>
        </div>

        <!-- CTA -->
        <button id="loc-start-btn" class="btn btn-primary btn-full btn-lg"
          style="margin-top:16px;display:none;">
          Start task
        </button>

        <!-- Skip link -->
        <div style="text-align:center;margin-top:12px;">
          <button id="loc-skip-btn" class="btn btn-ghost"
            style="font-size:12px;color:var(--text-muted);">
            Skip location (not recommended)
          </button>
        </div>

      </div>
    </div>`;
  }

  // ── Inject screen into DOM (once) ───────────────────────────────────────────
  function _injectScreen() {
    if (document.getElementById('screen-location-confirm')) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _buildScreen();
    document.getElementById('app').appendChild(tmp.firstElementChild);
    _bindEvents();
  }

  // ── Populate block + unit selects from DB ───────────────────────────────────
  async function _populatePicker() {
    const all = await DB.locations.getAll();

    const blockSel = document.getElementById('loc-block-select');
    const unitSel  = document.getElementById('loc-unit-select');

    // Unique blocks (type=block + type=common bucket)
    const blocks = all.filter(l => l.type === 'block' || (l.type === 'common' && l.block === 'CMN'));
    // De-dup
    const seen = new Set();
    const uniqueBlocks = blocks.filter(b => { if (seen.has(b.block)) return false; seen.add(b.block); return true; });

    blockSel.innerHTML = '<option value="">Select block / area...</option>';
    uniqueBlocks.forEach(b => {
      const opt = document.createElement('option');
      opt.value       = b.block;
      opt.textContent = b.name || `Block ${b.block}`;
      blockSel.appendChild(opt);
    });

    blockSel.onchange = () => {
      const blk = blockSel.value;
      unitSel.innerHTML = '<option value="">Select unit...</option>';
      unitSel.disabled  = !blk;
      if (!blk) return;
      const units = all.filter(l =>
        (l.type === 'unit' || l.type === 'common') && l.block === blk
      );
      units.forEach(u => {
        const opt = document.createElement('option');
        opt.value       = u.id;
        opt.textContent = u.name;
        unitSel.appendChild(opt);
      });
    };

    unitSel.onchange = () => {
      const id = unitSel.value;
      if (!id) return;
      const loc = all.find(l => l.id === id);
      if (loc) _confirmLocation(loc, 'manual_pick');
    };
  }

  // ── Confirm a location (from QR or picker) ──────────────────────────────────
  function _confirmLocation(loc, method) {
    _stopCamera();

    // Show confirmed bar
    const bar  = document.getElementById('loc-confirmed-bar');
    const key  = document.getElementById('loc-confirmed-key');
    const name = document.getElementById('loc-confirmed-name');
    const time = document.getElementById('loc-confirmed-time');

    key.textContent  = loc.id;
    name.textContent = loc.name;
    time.textContent = 'Confirmed ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bar.style.display = 'flex';

    // Show start button
    const startBtn = document.getElementById('loc-start-btn');
    startBtn.style.display = 'block';
    startBtn.onclick = () => {
      _stopCamera();
      if (typeof _onConfirm === 'function') _onConfirm(loc.id, method);
    };

    // Update scan status
    const status = document.getElementById('loc-scan-status');
    if (status) {
      status.textContent = method === 'qr_scan' ? 'QR code scanned successfully' : 'Location selected';
      status.className   = 'loc-scan-status loc-scan-success';
    }
  }

  // ── Handle QR scan result ───────────────────────────────────────────────────
  async function _handleQRResult(data) {
    _stopCamera();
    document.getElementById('loc-video').style.display = 'none';
    document.getElementById('loc-scan-placeholder').style.display = 'flex';

    // data should be a location ID (e.g. PROP-001-A-F2-A201)
    const loc = await DB.locations.get(data);
    if (loc) {
      _confirmLocation(loc, 'qr_scan');
    } else {
      const status = document.getElementById('loc-scan-status');
      status.textContent = 'QR not recognised — please pick manually';
      status.className   = 'loc-scan-status loc-scan-error';
    }
  }

  // ── Bind all screen events ──────────────────────────────────────────────────
  function _bindEvents() {
    // Back button
    document.getElementById('loc-back').onclick = () => {
      _stopCamera();
      window.App && App.showScreen('worker-home');
    };

    // Camera scan button
    document.getElementById('loc-scan-btn').onclick = () => {
      const video  = document.getElementById('loc-video');
      const canvas = document.getElementById('loc-canvas');
      const ph     = document.getElementById('loc-scan-placeholder');
      const btn    = document.getElementById('loc-scan-btn');
      const status = document.getElementById('loc-scan-status');

      if (!window.jsQR) {
        status.textContent = 'QR library not loaded — use manual picker';
        status.className   = 'loc-scan-status loc-scan-error';
        return;
      }

      btn.textContent  = 'Scanning...';
      btn.disabled     = true;
      status.textContent = '';

      _startCamera(video, canvas, _handleQRResult)
        .then(() => {
          video.style.display = 'block';
          ph.style.display    = 'none';
          btn.textContent     = 'Stop camera';
          btn.disabled        = false;
          btn.onclick         = () => {
            _stopCamera();
            video.style.display = 'none';
            ph.style.display    = 'flex';
            btn.textContent     = 'Open camera to scan';
            btn.onclick         = arguments.callee; // rebind
          };
        })
        .catch(err => {
          btn.textContent  = 'Camera unavailable — use picker';
          btn.disabled     = false;
          status.textContent = err.message || 'Could not access camera';
          status.className   = 'loc-scan-status loc-scan-error';
        });
    };

    // Skip button
    document.getElementById('loc-skip-btn').onclick = () => {
      _stopCamera();
      if (typeof _onConfirm === 'function') _onConfirm(null, 'skipped');
    };
  }

  // ── Public: show the confirm screen for a task ──────────────────────────────
  async function show(taskId, task, onConfirm) {
    _injectScreen();
    _pendingTaskId = taskId;
    _onConfirm     = onConfirm;

    // Reset UI state
    document.getElementById('loc-confirmed-bar').style.display = 'none';
    document.getElementById('loc-start-btn').style.display     = 'none';
    document.getElementById('loc-scan-status').textContent     = '';
    document.getElementById('loc-scan-status').className       = 'loc-scan-status';
    document.getElementById('loc-video').style.display         = 'none';
    document.getElementById('loc-scan-placeholder').style.display = 'flex';
    document.getElementById('loc-scan-btn').textContent        = 'Open camera to scan';
    document.getElementById('loc-scan-btn').disabled           = false;
    document.getElementById('loc-block-select').value          = '';
    document.getElementById('loc-unit-select').innerHTML       = '<option value="">Select unit...</option>';
    document.getElementById('loc-unit-select').disabled        = true;

    // Task info bar
    const info = document.getElementById('loc-task-info');
    info.innerHTML = `
      <div class="loc-task-name">${task.name || 'Task'}</div>
      ${task.locationId
        ? `<div class="loc-task-preassigned">Pre-assigned: <span>${task.locationId}</span></div>`
        : ''}
    `;

    // If task already has a location pre-assigned, pre-confirm it
    if (task.locationId) {
      const loc = await DB.locations.get(task.locationId);
      if (loc) _confirmLocation(loc, 'pre_assigned');
    }

    await _populatePicker();

    // Show screen
    window.App && App.showScreen('location-confirm');
  }

  // ── Public: generate QR code SVG string for a location ─────────────────────
  // Used by admin panel to print stickers
  function generateQRDisplay(locationId) {
    // Returns a simple text display — real QR rendering needs qrcode.js
    // which admin panel loads separately
    return `<div class="qr-sticker">
      <div class="qr-code-placeholder" data-location="${locationId}">
        [QR: ${locationId}]
      </div>
      <div class="qr-sticker-label">${locationId}</div>
    </div>`;
  }

  return { show, generateQRDisplay, stopCamera: _stopCamera };

})();
