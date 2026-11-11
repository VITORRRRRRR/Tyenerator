/* ==========================================================================
   HORNTYPE — application shell
   State, controls, live preview, drag positioning, PNG / SVG export.
   ========================================================================== */
(function () {
  'use strict';

  const Engine = window.HornEngine;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.prototype.slice.call((root || document).querySelectorAll(selector));

  const STORAGE_KEY = 'horntype.state.v2';

  const DEFAULT_STATE = {
    mode: 'wordmark',
    text: 'HORNTYPE',
    uppercase: true,
    alignment: 'center',
    preset: 'chunky',
    size: 100,
    weight: 26,
    tracking: -2.8,
    scaleX: 108,
    scaleY: 100,
    roundness: 84,
    distort: 8,
    horn: {
      enabled: true,
      side: 'both',
      style: 'bull',
      size: 112,
      angle: 0,
      curl: 55,
      offsetX: 0,
      offsetY: 0
    },
    colors: {
      text: '#000000',
      bg: '#0A923E',
      deco: '#000000',
      bgAlpha: 100
    },
    transparent: false,
    poster: {
      subtitle: 'AN EXPERIMENTAL TYPE PLAYGROUND',
      credit: 'HORNTYPE / VOL. 01 / 2026',
      subSize: 26,
      creditSize: 2.2,
      gap: 4
    },
    canvas: {
      width: 1600,
      height: 1600,
      ratio: '1:1'
    },
    offsetX: 0,
    offsetY: 0
  };

  const RATIOS = {
    '1:1': [1600, 1600],
    '16:9': [1600, 900],
    '3:2': [1600, 1067]
  };

  const dom = {};
  let state;
  let fontsReady = false;
  let currentFormat = 'png';
  let exportScale = 2;
  let renderRaf = 0;
  let saveTimer = 0;
  let renderErrorShown = false;
  let lastUnsupported = [];
  let drag = null;
  const view = { zoom: 1, fitScale: 1, displayScale: 1 };

  /* ---------------------------------------------------------------- state */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepMerge(base, incoming) {
    if (!isPlainObject(incoming)) return base;
    Object.keys(incoming).forEach(function (key) {
      if (isPlainObject(base[key]) && isPlainObject(incoming[key])) {
        deepMerge(base[key], incoming[key]);
      } else if (incoming[key] !== undefined) {
        base[key] = incoming[key];
      }
    });
    return base;
  }

  function getPath(target, path) {
    return path.split('.').reduce(function (acc, key) {
      return acc == null ? acc : acc[key];
    }, target);
  }

  function setPath(target, path, value) {
    const parts = path.split('.');
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numeric(value, fallback, min, max) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
  }

  function normalizeState(candidate) {
    const next = deepMerge(clone(DEFAULT_STATE), candidate || {});
    if (['wordmark', 'poster'].indexOf(next.mode) === -1) next.mode = 'wordmark';
    if (['left', 'center', 'right'].indexOf(next.alignment) === -1) next.alignment = 'center';
    if (['left', 'right', 'both'].indexOf(next.horn.side) === -1) next.horn.side = 'both';
    if (Engine.HORN_STYLES.indexOf(next.horn.style) === -1) next.horn.style = 'bull';
    if (!Engine.PRESETS[next.preset]) next.preset = 'chunky';
    if (['1:1', '16:9', '3:2', 'custom'].indexOf(next.canvas.ratio) === -1) next.canvas.ratio = 'custom';
    if (typeof next.text !== 'string') next.text = DEFAULT_STATE.text;
    next.text = next.text.slice(0, 120);
    if (typeof next.uppercase !== 'boolean') next.uppercase = true;
    if (typeof next.transparent !== 'boolean') next.transparent = false;
    if (typeof next.horn.enabled !== 'boolean') next.horn.enabled = true;

    next.size = numeric(next.size, 100, 30, 100);
    next.weight = numeric(next.weight, 26, 0, 100);
    next.tracking = numeric(next.tracking, -2.8, -10, 16);
    next.scaleX = numeric(next.scaleX, 108, 70, 130);
    next.scaleY = numeric(next.scaleY, 100, 70, 130);
    next.roundness = numeric(next.roundness, 84, 0, 100);
    next.distort = numeric(next.distort, 8, 0, 100);

    next.horn.size = numeric(next.horn.size, 112, 0, 160);
    next.horn.angle = numeric(next.horn.angle, 0, -60, 60);
    next.horn.curl = numeric(next.horn.curl, 55, 0, 100);
    next.horn.offsetX = numeric(next.horn.offsetX, 0, -40, 60);
    next.horn.offsetY = numeric(next.horn.offsetY, 0, -60, 60);

    next.colors.text = /^#[0-9a-f]{6}$/i.test(next.colors.text) ? next.colors.text.toUpperCase() : DEFAULT_STATE.colors.text;
    next.colors.bg = /^#[0-9a-f]{6}$/i.test(next.colors.bg) ? next.colors.bg.toUpperCase() : DEFAULT_STATE.colors.bg;
    next.colors.deco = /^#[0-9a-f]{6}$/i.test(next.colors.deco) ? next.colors.deco.toUpperCase() : DEFAULT_STATE.colors.deco;
    next.colors.bgAlpha = numeric(next.colors.bgAlpha, 100, 0, 100);

    next.poster.subtitle = String(next.poster.subtitle == null ? '' : next.poster.subtitle).slice(0, 80);
    next.poster.credit = String(next.poster.credit == null ? '' : next.poster.credit).slice(0, 100);
    next.poster.subSize = numeric(next.poster.subSize, 26, 8, 55);
    next.poster.creditSize = numeric(next.poster.creditSize, 2.2, 1, 6);
    next.poster.gap = numeric(next.poster.gap, 4, 0, 14);

    next.canvas.width = Math.round(numeric(next.canvas.width, 1600, 600, 2400));
    next.canvas.height = Math.round(numeric(next.canvas.height, 1600, 600, 2400));
    next.offsetX = numeric(next.offsetX, 0, -30, 30);
    next.offsetY = numeric(next.offsetY, 0, -30, 30);
    return next;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (error) {
      /* A blocked storage API should never prevent the editor from loading. */
    }
    return normalizeState(null);
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 350);
  }

  function saveState() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* Private browsing / quota errors are non-fatal. */
    }
  }

  /* ---------------------------------------------------------------- toast */

  function showToast(message, type) {
    if (!dom.toastStack) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' is-error' : '');
    toast.textContent = message;
    dom.toastStack.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('is-out');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }, type === 'error' ? 4200 : 2600);
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    cacheDom();
    if (!Engine) {
      showFatalLoader('矢量引擎未加载。请确认 js/engine.js 与 vendor/opentype.min.js 存在。');
      return;
    }
    state = loadState();
    buildPalette();
    bindEvents();
    syncControls();
    setupCanvasObserver();
    loadFonts();
  }

  function cacheDom() {
    dom.body = document.body;
    dom.textInput = $('#textInput');
    dom.subtitleInput = $('#subtitleInput');
    dom.creditInput = $('#creditInput');
    dom.charCount = $('#charCount');
    dom.glyphWarn = $('#glyphWarn');
    dom.canvasMount = $('#canvasMount');
    dom.canvasShell = $('#canvasShell');
    dom.checkerboard = $('#checkerboard');
    dom.emptyState = $('#emptyState');
    dom.viewport = $('#viewport');
    dom.stageMode = $('#stageMode');
    dom.dimensionChip = $('#dimensionChip');
    dom.fitStatus = $('#fitStatus');
    dom.zoomLabel = $('#zoomLabel');
    dom.engineState = $('#engineState');
    dom.loader = $('#loader');
    dom.loaderBar = $('#loaderBar');
    dom.loaderPct = $('#loaderPct');
    dom.loaderStatus = $('#loaderStatus');
    dom.loaderError = $('#loaderError');
    dom.retryLoad = $('#retryLoad');
    dom.toastStack = $('#toastStack');
    dom.paletteRow = $('#paletteRow');
    dom.exportDialog = $('#exportDialog');
    dom.exportTransparent = $('#exportTransparent');
    dom.scaleInput = $('#scaleInput');
    dom.scaleReadout = $('#scaleReadout');
    dom.exportDimensions = $('#exportDimensions');
    dom.svgDimensions = $('#svgDimensions');
    dom.exportNote = $('#exportNote');
    dom.exportError = $('#exportError');
    dom.exportFormatState = $('#exportFormatState');
    dom.downloadBtn = $('#downloadBtn');
    dom.downloadLabel = $('#downloadLabel');
    dom.pngOptions = $('#pngOptions');
    dom.svgOptions = $('#svgOptions');
    dom.widthInput = $('#widthInput');
    dom.heightInput = $('#heightInput');
  }

  function loadFonts() {
    updateLoader(0, 'LOADING TYPE OUTLINES');
    Engine.load(function (fraction, label) {
      const pct = Math.round(fraction * 100);
      updateLoader(pct, pct >= 100 ? 'OUTLINES READY' : 'LOADING ' + String(label || 'FONTS').toUpperCase());
    }).then(function () {
      fontsReady = true;
      if (dom.engineState) dom.engineState.classList.add('is-ready');
      updateLoader(100, 'OUTLINES READY');
      render();
      setTimeout(function () {
        dom.loader.classList.add('is-gone');
      }, 380);
    }).catch(function (error) {
      console.error(error);
      if (dom.engineState) dom.engineState.textContent = 'FONT ERROR';
      if (dom.loaderBar) {
        dom.loaderBar.style.width = '100%';
        dom.loaderBar.style.background = '#ff735c';
      }
      if (dom.loaderPct) dom.loaderPct.textContent = 'ERROR';
      if (dom.loaderStatus) dom.loaderStatus.textContent = 'FONT LOAD FAILED';
      if (dom.loaderError) dom.loaderError.hidden = false;
    });
  }

  function updateLoader(pct, status) {
    if (dom.loaderBar) dom.loaderBar.style.width = pct + '%';
    if (dom.loaderPct) dom.loaderPct.textContent = pct + '%';
    if (dom.loaderStatus && status) dom.loaderStatus.textContent = status;
  }

  function showFatalLoader(message) {
    if (!dom.loader) return;
    if (dom.loaderStatus) dom.loaderStatus.textContent = 'ENGINE FAILED';
    if (dom.loaderPct) dom.loaderPct.textContent = 'ERROR';
    if (dom.loaderError) {
      dom.loaderError.hidden = false;
      dom.loaderError.querySelector('strong').textContent = '启动失败';
      dom.loaderError.querySelector('p').textContent = message;
    }
  }

  /* ---------------------------------------------------------------- palette */

  function buildPalette() {
    if (!dom.paletteRow) return;
    dom.paletteRow.innerHTML = '';
    Engine.PALETTES.forEach(function (palette, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-chip';
      button.dataset.palette = String(index);
      button.style.background = palette.bg;
      button.style.color = palette.text;
      button.textContent = 'Aa';
      button.title = palette.name + ' — ' + palette.bg + ' / ' + palette.text;
      button.setAttribute('aria-label', '配色 ' + palette.name);
      dom.paletteRow.appendChild(button);
    });
  }

  function applyPalette(index) {
    const palette = Engine.PALETTES[index];
    if (!palette) return;
    state.colors.bg = palette.bg;
    state.colors.text = palette.text;
    state.colors.deco = palette.deco;
    state.colors.bgAlpha = 100;
    state.transparent = false;
    syncColorControls();
    syncChecks();
    render();
    saveSoon();
  }

  function updatePaletteActive() {
    if (!dom.paletteRow) return;
    const matches = function (chip) {
      const palette = Engine.PALETTES[Number(chip.dataset.palette)];
      return palette &&
        palette.bg.toUpperCase() === state.colors.bg.toUpperCase() &&
        palette.text.toUpperCase() === state.colors.text.toUpperCase() &&
        palette.deco.toUpperCase() === state.colors.deco.toUpperCase();
    };
    $$('.palette-chip', dom.paletteRow).forEach(function (chip) {
      chip.classList.toggle('is-active', matches(chip));
    });
  }

  /* ---------------------------------------------------------------- sync */

  function syncControls() {
    dom.body.dataset.mode = state.mode;

    $$('button[data-mode]').forEach(function (button) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (dom.stageMode) dom.stageMode.textContent = state.mode === 'poster' ? 'POSTER' : 'WORDMARK';

    $$('input[data-bind]').forEach(function (input) {
      const value = getPath(state, input.dataset.bind);
      input.value = value;
      updateRangeFill(input);
    });

    $$('input[data-check]').forEach(function (input) {
      input.checked = Boolean(getPath(state, input.dataset.check));
    });

    $$('button[data-preset]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.preset === state.preset);
    });
    $$('button[data-align]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.align === state.alignment);
    });
    $$('button[data-side]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.side === state.horn.side);
    });
    $$('button[data-horn-style]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.hornStyle === state.horn.style);
    });
    $$('button[data-ratio]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.ratio === state.canvas.ratio);
    });

    if (dom.textInput) dom.textInput.value = state.text;
    if (dom.subtitleInput) dom.subtitleInput.value = state.poster.subtitle;
    if (dom.creditInput) dom.creditInput.value = state.poster.credit;
    if (dom.widthInput) dom.widthInput.value = state.canvas.width;
    if (dom.heightInput) dom.heightInput.value = state.canvas.height;

    syncOutputs();
    syncColorControls();
    syncChecks();
    updateCharMeta();
    if (dom.dimensionChip) {
      dom.dimensionChip.textContent = state.canvas.width + ' × ' + state.canvas.height;
    }
  }

  function syncOutputs() {
    $$('input[data-bind]').forEach(function (input) {
      const path = input.dataset.bind;
      const output = document.querySelector('output[data-for="' + path + '"]');
      if (!output) return;
      const value = Number(getPath(state, path));
      const precision = input.dataset.precision != null ? Number(input.dataset.precision) : null;
      const suffix = input.dataset.suffix || '';
      let shown;
      if (precision != null && Number.isFinite(precision)) {
        shown = String(Number(value.toFixed(precision)));
      } else if (Math.abs(value - Math.round(value)) > 0.001) {
        shown = String(Number(value.toFixed(1)));
      } else {
        shown = String(Math.round(value));
      }
      output.textContent = shown + suffix;
    });
  }

  function updateRangeFill(input) {
    if (!input || input.type !== 'range') return;
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const pct = max === min ? 0 : clamp(((value - min) / (max - min)) * 100, 0, 100);
    input.style.setProperty('--fill', pct + '%');
  }

  function updateControlValue(path, value) {
    const input = document.querySelector('input[data-bind="' + path + '"]');
    if (!input) return;
    input.value = value;
    updateRangeFill(input);
    const output = document.querySelector('output[data-for="' + path + '"]');
    if (output) {
      const precision = input.dataset.precision != null ? Number(input.dataset.precision) : null;
      const suffix = input.dataset.suffix || '';
      const number = Number(value);
      const shown = precision != null
        ? String(Number(number.toFixed(precision)))
        : String(Math.round(number));
      output.textContent = shown + suffix;
    }
  }

  function syncChecks() {
    $$('input[data-check]').forEach(function (input) {
      input.checked = Boolean(getPath(state, input.dataset.check));
    });
  }

  function syncColorControls() {
    const textInput = $('#textColorInput');
    const bgInput = $('#bgColorInput');
    const decoInput = $('#decoColorInput');
    if (textInput) textInput.value = state.colors.text.toLowerCase();
    if (bgInput) bgInput.value = state.colors.bg.toLowerCase();
    if (decoInput) decoInput.value = state.colors.deco.toLowerCase();
    const textHex = $('#textColorHex');
    const bgHex = $('#bgColorHex');
    const decoHex = $('#decoColorHex');
    if (textHex) textHex.value = state.colors.text.toUpperCase();
    if (bgHex) bgHex.value = state.colors.bg.toUpperCase();
    if (decoHex) decoHex.value = state.colors.deco.toUpperCase();
    updatePaletteActive();
  }

  function commitHexColor(key, input) {
    if (!input) return false;
    const match = /^#?([0-9a-f]{6})$/i.exec(input.value.trim());
    if (!match) {
      input.classList.add('is-invalid');
      return false;
    }
    input.classList.remove('is-invalid');
    const color = '#' + match[1].toUpperCase();
    state.colors[key] = color;
    const swatch = $('input[data-color="' + key + '"]');
    if (swatch) swatch.value = color.toLowerCase();
    updatePaletteActive();
    scheduleRender();
    saveSoon();
    return true;
  }

  function updateCharMeta() {
    if (!state) return;
    const lines = state.text.split('\n');
    const charLabel = state.text.length + ' CHARS / ' + lines.length + (lines.length === 1 ? ' LINE' : ' LINES');
    if (dom.charCount) dom.charCount.textContent = charLabel;
    let warning = '';
    if (lines.length > 6) warning = 'MAX 6 LINES';
    else if (lastUnsupported.length) warning = 'NO GLYPH: ' + lastUnsupported.slice(0, 10).join(' ');
    if (dom.glyphWarn) dom.glyphWarn.textContent = warning;
  }

  /* ---------------------------------------------------------------- render */

  function scheduleRender() {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(function () {
      renderRaf = 0;
      render();
    });
  }

  function render() {
    if (!fontsReady || !Engine.ready) return;
    let result;
    try {
      result = Engine.build(state);
    } catch (error) {
      console.error(error);
      if (!renderErrorShown) {
        renderErrorShown = true;
        showToast('渲染失败：' + error.message, 'error');
      }
      return;
    }
    renderErrorShown = false;

    dom.canvasMount.innerHTML = result.svg;
    const showChecker = state.transparent || state.colors.bgAlpha < 100;
    dom.canvasShell.classList.toggle('show-checker', showChecker);
    dom.emptyState.hidden = state.text.trim().length > 0;

    lastUnsupported = result.meta.unsupported || [];
    updateCharMeta();

    if (dom.dimensionChip) {
      dom.dimensionChip.textContent = result.width + ' × ' + result.height;
    }
    if (dom.fitStatus) {
      dom.fitStatus.textContent = result.meta.lines
        ? 'AUTO-FIT ' + Math.round(result.meta.fontSize) + 'PX · ' + result.meta.lines + (result.meta.lines === 1 ? ' LINE' : ' LINES')
        : 'AUTO-FIT —';
    }

    layoutCanvas();
    saveSoon();
  }

  function layoutCanvas() {
    if (!dom.viewport || !dom.canvasShell) return;
    const width = state.canvas.width;
    const height = state.canvas.height;
    const compact = window.matchMedia('(max-width: 560px)').matches;
    const availableWidth = Math.max(120, dom.viewport.clientWidth - (compact ? 28 : 72));
    const availableHeight = Math.max(120, dom.viewport.clientHeight - (compact ? 42 : 74));
    const fit = Math.min(availableWidth / width, availableHeight / height);
    view.fitScale = fit;
    const display = clamp(fit * view.zoom, 0.035, 2);
    view.displayScale = display;
    dom.canvasShell.style.width = Math.max(60, width * display) + 'px';
    dom.canvasShell.style.height = Math.max(60, height * display) + 'px';
    if (dom.zoomLabel) dom.zoomLabel.textContent = Math.round(display * 100) + '%';
  }

  function setupCanvasObserver() {
    if (typeof ResizeObserver !== 'undefined' && dom.viewport) {
      const observer = new ResizeObserver(function () {
        layoutCanvas();
      });
      observer.observe(dom.viewport);
    }
    window.addEventListener('resize', layoutCanvas);

    dom.canvasShell.addEventListener('pointerdown', startDrag);
    dom.canvasShell.addEventListener('pointermove', moveDrag);
    dom.canvasShell.addEventListener('pointerup', endDrag);
    dom.canvasShell.addEventListener('pointercancel', endDrag);

    dom.viewport.addEventListener('wheel', function (event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      view.zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.05, 12);
      layoutCanvas();
    }, { passive: false });
  }

  function startDrag(event) {
    if (event.button !== 0 || !state.text.trim()) return;
    const rect = dom.canvasShell.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: state.offsetX,
      startOffsetY: state.offsetY,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    dom.canvasShell.classList.add('is-dragging');
    try { dom.canvasShell.setPointerCapture(event.pointerId); } catch (error) { /* noop */ }
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    const nextX = clamp(drag.startOffsetX + (dx / Math.max(1, drag.width)) * 100, -30, 30);
    const nextY = clamp(drag.startOffsetY + (dy / Math.max(1, drag.height)) * 100, -30, 30);
    state.offsetX = Math.round(nextX * 10) / 10;
    state.offsetY = Math.round(nextY * 10) / 10;
    updateControlValue('offsetX', state.offsetX);
    updateControlValue('offsetY', state.offsetY);
    scheduleRender();
  }

  function endDrag(event) {
    if (!drag) return;
    if (event && event.pointerId !== drag.pointerId) return;
    dom.canvasShell.classList.remove('is-dragging');
    try { dom.canvasShell.releasePointerCapture(drag.pointerId); } catch (error) { /* noop */ }
    if (drag.moved) saveSoon();
    drag = null;
  }

  /* ---------------------------------------------------------------- actions */

  function applyPreset(key) {
    const preset = Engine.PRESETS[key];
    if (!preset) return;
    state.preset = key;
    state.weight = preset.weight;
    state.tracking = preset.tracking;
    state.scaleX = preset.scaleX;
    state.scaleY = preset.scaleY;
    state.roundness = preset.roundness;
    state.distort = preset.distort;
    syncControls();
    render();
    saveSoon();
  }

  function setMode(mode) {
    if (mode !== 'wordmark' && mode !== 'poster') return;
    state.mode = mode;
    syncControls();
    render();
    saveSoon();
  }

  function setRatio(ratio) {
    if (ratio === 'custom') {
      state.canvas.ratio = 'custom';
    } else if (RATIOS[ratio]) {
      state.canvas.ratio = ratio;
      state.canvas.width = RATIOS[ratio][0];
      state.canvas.height = RATIOS[ratio][1];
      if (dom.widthInput) dom.widthInput.value = state.canvas.width;
      if (dom.heightInput) dom.heightInput.value = state.canvas.height;
      if (dom.dimensionChip) dom.dimensionChip.textContent = state.canvas.width + ' × ' + state.canvas.height;
    }
    $$('button[data-ratio]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.ratio === state.canvas.ratio);
    });
    render();
    saveSoon();
  }

  function randomize() {
    const presetKeys = Object.keys(Engine.PRESETS);
    const presetKey = presetKeys[Math.floor(Math.random() * presetKeys.length)];
    const preset = Engine.PRESETS[presetKey];
    const palette = Engine.PALETTES[Math.floor(Math.random() * Engine.PALETTES.length)];
    const styles = Engine.HORN_STYLES;
    const sides = ['both', 'both', 'both', 'left', 'right'];
    const pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
    const range = function (min, max) { return min + Math.random() * (max - min); };

    state.preset = presetKey;
    state.weight = Math.round(clamp(preset.weight + range(-12, 14), 8, 82));
    state.tracking = Math.round(clamp(preset.tracking + range(-1.6, 1.6), -7, 7) * 10) / 10;
    state.scaleX = Math.round(clamp(preset.scaleX + range(-8, 8), 86, 122));
    state.scaleY = Math.round(clamp(preset.scaleY + range(-6, 7), 88, 112));
    state.roundness = Math.round(range(0, 100));
    state.distort = Math.round(clamp(preset.distort + range(-22, 22), 0, 100));
    state.size = Math.round(range(86, 100));
    state.alignment = 'center';

    state.horn.enabled = Math.random() < 0.93;
    state.horn.side = pick(sides);
    state.horn.style = pick(styles);
    state.horn.size = Math.round(range(56, 108));
    state.horn.curl = Math.round(range(20, 90));
    state.horn.angle = Math.round(range(-13, 13));
    state.horn.offsetX = Math.round(range(-5, 8));
    state.horn.offsetY = Math.round(range(-8, 8));

    state.colors.bg = palette.bg;
    state.colors.text = palette.text;
    state.colors.deco = palette.deco;
    state.colors.bgAlpha = 100;
    state.transparent = false;

    if (state.mode === 'poster') {
      state.poster.subSize = Math.round(range(18, 34));
      state.poster.creditSize = Math.round(range(1.6, 2.8) * 10) / 10;
      state.poster.gap = Math.round(range(1, 8) * 10) / 10;
    }

    syncControls();
    render();
    saveSoon();
    showToast('已生成新的字形组合 · ' + preset.label);
  }

  function resetAll() {
    state = normalizeState(null);
    syncControls();
    render();
    saveState();
    showToast('参数已恢复默认');
  }

  /* ---------------------------------------------------------------- export */

  function openExport(format) {
    if (!fontsReady) {
      showToast('字体轮廓尚未加载完成', 'error');
      return;
    }
    setFormat(format || 'png');
    dom.exportTransparent.checked = state.transparent;
    if (dom.exportError) dom.exportError.hidden = true;
    updateExportInfo();
    if (typeof dom.exportDialog.showModal === 'function') {
      if (!dom.exportDialog.open) dom.exportDialog.showModal();
    } else {
      dom.exportDialog.setAttribute('open', '');
    }
  }

  function closeExport() {
    if (typeof dom.exportDialog.close === 'function' && dom.exportDialog.open) {
      dom.exportDialog.close();
    } else {
      dom.exportDialog.removeAttribute('open');
    }
  }

  function setFormat(format) {
    currentFormat = format === 'svg' ? 'svg' : 'png';
    $$('button[data-format]').forEach(function (button) {
      const active = button.dataset.format === currentFormat;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    dom.pngOptions.hidden = currentFormat !== 'png';
    dom.svgOptions.hidden = currentFormat !== 'svg';
    if (dom.downloadLabel) dom.downloadLabel.textContent = currentFormat === 'png' ? '下载 PNG' : '下载 SVG';
    updateExportInfo();
  }

  function requestedScale() {
    const parsed = parseFloat(dom.scaleInput.value);
    if (!Number.isFinite(parsed)) return 2;
    return clamp(parsed, 1, 4);
  }

  function effectiveScale() {
    const width = state.canvas.width;
    const height = state.canvas.height;
    const requested = requestedScale();
    const maxSide = 12000;
    const maxArea = 80000000;
    const sideLimit = maxSide / Math.max(width, height);
    const areaLimit = Math.sqrt(maxArea / (width * height));
    const limited = Math.min(requested, sideLimit, areaLimit);
    return Math.max(1, Math.floor(limited * 10) / 10);
  }

  function updateExportInfo() {
    if (!dom.exportDimensions) return;
    const width = state.canvas.width;
    const height = state.canvas.height;
    const transparent = dom.exportTransparent.checked;
    if (currentFormat === 'png') {
      const requested = requestedScale();
      const actual = effectiveScale();
      const outW = Math.round(width * actual);
      const outH = Math.round(height * actual);
      dom.exportDimensions.textContent = outW.toLocaleString('en-US') + ' × ' + outH.toLocaleString('en-US') + ' px';
      if (dom.scaleReadout) {
        dom.scaleReadout.textContent = actual < requested
          ? requested + '× → ' + actual + '×'
          : requested + '×';
      }
      if (dom.exportNote) {
        dom.exportNote.textContent = actual < requested
          ? '为保证浏览器稳定渲染，本次导出已自动限制到 ' + actual + '×（最大 12000 px / 8000 万像素）。'
          : '文字已转为轮廓，PNG 与预览使用同一份 SVG 绘制结果。' + (transparent ? ' 背景将保持透明。' : '');
      }
      if (dom.exportFormatState) dom.exportFormatState.textContent = 'PNG / ' + actual + '×';
    } else {
      dom.svgDimensions.textContent = width.toLocaleString('en-US') + ' × ' + height.toLocaleString('en-US') + ' px';
      if (dom.exportFormatState) dom.exportFormatState.textContent = 'SVG / VECTOR';
      if (dom.exportNote) {
        dom.exportNote.textContent = transparent
          ? '背景透明：SVG 中不会写入背景矩形，可直接叠加到其他设计上。'
          : '背景会作为独立图层写入 SVG，画板尺寸与当前画布一致。';
      }
    }
    $$('button[data-scale]').forEach(function (button) {
      button.classList.toggle('is-active', Number(button.dataset.scale) === requestedScale());
    });
  }

  function buildExportState() {
    const exported = clone(state);
    exported.transparent = Boolean(dom.exportTransparent.checked);
    return exported;
  }

  function slug() {
    const first = (state.text.split('\n')[0] || 'wordmark').trim();
    const cleaned = first.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 32).toLowerCase();
    return cleaned || 'wordmark';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(function () {
      if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 1200);
  }

  function rasterize(svg, pixelWidth, pixelHeight) {
    return new Promise(function (resolve, reject) {
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        let canvas = null;
        try {
          canvas = document.createElement('canvas');
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('浏览器无法创建 2D 画布');
          context.clearRect(0, 0, pixelWidth, pixelHeight);
          context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
          return;
        }
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) {
            reject(new Error('PNG 编码失败，请降低导出倍率'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('SVG 光栅化失败'));
      };
      image.src = url;
    });
  }

  async function runExport() {
    if (!fontsReady) return;
    const format = currentFormat;
    const transparent = dom.exportTransparent.checked;
    dom.exportError.hidden = true;
    dom.downloadBtn.classList.add('is-busy');
    dom.downloadBtn.disabled = true;
    dom.downloadLabel.textContent = format === 'png' ? '渲染中…' : '打包中…';

    try {
      const exported = buildExportState();
      if (format === 'png') {
        const scale = effectiveScale();
        const outW = Math.round(state.canvas.width * scale);
        const outH = Math.round(state.canvas.height * scale);
        const result = Engine.build(exported, { pixelWidth: outW, pixelHeight: outH });
        const blob = await rasterize(result.svg, outW, outH);
        downloadBlob(blob, 'horntype-' + slug() + '-' + outW + 'x' + outH + (transparent ? '-transparent' : '') + '.png');
        showToast('PNG 已导出 · ' + outW + ' × ' + outH);
        closeExport();
      } else {
        const result = Engine.build(exported);
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + result.svg;
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, 'horntype-' + slug() + '-' + result.width + 'x' + result.height + '.svg');
        showToast('SVG 已导出 · 完全矢量');
        closeExport();
      }
    } catch (error) {
      console.error(error);
      dom.exportError.textContent = '导出失败：' + error.message;
      dom.exportError.hidden = false;
      showToast('导出失败：' + error.message, 'error');
    } finally {
      dom.downloadBtn.classList.remove('is-busy');
      dom.downloadBtn.disabled = false;
      dom.downloadLabel.textContent = format === 'png' ? '下载 PNG' : '下载 SVG';
    }
  }

  /* ---------------------------------------------------------------- events */

  function bindEvents() {
    if (dom.textInput) {
      dom.textInput.addEventListener('input', function () {
        state.text = dom.textInput.value.slice(0, 120);
        updateCharMeta();
        scheduleRender();
        saveSoon();
      });
    }

    if (dom.subtitleInput) {
      dom.subtitleInput.addEventListener('input', function () {
        state.poster.subtitle = dom.subtitleInput.value.slice(0, 80);
        scheduleRender();
        saveSoon();
      });
    }

    if (dom.creditInput) {
      dom.creditInput.addEventListener('input', function () {
        state.poster.credit = dom.creditInput.value.slice(0, 100);
        scheduleRender();
        saveSoon();
      });
    }

    document.addEventListener('input', function (event) {
      const target = event.target;
      if (target.matches('input[type="range"][data-bind]')) {
        const value = parseFloat(target.value);
        if (!Number.isFinite(value)) return;
        setPath(state, target.dataset.bind, value);
        updateRangeFill(target);
        syncOutputs();
        scheduleRender();
        saveSoon();
      }
    });

    document.addEventListener('change', function (event) {
      const target = event.target;
      if (target.matches('input[data-check]')) {
        setPath(state, target.dataset.check, target.checked);
        scheduleRender();
        saveSoon();
      }
    });

    $$('button[data-preset]').forEach(function (button) {
      button.addEventListener('click', function () { applyPreset(button.dataset.preset); });
    });

    $$('button[data-mode]').forEach(function (button) {
      button.addEventListener('click', function () { setMode(button.dataset.mode); });
    });

    $$('button[data-align]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.alignment = button.dataset.align;
        syncControls();
        render();
        saveSoon();
      });
    });

    $$('button[data-side]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.horn.side = button.dataset.side;
        syncControls();
        render();
        saveSoon();
      });
    });

    $$('button[data-horn-style]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.horn.style = button.dataset.hornStyle;
        syncControls();
        render();
        saveSoon();
      });
    });

    $$('button[data-ratio]').forEach(function (button) {
      button.addEventListener('click', function () { setRatio(button.dataset.ratio); });
    });

    if (dom.paletteRow) {
      dom.paletteRow.addEventListener('click', function (event) {
        const chip = event.target.closest('.palette-chip');
        if (chip) applyPalette(Number(chip.dataset.palette));
      });
    }

    ['text', 'bg', 'deco'].forEach(function (key) {
      const input = $('input[data-color="' + key + '"]');
      if (!input) return;
      input.addEventListener('input', function () {
        const color = input.value.toUpperCase();
        state.colors[key] = color;
        syncColorControls();
        scheduleRender();
        saveSoon();
      });

      const hex = $('#' + key + 'ColorHex');
      if (hex) {
        hex.addEventListener('input', function () { commitHexColor(key, hex); });
        hex.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitHexColor(key, hex);
            hex.blur();
          }
        });
        hex.addEventListener('blur', function () {
          hex.classList.remove('is-invalid');
          syncColorControls();
        });
      }
    });

    const swapBtn = $('#swapColors');
    if (swapBtn) {
      swapBtn.addEventListener('click', function () {
        const oldText = state.colors.text;
        const oldBg = state.colors.bg;
        state.colors.text = oldBg;
        state.colors.bg = oldText;
        if (state.colors.deco === oldText || state.colors.deco === oldBg) {
          state.colors.deco = state.colors.text;
        }
        syncColorControls();
        render();
        saveSoon();
        showToast('已交换文字与背景颜色');
      });
    }

    if (dom.widthInput) {
      dom.widthInput.addEventListener('change', function () {
        const value = Math.round(numeric(dom.widthInput.value, state.canvas.width, 600, 2400));
        state.canvas.width = value;
        state.canvas.ratio = 'custom';
        dom.widthInput.value = value;
        syncControls();
        render();
        saveSoon();
      });
    }

    if (dom.heightInput) {
      dom.heightInput.addEventListener('change', function () {
        const value = Math.round(numeric(dom.heightInput.value, state.canvas.height, 600, 2400));
        state.canvas.height = value;
        state.canvas.ratio = 'custom';
        dom.heightInput.value = value;
        syncControls();
        render();
        saveSoon();
      });
    }

    const resetBtn = $('#resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetAll);
    const randomBtn = $('#randomBtn');
    if (randomBtn) randomBtn.addEventListener('click', randomize);

    const pngTop = $('#exportPngTop');
    if (pngTop) pngTop.addEventListener('click', function () { openExport('png'); });
    const svgTop = $('#exportSvgTop');
    if (svgTop) svgTop.addEventListener('click', function () { openExport('svg'); });

    $$('button[data-format]').forEach(function (button) {
      button.addEventListener('click', function () { setFormat(button.dataset.format); });
    });

    $$('button[data-scale]').forEach(function (button) {
      button.addEventListener('click', function () {
        dom.scaleInput.value = button.dataset.scale;
        updateExportInfo();
      });
    });

    if (dom.scaleInput) {
      dom.scaleInput.addEventListener('input', updateExportInfo);
      dom.scaleInput.addEventListener('change', function () {
        const value = requestedScale();
        dom.scaleInput.value = String(value);
        updateExportInfo();
      });
    }

    if (dom.exportTransparent) {
      dom.exportTransparent.addEventListener('change', updateExportInfo);
    }

    const dialogClose = $('#dialogClose');
    if (dialogClose) dialogClose.addEventListener('click', closeExport);
    const dialogCancel = $('#dialogCancel');
    if (dialogCancel) dialogCancel.addEventListener('click', closeExport);
    if (dom.downloadBtn) dom.downloadBtn.addEventListener('click', runExport);

    if (dom.exportDialog) {
      dom.exportDialog.addEventListener('click', function (event) {
        if (event.target === dom.exportDialog) closeExport();
      });
    }

    const zoomIn = $('#zoomIn');
    if (zoomIn) zoomIn.addEventListener('click', function () {
      view.zoom = clamp(view.zoom * 1.2, 0.05, 12);
      layoutCanvas();
    });
    const zoomOut = $('#zoomOut');
    if (zoomOut) zoomOut.addEventListener('click', function () {
      view.zoom = clamp(view.zoom / 1.2, 0.05, 12);
      layoutCanvas();
    });
    const zoomFit = $('#zoomFit');
    if (zoomFit) zoomFit.addEventListener('click', function () {
      view.zoom = 1;
      layoutCanvas();
    });

    if (dom.retryLoad) {
      dom.retryLoad.addEventListener('click', function () { window.location.reload(); });
    }

    window.addEventListener('beforeunload', saveState);
  }

  init();
})();
