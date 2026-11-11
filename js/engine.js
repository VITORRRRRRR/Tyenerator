/* ==========================================================================
   HORNTYPE — vector type engine
   Turns editable text into fully outlined SVG art. No text elements, no AI,
   no runtime font dependency after load. Built for deterministic exports.
   ========================================================================== */
(function (global) {
  'use strict';

  const FONT_DEFS = {
    bungee:   { label: 'Bungee',        file: 'fonts/Bungee-Regular.ttf',        css: 'HTBungee' },
    archivo:  { label: 'Archivo Black', file: 'fonts/ArchivoBlack-Regular.ttf',  css: 'HTArchivo' },
    anton:    { label: 'Anton',         file: 'fonts/Anton-Regular.ttf',         css: 'HTAnton' },
    bowlby:   { label: 'Bowlby One SC', file: 'fonts/BowlbyOneSC-Regular.ttf',   css: 'HTBowlby' },
    spacemono:{ label: 'Space Mono',    file: 'fonts/SpaceMono-Regular.ttf',     css: 'HTSpaceMono' }
  };

  const PRESETS = {
    chunky: {
      label: 'CHUNKY',
      sub: 'HEAVY / TIGHT',
      font: 'bungee',
      weight: 26,
      tracking: -2.8,
      scaleX: 108,
      scaleY: 100,
      roundness: 84,
      distort: 8
    },
    geometric: {
      label: 'GEOMETRIC',
      sub: 'WIDE / PRECISE',
      font: 'archivo',
      weight: 34,
      tracking: 0.6,
      scaleX: 97,
      scaleY: 101,
      roundness: 8,
      distort: 0
    },
    distorted: {
      label: 'DISTORTED',
      sub: 'LOOSE / UNSTABLE',
      font: 'anton',
      weight: 56,
      tracking: -1.2,
      scaleX: 112,
      scaleY: 104,
      roundness: 42,
      distort: 72
    },
    poster: {
      label: 'POSTER',
      sub: 'CHROMA / FAT',
      font: 'bowlby',
      weight: 14,
      tracking: -2.3,
      scaleX: 101,
      scaleY: 98,
      roundness: 76,
      distort: 0
    }
  };

  const PALETTES = [
    { name: 'CHROMA', bg: '#0A923E', text: '#000000', deco: '#000000' },
    { name: 'ACID',   bg: '#C8FF3E', text: '#0A0C06', deco: '#0A0C06' },
    { name: 'INK',    bg: '#0F0F0C', text: '#F2EFE2', deco: '#F2EFE2' },
    { name: 'CREAM',  bg: '#EFE6D2', text: '#16130D', deco: '#16130D' },
    { name: 'EMBER',  bg: '#E9472A', text: '#170503', deco: '#170503' },
    { name: 'COBALT', bg: '#2743E8', text: '#F4F6E8', deco: '#F4F6E8' },
    { name: 'ICE',    bg: '#BBD9FF', text: '#07111E', deco: '#07111E' },
    { name: 'BUBBLE', bg: '#FFB8D8', text: '#1B0610', deco: '#1B0610' },
    { name: 'SAND',   bg: '#E7D6B0', text: '#17130A', deco: '#17130A' },
    { name: 'FOREST', bg: '#123D2A', text: '#DFFFC7', deco: '#DFFFC7' },
    { name: 'PLUM',   bg: '#3A1230', text: '#FFD8F2', deco: '#FFD8F2' },
    { name: 'NIGHT',  bg: '#0A0C08', text: '#D8FF45', deco: '#D8FF45' }
  ];

  const HORN_STYLES = ['bull', 'hook', 'blade'];
  const HORN_OVERLAP = 18;
  const HORN_METRICS = {
    bull:  { extent: 50, tipY: 96 },
    hook:  { extent: 96, tipY: 122 },
    blade: { extent: 100, tipY: 122 }
  };
  const LINE_ADVANCE = 0.88;       // em, tight display leading
  const MAX_LINES = 6;

  const HORN_COMMANDS = {
    // The bull profile is generated from a tapered spine in hornPathData().
    // These hand-built profiles remain available for the hook / blade cuts.
    hook: [
      ['M', -14, -40],
      ['C', 4, -46, 22, -64, 38, -84],
      ['C', 52, -102, 66, -116, 78, -112],
      ['C', 88, -108, 92, -96, 86, -86],
      ['C', 82, -79, 74, -76, 68, -80],
      ['C', 62, -84, 64, -92, 72, -94],
      ['C', 64, -92, 54, -82, 44, -66],
      ['C', 30, -46, 18, -24, 8, -8],
      ['C', 2, 2, 0, 10, -4, 14],
      ['C', -9, 18, -14, 14, -14, 8],
      ['Z']
    ],
    // A faceted, aggressive horn with three sharp barbs.
    blade: [
      ['M', -14, -42], ['L', 6, -48], ['L', 26, -72], ['L', 38, -60],
      ['L', 52, -98], ['L', 62, -70], ['L', 76, -116], ['L', 84, -86],
      ['L', 96, -92], ['L', 80, -66], ['L', 88, -48], ['L', 64, -58],
      ['L', 54, -36], ['L', 42, -52], ['L', 26, -24], ['L', 12, 6],
      ['L', 4, 14], ['L', -14, 8], ['Z']
    ]
  };

  /* ------------------------------------------------------------------ utils */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function num(value) {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round(value * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function unionBox(a, b) {
    if (!a) return { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
    return {
      x1: Math.min(a.x1, b.x1),
      y1: Math.min(a.y1, b.y1),
      x2: Math.max(a.x2, b.x2),
      y2: Math.max(a.y2, b.y2)
    };
  }

  function boxHeight(box) {
    return box ? box.y2 - box.y1 : 0;
  }

  function boxWidth(box) {
    return box ? box.x2 - box.x1 : 0;
  }

  /* ------------------------------------------------------------- font paths */

  function transformPath(path, pointFn) {
    const out = new global.opentype.Path();
    for (let i = 0; i < path.commands.length; i++) {
      const cmd = path.commands[i];
      if (cmd.type === 'M') {
        const p = pointFn(cmd.x, cmd.y);
        out.moveTo(p[0], p[1]);
      } else if (cmd.type === 'L') {
        const p = pointFn(cmd.x, cmd.y);
        out.lineTo(p[0], p[1]);
      } else if (cmd.type === 'C') {
        const c1 = pointFn(cmd.x1, cmd.y1);
        const c2 = pointFn(cmd.x2, cmd.y2);
        const p = pointFn(cmd.x, cmd.y);
        out.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1]);
      } else if (cmd.type === 'Q') {
        const c1 = pointFn(cmd.x1, cmd.y1);
        const p = pointFn(cmd.x, cmd.y);
        out.quadraticCurveTo(c1[0], c1[1], p[0], p[1]);
      } else if (cmd.type === 'Z') {
        out.close();
      }
    }
    return out;
  }

  function pathFromCommands(commands) {
    const path = new global.opentype.Path();
    for (let i = 0; i < commands.length; i++) {
      const c = commands[i];
      if (c[0] === 'M') path.moveTo(c[1], c[2]);
      else if (c[0] === 'L') path.lineTo(c[1], c[2]);
      else if (c[0] === 'C') path.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
      else if (c[0] === 'Q') path.quadraticCurveTo(c[1], c[2], c[3], c[4]);
      else if (c[0] === 'Z') path.close();
    }
    return path;
  }

  function capRatio(font) {
    const os2 = font.tables && font.tables.os2;
    let cap = os2 && os2.sCapHeight;
    if (!cap || cap <= 0) cap = font.ascender * 0.7;
    return clamp(cap / font.unitsPerEm, 0.56, 0.88);
  }

  function getGlyphData(font, ch) {
    const glyph = font.charToGlyph(ch);
    return {
      glyph,
      missing: glyph.index === 0
    };
  }

  /* ------------------------------------------------------------ line layout */

  function buildLine(font, text, fontSize, trackingEm, distort, seed, lineIndex) {
    const scale = fontSize / font.unitsPerEm;
    const d = clamp(distort, 0, 100) / 100;
    let x = 0;
    let prev = null;
    let box = null;
    const glyphs = [];
    const unsupported = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const data = getGlyphData(font, ch);
      const glyph = data.glyph;

      if (prev) x += font.getKerningValue(prev, glyph) * scale;
      const advance = glyph.advanceWidth * scale;

      if (data.missing && ch.trim() !== '') {
        unsupported.push(ch);
      } else if (ch.trim() !== '') {
        let path = glyph.getPath(x, 0, fontSize);
        if (d > 0.005) {
          path = distortPath(path, fontSize, d, seed, lineIndex, i, x);
        }
        const bb = path.getBoundingBox();
        if (bb && Number.isFinite(bb.x1)) {
          const dPath = path.toPathData(2);
          glyphs.push({
            ch,
            index: i,
            d: dPath,
            box: bb,
            clipD: null
          });
          box = unionBox(box, bb);
        }
      }

      x += advance + trackingEm * fontSize;
      prev = glyph;
    }

    return {
      glyphs,
      width: Math.max(0, x - trackingEm * fontSize),
      box,
      unsupported
    };
  }

  function distortPath(path, fontSize, d, seed, lineIndex, glyphIndex, originX) {
    const bb = path.getBoundingBox();
    if (!bb) return path;
    const cx = (bb.x1 + bb.x2) / 2;
    const cy = (bb.y1 + bb.y2) / 2;
    const rnd = mulberry32(hashString(seed + ':' + lineIndex + ':' + glyphIndex));
    const angle = (rnd() - 0.5) * d * 9 * Math.PI / 180;
    const skew = (rnd() - 0.5) * d * 0.14;
    const scale = 1 + (rnd() - 0.5) * d * 0.055;
    const dx = (rnd() - 0.5) * d * fontSize * 0.035;
    const dy = (rnd() - 0.5) * d * fontSize * 0.045;
    const phase = (originX / Math.max(fontSize, 1)) * 0.9 + lineIndex * 1.7;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const waveX = fontSize * d * 0.010;
    const waveY = fontSize * d * 0.024;

    return transformPath(path, function (x, y) {
      let px = (x - cx) * scale;
      let py = (y - cy) * scale;
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      px = rx + ry * skew + cx + dx;
      py = ry + cy + dy;

      // A soft, letter-by-letter wave: the type breathes instead of just
      // rotating. Frequencies are deliberately low so words remain readable.
      const wx = Math.sin((py / fontSize) * Math.PI * 1.35 + phase) * waveX;
      const wy = Math.sin((px / fontSize) * Math.PI * 2.05 + phase * 1.4) * waveY;
      return [px + wx, py + wy];
    });
  }

  function addCutsToLine(line, fontSize, distort, seed, lineIndex, clipCounter) {
    const d = clamp((distort - 22) / 78, 0, 1);
    if (d <= 0) return 0;
    let made = 0;
    for (let i = 0; i < line.glyphs.length; i++) {
      const g = line.glyphs[i];
      const rnd = mulberry32(hashString(seed + ':cut:' + lineIndex + ':' + i));
      if (rnd() > 0.54 * Math.pow(d, 1.25)) continue;
      const bb = g.box;
      const w = boxWidth(bb);
      const h = boxHeight(bb);
      if (w < fontSize * 0.12 || h < fontSize * 0.12) continue;

      const pad = fontSize * 0.06 + 4;
      const notch = Math.min(w * 0.24, fontSize * 0.038 + w * 0.018);
      const depth = Math.min(h * 0.32, fontSize * 0.035 + h * 0.025);
      const mode = Math.floor(rnd() * 4);
      let tri = '';

      if (mode === 0) {
        const y = bb.y1 + h * (0.28 + rnd() * 0.44);
        tri = 'M ' + num(bb.x2 + pad) + ' ' + num(y - depth) +
              ' L ' + num(bb.x2 - notch) + ' ' + num(y) +
              ' L ' + num(bb.x2 + pad) + ' ' + num(y + depth) + ' Z';
      } else if (mode === 1) {
        const y = bb.y1 + h * (0.28 + rnd() * 0.44);
        tri = 'M ' + num(bb.x1 - pad) + ' ' + num(y - depth) +
              ' L ' + num(bb.x1 + notch) + ' ' + num(y) +
              ' L ' + num(bb.x1 - pad) + ' ' + num(y + depth) + ' Z';
      } else if (mode === 2) {
        const nw = notch * (0.8 + rnd() * 0.5);
        const nh = depth * (0.8 + rnd() * 0.4);
        tri = 'M ' + num(bb.x1 - pad) + ' ' + num(bb.y1 - pad) +
              ' L ' + num(bb.x1 + nw) + ' ' + num(bb.y1 - pad) +
              ' L ' + num(bb.x1 - pad) + ' ' + num(bb.y1 + nh) + ' Z';
      } else {
        const nw = notch * (0.8 + rnd() * 0.5);
        const nh = depth * (0.8 + rnd() * 0.4);
        tri = 'M ' + num(bb.x2 + pad) + ' ' + num(bb.y2 + pad) +
              ' L ' + num(bb.x2 - nw) + ' ' + num(bb.y2 + pad) +
              ' L ' + num(bb.x2 + pad) + ' ' + num(bb.y2 - nh) + ' Z';
      }

      const rect = 'M ' + num(bb.x1 - pad) + ' ' + num(bb.y1 - pad) +
                   ' H ' + num(bb.x2 + pad) +
                   ' V ' + num(bb.y2 + pad) +
                   ' H ' + num(bb.x1 - pad) + ' Z';

      g.clipD = rect + ' ' + tri;
      g.clipId = 'cut-' + clipCounter.value;
      clipCounter.value += 1;
      made += 1;
    }
    return made;
  }

  /* ------------------------------------------------------------------ horns */

  function hornMetrics(style) {
    return HORN_METRICS[style] || HORN_METRICS.bull;
  }

  // A horn is a tapered ribbon swept along a curved spine. Generating it from
  // the centreline (instead of a single outline) keeps the root genuinely
  // heavy and lets the tip finish in a point at every curl setting.
  function bullHornPathData(curl) {
    const bend = (clamp(curl, 0, 100) - 50) / 50;
    const base = { x: 0, y: -5 };
    const c1 = { x: 9 + bend * 1.5, y: -30 };
    const c2 = { x: 38 + bend * 4, y: -52 };
    const tip = { x: 40 + bend * 5, y: -90 - bend * 3 };
    const segments = 32;
    const baseWidth = 34;
    const left = [];
    const right = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const x = mt * mt * mt * base.x + 3 * mt * mt * t * c1.x +
        3 * mt * t * t * c2.x + t * t * t * tip.x;
      const y = mt * mt * mt * base.y + 3 * mt * mt * t * c1.y +
        3 * mt * t * t * c2.y + t * t * t * tip.y;
      const dx = 3 * mt * mt * (c1.x - base.x) + 6 * mt * t * (c2.x - c1.x) +
        3 * t * t * (tip.x - c2.x);
      const dy = 3 * mt * mt * (c1.y - base.y) + 6 * mt * t * (c2.y - c1.y) +
        3 * t * t * (tip.y - c2.y);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const width = 0.7 + (baseWidth - 0.7) * Math.pow(1 - t, 0.88);
      left.push([x + nx * width / 2, y + ny * width / 2]);
      right.push([x - nx * width / 2, y - ny * width / 2]);
    }

    let d = 'M ' + num(left[0][0]) + ' ' + num(left[0][1]);
    for (let i = 1; i <= segments; i++) {
      d += ' L ' + num(left[i][0]) + ' ' + num(left[i][1]);
    }
    for (let i = segments; i >= 0; i--) {
      d += ' L ' + num(right[i][0]) + ' ' + num(right[i][1]);
    }
    return d + ' Z';
  }

  function hornPathData(style, curl) {
    if (style === 'bull' || !HORN_COMMANDS[style]) {
      return bullHornPathData(curl);
    }
    const commands = HORN_COMMANDS[style];
    const path = pathFromCommands(commands);
    const bend = (clamp(curl, 0, 100) - 50) / 50;
    const extent = hornMetrics(style).extent;
    return transformPath(path, function (x, y) {
      const t = clamp(x / extent, 0, 1);
      return [
        x + bend * t * t * 5,
        y - bend * (t * t * 22 + t * 2)
      ];
    }).toPathData(2);
  }

  function renderHorns(horn, anchors, capHeight, deco) {
    if (!horn.enabled || horn.size <= 0 || !anchors) return '';
    const s = (capHeight * (horn.size / 100)) / 100;
    if (s <= 0) return '';
    const pathD = hornPathData(horn.style, horn.curl);
    const gap = (horn.offsetX / 100) * 40;
    const angle = horn.angle || 0;
    const parts = [];

    if (horn.side === 'left' || horn.side === 'both') {
      parts.push(
        '<g transform="translate(' + num(anchors.left) + ' ' + num(anchors.y) + ') ' +
        'rotate(' + num(-angle) + ') scale(' + num(-s) + ' ' + num(s) + ') ' +
        'translate(' + num(gap) + ' 0)">' +
        '<path d="' + pathD + '"/></g>'
      );
    }
    if (horn.side === 'right' || horn.side === 'both') {
      parts.push(
        '<g transform="translate(' + num(anchors.right) + ' ' + num(anchors.y) + ') ' +
        'rotate(' + num(angle) + ') scale(' + num(s) + ' ' + num(s) + ') ' +
        'translate(' + num(gap) + ' 0)">' +
        '<path d="' + pathD + '"/></g>'
      );
    }

    return '<g id="horn-decoration" fill="' + deco + '" fill-rule="nonzero" ' +
           'stroke-linejoin="round">' + parts.join('') + '</g>';
  }

  /* --------------------------------------------------------------- fit/layout */

  function measureLines(font, lines, trackingEm) {
    let maxWidth = 0;
    let top = Infinity;
    let bottom = -Infinity;
    const measurements = [];
    for (let i = 0; i < lines.length; i++) {
      const line = buildLine(font, lines[i], 100, trackingEm, 0, 'measure', i);
      const lineTop = line.box ? line.box.y1 : 0;
      const lineBottom = line.box ? line.box.y2 : 0;
      const baseline = i * LINE_ADVANCE * 100;
      top = Math.min(top, lineTop + baseline);
      bottom = Math.max(bottom, lineBottom + baseline);
      maxWidth = Math.max(maxWidth, line.width);
      measurements.push({ width: line.width, box: line.box, top: lineTop, bottom: lineBottom });
    }
    if (!Number.isFinite(top)) top = -70;
    if (!Number.isFinite(bottom)) bottom = 0;
    return {
      lines: measurements,
      maxWidth,
      top,
      bottom,
      height: Math.max(bottom - top, 1)
    };
  }

  function styleForPreset(presetKey) {
    return PRESETS[presetKey] || PRESETS.chunky;
  }

  function buildMainType(ctx) {
    const state = ctx.state;
    const font = ctx.font;
    const W = ctx.W;
    const H = ctx.H;
    const preset = styleForPreset(state.preset);
    const lines = ctx.lines;
    const trackingEm = state.tracking / 100;
    const scaleX = state.scaleX / 100;
    const scaleY = state.scaleY / 100;
    const cap = capRatio(font);
    const measure = measureLines(font, lines, trackingEm);
    const isPoster = state.mode === 'poster';
    const availW = W * (isPoster ? 0.80 : 0.84);
    const availH = H * (isPoster ? 0.39 : 0.66);

    const horn = hornMetrics(state.horn.style);
    const hornExtraPerFont = (state.horn.enabled && state.horn.size > 0)
      ? 2 * ((horn.extent - HORN_OVERLAP) * cap * scaleY * (state.horn.size / 100) / 100)
      : 0;
    const HORN_TOP_OVERLAP = 0;
    // Horns rise above the cap. Reserve that headroom in the fit so a tall
    // ornament can never be clipped by the artboard.
    const hornAbovePerFont = (state.horn.enabled && state.horn.size > 0)
      ? Math.max(0, (horn.tipY - HORN_TOP_OVERLAP) * cap * scaleY * (state.horn.size / 100) / 100)
      : 0;

    const textWidthPerFont = (measure.maxWidth / 100) * scaleX;
    const blockHeightPerFont = (measure.height / 100) * scaleY;
    const widthFit = availW / Math.max(0.001, textWidthPerFont + hornExtraPerFont);
    const heightFit = availH / Math.max(0.001, blockHeightPerFont + hornAbovePerFont);
    const autoFit = Math.max(1, Math.min(widthFit, heightFit));
    const fontSize = clamp(autoFit * (state.size / 100), 6, 2400);

    // Build the final geometry at the fitted size.
    const finalLines = [];
    let maxWidth = 0;
    let minTop = Infinity;
    let maxBottom = -Infinity;
    const unsupported = [];
    const clipCounter = { value: 0 };

    for (let i = 0; i < lines.length; i++) {
      let line = buildLine(font, lines[i], fontSize, trackingEm, state.distort, ctx.seed, i);
      unsupported.push.apply(unsupported, line.unsupported);
      addCutsToLine(line, fontSize, state.distort, ctx.seed, i, clipCounter);
      const baseline = i * LINE_ADVANCE * fontSize;
      minTop = Math.min(minTop, (line.box ? line.box.y1 : 0) + baseline);
      maxBottom = Math.max(maxBottom, (line.box ? line.box.y2 : 0) + baseline);
      maxWidth = Math.max(maxWidth, line.width);
      finalLines.push({ line, baseline, box: line.box });
    }
    if (!Number.isFinite(minTop)) minTop = -fontSize * 0.7;
    if (!Number.isFinite(maxBottom)) maxBottom = 0;

    const textWidth = maxWidth * scaleX;
    const textHeight = (maxBottom - minTop) * scaleY;
    const hornS = (cap * fontSize * scaleY * (state.horn.size / 100)) / 100;
    const hornOutside = (state.horn.enabled && state.horn.size > 0)
      ? (horn.extent - HORN_OVERLAP) * hornS
      : 0;
    const blockWidth = textWidth + hornOutside * 2;
    const margin = W * (isPoster ? 0.09 : 0.08);

    let blockLeft;
    if (state.alignment === 'left') blockLeft = margin;
    else if (state.alignment === 'right') blockLeft = W - margin - blockWidth;
    else blockLeft = (W - blockWidth) / 2;
    blockLeft += (state.offsetX / 100) * W;

    // Widest line anchors the horns; in a stacked lockup they still connect to
    // a real edge instead of floating in empty space.
    let widestIndex = 0;
    for (let i = 1; i < finalLines.length; i++) {
      if (finalLines[i].line.width > finalLines[widestIndex].line.width) widestIndex = i;
    }
    const widest = finalLines[widestIndex];
    const widestTopRel = widest.line.box
      ? (widest.line.box.y1 + widest.baseline) * scaleY
      : minTop * scaleY;
    const hornAbovePx = (state.horn.enabled && state.horn.size > 0)
      ? Math.max(0, (horn.tipY - HORN_TOP_OVERLAP) * hornS)
      : 0;

    const textLeft = blockLeft + hornOutside;
    const centerY = H * (isPoster ? 0.405 : 0.5) + (state.offsetY / 100) * H + hornAbovePx / 2;
    const originY = centerY - ((minTop + maxBottom) / 2) * scaleY;

    const lineOffsets = finalLines.map(function (entry) {
      const width = entry.line.width;
      if (state.alignment === 'left') return 0;
      if (state.alignment === 'right') return maxWidth - width;
      return (maxWidth - width) / 2;
    });

    const hornAnchors = {
      left: textLeft + HORN_OVERLAP * hornS,
      right: textLeft + textWidth - HORN_OVERLAP * hornS,
      y: originY + widestTopRel + HORN_TOP_OVERLAP * hornS
        + (state.horn.offsetY / 100) * (cap * fontSize * scaleY * 0.6)
    };

    const strokeWidth = fontSize * (0.0015 + (state.weight / 100) * 0.062);
    const join = state.roundness >= 52 ? 'round' : 'miter';
    const miterLimit = state.roundness >= 52
      ? 2
      : 1.2 + (1 - state.roundness / 52) * 9;

    const attrs = 'fill="' + ctx.textColor + '" stroke="' + ctx.textColor + '" ' +
      'stroke-width="' + num(strokeWidth) + '" stroke-linejoin="' + join + '" ' +
      'stroke-miterlimit="' + num(miterLimit) + '" stroke-linecap="round" ' +
      'shape-rendering="geometricPrecision"';

    let textSvg = '';
    const clips = [];
    for (let i = 0; i < finalLines.length; i++) {
      const entry = finalLines[i];
      const offset = lineOffsets[i];
      let glyphs = '';
      for (let g = 0; g < entry.line.glyphs.length; g++) {
        const glyph = entry.line.glyphs[g];
        const clipAttr = glyph.clipId ? ' clip-path="url(#' + glyph.clipId + ')"' : '';
        glyphs += '<path d="' + glyph.d + '"' + clipAttr + '/>';
        if (glyph.clipD) {
          clips.push('<clipPath id="' + glyph.clipId + '" clipPathUnits="userSpaceOnUse" clip-rule="evenodd">' +
            '<path d="' + glyph.clipD + '" clip-rule="evenodd"/></clipPath>');
        }
      }
      textSvg += '<g transform="translate(' + num(offset) + ' ' + num(entry.baseline) + ')" ' +
        'data-line="' + i + '">' + glyphs + '</g>';
    }

    const typeGroup = '<g id="type-outlines" ' + attrs + '>' +
      '<g transform="translate(' + num(textLeft) + ' ' + num(originY) + ') ' +
      'scale(' + num(scaleX) + ' ' + num(scaleY) + ')">' + textSvg + '</g></g>';

    return {
      typeGroup,
      clips,
      fontSize,
      autoFit,
      textWidth,
      textHeight,
      textLeft,
      originY,
      maxWidth,
      minTop,
      maxBottom,
      blockWidth,
      hornAnchors,
      capHeight: cap * fontSize * scaleY,
      widestIndex,
      unsupported,
      textBottom: originY + maxBottom * scaleY,
      textTop: originY + minTop * scaleY
    };
  }

  /* -------------------------------------------------------------- extra type */

  function renderMonoLine(ctx, text, fontSize, trackingEm, weight, color, x, centerY, id) {
    const font = ctx.fonts.spacemono;
    if (!font || !text) return { svg: '', width: 0, height: 0, box: null };
    const line = buildLine(font, text, fontSize, trackingEm, 0, 'mono', 0);
    if (!line.box) return { svg: '', width: 0, height: 0, box: null };
    const h = boxHeight(line.box);
    const baseline = centerY - (line.box.y1 + line.box.y2) / 2;
    const stroke = fontSize * (0.001 + (weight / 100) * 0.02);
    let glyphs = '';
    for (let i = 0; i < line.glyphs.length; i++) {
      glyphs += '<path d="' + line.glyphs[i].d + '"/>';
    }
    const svg = '<g id="' + id + '" fill="' + color + '" stroke="' + color + '" ' +
      'stroke-width="' + num(stroke) + '" stroke-linejoin="round" opacity="0.82" ' +
      'transform="translate(' + num(x) + ' ' + num(baseline) + ')">' + glyphs + '</g>';
    return { svg: svg, width: line.width, height: h, box: line.box };
  }

  function fitMonoLine(font, text, targetWidth, baseSize, trackingEm) {
    const line = buildLine(font, text, 100, trackingEm, 0, 'measure', 0);
    if (!line.width) return baseSize;
    return Math.min(baseSize, targetWidth / (line.width / 100));
  }

  function buildPosterExtras(ctx, main, state) {
    const W = ctx.W;
    const H = ctx.H;
    const margin = W * 0.09;
    const offset = (state.offsetX / 100) * W;
    const font = ctx.fonts.spacemono;
    if (!font) return { svg: '', subtitleSvg: '', creditSvg: '' };

    let svg = '';
    let subtitleBottom = main.textBottom;

    if (state.poster.subtitle.trim()) {
      const subText = state.poster.subtitle.toUpperCase();
      const base = Math.max(12, main.fontSize * (state.poster.subSize / 100));
      const size = clamp(fitMonoLine(font, subText, W * 0.72, base, 0.14), 8, H * 0.08);
      const probe = buildLine(font, subText, size, 0.14, 0, 'sub', 0);
      const width = probe.width;
      let x = margin + offset;
      if (state.alignment === 'center') x = (W - width) / 2 + offset;
      else if (state.alignment === 'right') x = W - margin - width + offset;
      const subCenter = Math.min(
        H * 0.83,
        Math.max(main.textBottom + H * (state.poster.gap / 100) + size * 0.55, main.textBottom + H * 0.025)
      );
      const result = renderMonoLine(ctx, subText, size, 0.14, 0, ctx.textColor, x, subCenter, 'poster-subtitle');
      if (result.svg) {
        svg += result.svg;
        subtitleBottom = subCenter + result.height / 2;
      }
    }

    if (state.poster.credit.trim()) {
      const creditText = state.poster.credit.toUpperCase();
      const base = clamp(H * (state.poster.creditSize / 100), 7, H * 0.06);
      const size = clamp(fitMonoLine(font, creditText, W * 0.74, base, 0.18), 6, H * 0.05);
      const probe = buildLine(font, creditText, size, 0.18, 0, 'credit', 0);
      const width = probe.width;
      let x = margin + offset;
      if (state.alignment === 'center') x = (W - width) / 2 + offset;
      else if (state.alignment === 'right') x = W - margin - width + offset;
      const creditCenter = Math.max(H * 0.86, subtitleBottom + H * 0.04);
      const result = renderMonoLine(ctx, creditText, size, 0.18, 0, ctx.textColor, x, creditCenter, 'poster-credit');
      if (result.svg) svg += result.svg;
    }

    return { svg: svg };
  }

  /* ----------------------------------------------------------------- export */

  function buildHornEstimate(state) {
    const preset = styleForPreset(state.preset);
    return preset;
  }

  function build(state, options) {
    options = options || {};
    if (!this.ready) throw new Error('Fonts are not loaded yet.');
    const preset = styleForPreset(state.preset);
    const font = this.fonts[preset.font];
    if (!font) throw new Error('Missing display font.');

    const W = clamp(Math.round(state.canvas.width), 320, 3000);
    const H = clamp(Math.round(state.canvas.height), 320, 3000);
    const pixelWidth = options.pixelWidth || W;
    const pixelHeight = options.pixelHeight || H;
    const textColor = /^#[0-9a-f]{6}$/i.test(state.colors.text) ? state.colors.text : '#0A0C06';
    const bgColor = /^#[0-9a-f]{6}$/i.test(state.colors.bg) ? state.colors.bg : '#C8FF3E';
    const decoColor = /^#[0-9a-f]{6}$/i.test(state.colors.deco) ? state.colors.deco : textColor;
    const bgAlpha = clamp(state.colors.bgAlpha / 100, 0, 1);

    let rawText = String(state.text || '').replace(/\r/g, '').replace(/\t/g, '    ');
    if (state.uppercase) rawText = rawText.toUpperCase();
    let lines = rawText.split('\n').slice(0, MAX_LINES);
    while (lines.length > 1 && lines[0].trim() === '') lines.shift();
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 1 && lines[0].trim() === '') lines = [];
    if (!lines.length) {
      return this.buildEmpty(state, { W: W, H: H, pixelWidth: pixelWidth, pixelHeight: pixelHeight, bgColor: bgColor, bgAlpha: bgAlpha });
    }

    // The bundled display fonts are Latin-only. Drop unsupported codepoints
    // before layout so missing glyphs cannot inflate the measured width and
    // leave the horns floating away from the visible letters.
    const preUnsupported = [];
    lines = lines.map(function (line) {
      let clean = '';
      Array.from(line).forEach(function (ch) {
        const data = getGlyphData(font, ch);
        if (data.missing) {
          if (ch.trim() !== '') preUnsupported.push(ch);
        } else {
          clean += ch;
        }
      });
      return clean;
    });
    if (!lines.some(function (line) { return line.trim() !== ''; })) {
      const empty = this.buildEmpty(state, { W: W, H: H, pixelWidth: pixelWidth, pixelHeight: pixelHeight, bgColor: bgColor, bgAlpha: bgAlpha });
      empty.meta.unsupported = Array.from(new Set(preUnsupported));
      return empty;
    }

    const seed = hashString(rawText + '|' + state.preset).toString(36);
    const ctx = {
      state: state,
      fonts: this.fonts,
      font: font,
      W: W,
      H: H,
      lines: lines,
      seed: seed,
      textColor: textColor
    };

    const main = buildMainType(ctx);
    const typeGroup = main.typeGroup;
    const clips = main.clips;
    const hornSvg = renderHorns(state.horn, main.hornAnchors, main.capHeight, decoColor);
    const extras = state.mode === 'poster' ? buildPosterExtras(ctx, main, state) : { svg: '' };

    const title = (lines[0] || 'HORNTYPE').slice(0, 80);
    const desc = 'Vector wordmark generated in HORNTYPE — custom display type, horn ornament, SVG outlines.';

    const defs = clips.length ? '<defs>' + clips.join('') + '</defs>' : '';
    const bg = state.transparent
      ? ''
      : '<rect id="background" width="' + W + '" height="' + H + '" fill="' + bgColor +
        '" fill-opacity="' + num(bgAlpha) + '"/>';

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(pixelWidth) +
      '" height="' + Math.round(pixelHeight) + '" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'role="img" aria-labelledby="ht-title ht-desc" preserveAspectRatio="xMidYMid meet">' +
      '<title id="ht-title">' + escapeXml(title) + '</title>' +
      '<desc id="ht-desc">' + escapeXml(desc) + '</desc>' +
      defs + bg +
      '<g id="decorations">' + hornSvg + '</g>' +
      '<g id="wordmark">' + typeGroup + '</g>' +
      (extras.svg ? '<g id="poster-extras">' + extras.svg + '</g>' : '') +
      '</svg>';

    return {
      svg: svg,
      width: W,
      height: H,
      pixelWidth: Math.round(pixelWidth),
      pixelHeight: Math.round(pixelHeight),
      meta: {
        lines: lines.length,
        fontSize: main.fontSize,
        autoFit: main.autoFit,
        unsupported: Array.from(new Set(preUnsupported.concat(main.unsupported))),
        textWidth: main.textWidth,
        textHeight: main.textHeight,
        hornAnchors: main.hornAnchors
      }
    };
  }

  function buildEmpty(state, dims) {
    const bg = state.transparent ? '' :
      '<rect id="background" width="' + dims.W + '" height="' + dims.H + '" fill="' + dims.bgColor +
      '" fill-opacity="' + num(dims.bgAlpha) + '"/>';
    return {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(dims.pixelWidth) + '" height="' +
        Math.round(dims.pixelHeight) + '" viewBox="0 0 ' + dims.W + ' ' + dims.H + '" role="img">' +
        '<title>HORNTYPE empty canvas</title>' + bg + '</svg>',
      width: dims.W,
      height: dims.H,
      pixelWidth: Math.round(dims.pixelWidth),
      pixelHeight: Math.round(dims.pixelHeight),
      meta: { lines: 0, fontSize: 0, autoFit: 0, unsupported: [], empty: true }
    };
  }

  async function load(onProgress) {
    const keys = Object.keys(FONT_DEFS);
    this.fonts = this.fonts || {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const def = FONT_DEFS[key];
      if (onProgress) onProgress(i / keys.length, def.label);
      const response = await fetch(def.file, { cache: 'force-cache' });
      if (!response.ok) throw new Error('Could not load ' + def.file + ' (' + response.status + ')');
      const buffer = await response.arrayBuffer();
      this.fonts[key] = global.opentype.parse(buffer);
      if (onProgress) onProgress((i + 1) / keys.length, def.label);
    }
    this.ready = true;
    return this.fonts;
  }

  const Engine = {
    FONT_DEFS: FONT_DEFS,
    PRESETS: PRESETS,
    PALETTES: PALETTES,
    HORN_STYLES: HORN_STYLES,
    load: load,
    build: build,
    ready: false,
    fonts: {}
  };

  global.HornEngine = Engine;
})(window);
