/**
 * ASCIIFY — UI Controller & Export Logic
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  image:         null,   // HTMLImageElement
  imageFile:     null,   // File
  lastResult:    null,   // last convertImage() result
  converting:    false,
  debounceTimer: null,

  // Options
  targetWidth:     120,
  charsetName:     'standard',
  customRamp:      " .'-:;!=+*#%@$&█",
  renderMode:      'hybrid',
  edgeSensitivity: 30,
  colorMode:       'matrix',
  contrast:        100,
  brightness:      100,
  invert:          false,
  dither:          true,
  fontSize:        12,
  lineHeight:      1.1,
  viewMode:        'split',
};

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT REFERENCES
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  dropZone:         $('dropZone'),
  fileInput:        $('fileInput'),
  previewContainer: $('previewContainer'),
  previewImg:       $('previewImg'),
  previewMeta:      $('previewMeta'),
  splitPreviewImg:  $('splitPreviewImg'),
  originalEmpty:    $('originalEmpty'),

  widthSlider:      $('widthSlider'),
  widthVal:         $('widthVal'),
  charsetSelect:    $('charsetSelect'),
  customCharGroup:  $('customCharGroup'),
  customCharInput:  $('customCharInput'),
  renderModeGroup:  $('renderModeGroup'),
  edgeSlider:       $('edgeSlider'),
  edgeVal:          $('edgeVal'),
  colorModeGroup:   $('colorModeGroup'),
  contrastSlider:   $('contrastSlider'),
  contrastVal:      $('contrastVal'),
  brightnessSlider: $('brightnessSlider'),
  brightnessVal:    $('brightnessVal'),
  invertCheck:      $('invertCheck'),
  ditherCheck:      $('ditherCheck'),
  fontSizeSlider:   $('fontSizeSlider'),
  fontSizeVal:      $('fontSizeVal'),
  lineHeightSlider: $('lineHeightSlider'),
  lineHeightVal:    $('lineHeightVal'),

  convertBtn:       $('convertBtn'),
  viewModeGroup:    $('viewModeGroup'),
  splitView:        $('splitView'),
  asciiPre:         $('asciiPre'),
  asciiEmpty:       $('asciiEmpty'),
  crtScreen:        $('crtScreen'),

  btnCopy:          $('btnCopy'),
  btnTxt:           $('btnTxt'),
  btnHtml:          $('btnHtml'),
  btnPng:           $('btnPng'),

  statusDims:       $('statusDims'),
  statusCount:      $('statusCount'),
  statusTime:       $('statusTime'),
  statusMode:       $('statusMode'),
  statusReady:      $('statusReady'),
};

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE LOADING
// ─────────────────────────────────────────────────────────────────────────────

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  state.imageFile = file;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.image = img;

    // Show previews
    els.previewImg.src = url;
    els.splitPreviewImg.src = url;
    els.splitPreviewImg.style.display = 'block';
    els.originalEmpty.style.display = 'none';
    els.previewContainer.style.display = 'block';
    els.previewMeta.textContent = `${img.naturalWidth} × ${img.naturalHeight}px · ${formatBytes(file.size)}`;

    // Update drop zone
    els.dropZone.innerHTML = `
      <div class="drop-zone-content">
        <div class="drop-icon" style="font-size:16px">✓</div>
        <div class="drop-text">${escapeHtml(file.name)}</div>
        <div class="drop-sub">click to change</div>
      </div>
      <div class="drop-zone-scanlines"></div>
    `;
    els.dropZone.querySelector('input') && els.dropZone.appendChild(els.fileInput);

    // Auto-convert
    scheduleConvert(0);
  };
  img.src = url;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSION
// ─────────────────────────────────────────────────────────────────────────────

function getOptions() {
  return {
    targetWidth:     state.targetWidth,
    charsetName:     state.charsetName,
    customRamp:      state.customRamp,
    renderMode:      state.renderMode,
    edgeSensitivity: state.edgeSensitivity,
    colorMode:       state.colorMode,
    contrast:        state.contrast,
    brightness:      state.brightness,
    invert:          state.invert,
    dither:          state.dither,
  };
}

function scheduleConvert(delay = 150) {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(runConvert, delay);
}

function runConvert() {
  if (!state.image || state.converting) return;
  state.converting = true;

  // Update UI state
  els.convertBtn.classList.add('processing');
  els.statusReady.textContent = '● PROCESSING';
  els.statusReady.className = 'status-item status-right processing';

  // Use RAF to allow UI update before heavy computation
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        const result = AsciifyEngine.convertImage(state.image, getOptions());
        state.lastResult = result;
        renderOutput(result);
        updateStatus(result);
      } catch (err) {
        console.error('Conversion error:', err);
        els.statusReady.textContent = '✗ ERROR';
      } finally {
        state.converting = false;
        els.convertBtn.classList.remove('processing');
        els.statusReady.textContent = '■ READY';
        els.statusReady.className = 'status-item status-right done';
      }
    }, 10);
  });
}

function renderOutput(result) {
  const { lines, htmlContent, gridW, gridH } = result;

  // Show/hide elements
  els.asciiEmpty.style.display = 'none';
  els.asciiPre.style.display = 'block';

  // Apply font settings
  els.asciiPre.style.fontSize   = state.fontSize + 'px';
  els.asciiPre.style.lineHeight = state.lineHeight;

  // Apply color mode classes
  els.asciiPre.className = 'ascii-pre';
  if (state.colorMode === 'color') {
    els.asciiPre.classList.add('color-mode');
    els.asciiPre.innerHTML = htmlContent;
  } else if (state.colorMode === 'amber') {
    els.asciiPre.classList.add('color-amber');
    if (htmlContent) {
      els.asciiPre.classList.add('color-mode');
      els.asciiPre.innerHTML = htmlContent;
    } else {
      els.asciiPre.textContent = lines.join('\n');
    }
  } else if (state.colorMode === 'mono') {
    els.asciiPre.classList.add('color-mono');
    els.asciiPre.textContent = lines.join('\n');
  } else {
    // Matrix green — use HTML for subtle brightness variation per character
    if (htmlContent) {
      els.asciiPre.classList.add('color-mode');
      els.asciiPre.innerHTML = htmlContent;
    } else {
      els.asciiPre.textContent = lines.join('\n');
    }
  }
}

function updateStatus(result) {
  const { gridW, gridH, timeMs } = result;
  const totalChars = result.lines.reduce((s, l) => s + Array.from(l).length, 0);
  els.statusDims.textContent  = `${gridW}×${gridH} chars`;
  els.statusCount.textContent = `${totalChars.toLocaleString()} chars`;
  els.statusTime.textContent  = `${timeMs} ms`;
  els.statusMode.textContent  = `${state.renderMode} · ${state.colorMode}`;
}

function updateFontDisplay() {
  if (els.asciiPre.style.display !== 'none') {
    els.asciiPre.style.fontSize   = state.fontSize + 'px';
    els.asciiPre.style.lineHeight = state.lineHeight;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS SETUP
// ─────────────────────────────────────────────────────────────────────────────

function setupControls() {

  // ── Drop Zone ──
  els.dropZone.addEventListener('click', () => els.fileInput.click());

  els.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    els.dropZone.classList.add('drag-over');
  });

  els.dropZone.addEventListener('dragleave', () => {
    els.dropZone.classList.remove('drag-over');
  });

  els.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    els.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  els.fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
  });

  // ── Width ──
  els.widthSlider.addEventListener('input', () => {
    state.targetWidth = parseInt(els.widthSlider.value);
    els.widthVal.textContent = state.targetWidth;
    scheduleConvert();
  });

  // ── Charset ──
  els.charsetSelect.addEventListener('change', () => {
    state.charsetName = els.charsetSelect.value;
    els.customCharGroup.style.display = state.charsetName === 'custom' ? 'block' : 'none';
    scheduleConvert();
  });

  // ── Custom ramp ──
  els.customCharInput.addEventListener('input', () => {
    state.customRamp = els.customCharInput.value;
    scheduleConvert();
  });

  // ── Render Mode ──
  setupToggleGroup(els.renderModeGroup, v => {
    state.renderMode = v;
    scheduleConvert();
  });

  // ── Edge Sensitivity ──
  els.edgeSlider.addEventListener('input', () => {
    state.edgeSensitivity = parseInt(els.edgeSlider.value);
    els.edgeVal.textContent = state.edgeSensitivity;
    scheduleConvert();
  });

  // ── Color Mode ──
  setupToggleGroup(els.colorModeGroup, v => {
    state.colorMode = v;
    scheduleConvert();
  });

  // ── Contrast ──
  els.contrastSlider.addEventListener('input', () => {
    state.contrast = parseInt(els.contrastSlider.value);
    els.contrastVal.textContent = state.contrast;
    scheduleConvert();
  });

  // ── Brightness ──
  els.brightnessSlider.addEventListener('input', () => {
    state.brightness = parseInt(els.brightnessSlider.value);
    els.brightnessVal.textContent = state.brightness;
    scheduleConvert();
  });

  // ── Invert ──
  els.invertCheck.addEventListener('change', () => {
    state.invert = els.invertCheck.checked;
    scheduleConvert();
  });

  // ── Dither ──
  els.ditherCheck.addEventListener('change', () => {
    state.dither = els.ditherCheck.checked;
    scheduleConvert();
  });

  // ── Font Size ──
  els.fontSizeSlider.addEventListener('input', () => {
    state.fontSize = parseInt(els.fontSizeSlider.value);
    els.fontSizeVal.textContent = state.fontSize;
    updateFontDisplay();
  });

  // ── Line Height ──
  els.lineHeightSlider.addEventListener('input', () => {
    state.lineHeight = (parseInt(els.lineHeightSlider.value) / 100).toFixed(1);
    els.lineHeightVal.textContent = state.lineHeight;
    updateFontDisplay();
  });

  // ── Convert Button ──
  els.convertBtn.addEventListener('click', () => {
    clearTimeout(state.debounceTimer);
    runConvert();
  });

  // ── View Mode ──
  setupToggleGroup(els.viewModeGroup, v => {
    state.viewMode = v;
    els.splitView.className = 'split-view view-' + v;
  });

  // ── Export ──
  els.btnCopy.addEventListener('click', exportCopy);
  els.btnTxt.addEventListener('click', exportTxt);
  els.btnHtml.addEventListener('click', exportHtml);
  els.btnPng.addEventListener('click', exportPng);

  // ── Paste / drag global ──
  document.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        loadImageFile(item.getAsFile());
        break;
      }
    }
  });
}

function setupToggleGroup(groupEl, onChange) {
  groupEl.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      groupEl.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function getPlainText() {
  if (!state.lastResult) return '';
  return state.lastResult.lines.join('\n');
}

function exportCopy() {
  const text = getPlainText();
  if (!text) return;
  navigator.clipboard.writeText(text)
    .then(() => showToast('COPIED TO CLIPBOARD'))
    .catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('COPIED TO CLIPBOARD');
    });
}

function exportTxt() {
  const text = getPlainText();
  if (!text) return;
  downloadBlob(new Blob([text], { type: 'text/plain' }), 'asciify.txt');
}

function exportHtml() {
  if (!state.lastResult) return;
  const { lines, htmlContent, gridW, gridH } = state.lastResult;

  const bgColor  = '#0a0a0a';
  const fgColor  = state.colorMode === 'amber' ? '#ffb000'
                 : state.colorMode === 'mono'  ? '#cccccc'
                 : '#00ff41';

  const content = htmlContent || escapeHtmlFull(lines.join('\n'));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ASCII Art — ASCIIFY</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${bgColor};
      display: flex;
      justify-content: center;
      padding: 20px;
      min-height: 100vh;
    }
    pre {
      font-family: 'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace;
      font-size: ${state.fontSize}px;
      line-height: ${state.lineHeight};
      color: ${fgColor};
      white-space: pre;
      text-shadow: 0 0 3px ${fgColor}66;
    }
    span { }
  </style>
</head>
<body>
<pre>${content}</pre>
</body>
</html>`;

  downloadBlob(new Blob([html], { type: 'text/html' }), 'asciify.html');
}

function escapeHtmlFull(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function exportPng() {
  if (!state.lastResult) return;
  const { lines } = state.lastResult;

  const fontSize = state.fontSize;
  const lineHeightPx = Math.round(fontSize * state.lineHeight);
  const charWidth = fontSize * 0.601; // monospace approximation

  const cols = lines.reduce((max, l) => Math.max(max, Array.from(l).length), 0);
  const rows = lines.length;

  const canvasW = Math.round(cols * charWidth) + 20;
  const canvasH = rows * lineHeightPx + 20;

  const canvas = $('exportCanvas');
  canvas.width  = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.font = `${fontSize}px "JetBrains Mono", "Courier New", monospace`;
  ctx.textBaseline = 'top';

  if (state.colorMode === 'color' || state.colorMode === 'matrix') {
    // Re-render with colors
    const colorMap = state.lastResult.htmlContent ? buildColorMapFromHTML(state.lastResult) : null;
    lines.forEach((line, y) => {
      const chars = Array.from(line);
      chars.forEach((ch, x) => {
        let color;
        if (colorMap && colorMap[y] && colorMap[y][x]) {
          const c = colorMap[y][x];
          if (state.colorMode === 'color') {
            color = `rgb(${c.r},${c.g},${c.b})`;
          } else {
            const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
            const bright = 0.4 + (luma / 255) * 0.6;
            const g = Math.round(255 * bright);
            color = `rgb(0,${g},${Math.round(g * 0.25)})`;
          }
        } else {
          color = state.colorMode === 'amber' ? '#ffb000'
               : state.colorMode === 'mono'  ? '#cccccc'
               : '#00ff41';
        }
        ctx.fillStyle = color;
        ctx.fillText(ch, 10 + x * charWidth, 10 + y * lineHeightPx);
      });
    });
  } else {
    const color = state.colorMode === 'amber' ? '#ffb000'
               : state.colorMode === 'mono'  ? '#cccccc'
               : '#00ff41';
    ctx.fillStyle = color;
    lines.forEach((line, y) => {
      const chars = Array.from(line);
      chars.forEach((ch, x) => {
        ctx.fillText(ch, 10 + x * charWidth, 10 + y * lineHeightPx);
      });
    });
  }

  // Glow pass (subtle)
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.15;
  const color2 = state.colorMode === 'amber' ? '#ffb000' : '#00ff41';
  ctx.fillStyle = color2;
  ctx.shadowColor = color2;
  ctx.shadowBlur = 4;
  lines.forEach((line, y) => {
    ctx.fillText(line, 10, 10 + y * lineHeightPx);
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;

  canvas.toBlob(blob => {
    downloadBlob(blob, 'asciify.png');
  }, 'image/png');
}

// Parse color info from last result's source image
function buildColorMapFromHTML(result) {
  // Build a per-row, per-col color map from the source image
  // We re-use the offscreen canvas approach
  const img = state.image;
  if (!img) return null;

  const canvas = document.getElementById('offscreenCanvas');
  const { sourceW, sourceH } = result;
  // Should already be rendered at sourceW × sourceH from last conversion

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, sourceW, sourceH);
  const { data, width } = imageData;

  // Build per-row/col array
  const rows = result.lines.length;
  const cols = Array.from(result.lines[0] || '').length;
  const scaleX = sourceW / cols;
  const scaleY = sourceH / rows;

  const map = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const px = Math.floor(x * scaleX);
      const py = Math.floor(y * scaleY);
      const i = (Math.min(py, sourceH-1) * width + Math.min(px, sourceW-1)) * 4;
      row.push({ r: data[i], g: data[i+1], b: data[i+2] });
    }
    map.push(row);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD HELPER
// ─────────────────────────────────────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

function showToast(message) {
  const existing = document.querySelector('.copy-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML ESCAPE
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  setupControls();

  // Initialize status
  els.statusDims.textContent   = '—×— chars';
  els.statusCount.textContent  = '—';
  els.statusTime.textContent   = '— ms';
  els.statusMode.textContent   = `${state.renderMode} · ${state.colorMode}`;
  els.statusReady.textContent  = '■ READY';
  els.statusReady.className    = 'status-item status-right';

  // Add boot animation typing effect to the boot screen
  const bootLines = document.querySelectorAll('.boot-line');
  bootLines.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transition = `opacity 0.3s`;
    setTimeout(() => { el.style.opacity = '1'; }, 200 + i * 180);
  });
}

document.addEventListener('DOMContentLoaded', init);
