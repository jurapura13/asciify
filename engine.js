/**
 * ASCIIFY — Conversion Engine
 * Pure client-side image-to-ASCII art converter
 * Algorithms: Luminance mapping, Sobel edge detection,
 *             Floyd-Steinberg dithering, Braille encoding,
 *             Block character mapping
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER RAMPS
// ─────────────────────────────────────────────────────────────────────────────

const CHAR_RAMPS = {
  standard:  ' .\'`-_:;!=+*#%@$&█',
  extended:  ' ·∙•○◉□■▪▫▬▭▮▯▰▱▲▶▼◀◆◇◈◉◊○●◎',
  blocks:    ' ░▒▓█▀▄▌▐■',
  minimal:   ' .:-=+*#%@',
  braille:   null,  // handled separately
  custom:    null,  // user-provided
};

// Dense → sparse (sorted by visual weight, light to dark)
const LUMINANCE_RAMP_STANDARD  = Array.from(' .\'`-_:;,~!=+*#%@$&█');
const LUMINANCE_RAMP_EXTENDED  = Array.from(' ·∙•○□▪▫▬▲▶◆◉●■█');
const LUMINANCE_RAMP_BLOCKS    = Array.from(' ░▒▓█');
const LUMINANCE_RAMP_MINIMAL   = Array.from(' .:-=+*#%@█');

// Edge directional characters
const EDGE_CHARS = {
  horizontal:  ['─', '━', '═', '-', '—'],
  vertical:    ['│', '┃', '║', '|'],
  diag_fwd:    ['╱', '/'],
  diag_back:   ['╲', '\\'],
  corner_tl:   ['┌', '╔', '╭'],
  corner_tr:   ['┐', '╗', '╮'],
  corner_bl:   ['└', '╚', '╰'],
  corner_br:   ['┘', '╝', '╯'],
};

// Block characters indexed by density 0..7
const BLOCK_CHARS = [' ', '░', '▒', '▓', '█', '▀', '▄', '▌', '▐', '■'];

// Braille base codepoint
const BRAILLE_BASE = 0x2800;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute perceptual luminance from RGB (ITU-R BT.601)
 */
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Clamp value between min and max
 */
function clamp(v, min = 0, max = 255) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Apply contrast and brightness adjustment to a luminance value [0..255]
 */
function adjustLuma(v, contrast, brightness) {
  // Contrast: scale around midpoint 128
  v = (v - 128) * (contrast / 100) + 128;
  // Brightness
  v = v * (brightness / 100);
  return clamp(v);
}

/**
 * Map a luminance [0..255] to a character in the ramp
 * invert flips the mapping
 */
function lumaToChar(luma, ramp, invert) {
  const n = ramp.length;
  let idx = Math.round((luma / 255) * (n - 1));
  if (invert) idx = n - 1 - idx;
  return ramp[Math.max(0, Math.min(n - 1, idx))];
}

/**
 * Get pixel RGBA from ImageData at (x, y)
 */
function getPixel(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i+1], data[i+2], data[i+3]];
}

/**
 * Get luminance at pixel (x, y) from a luminance buffer Float32Array
 */
function getLuma(lumaMap, w, x, y) {
  return lumaMap[y * w + x];
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE PREPROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load image, draw to canvas, return ImageData
 * Also applies contrast/brightness via CSS filter equivalent in canvas
 */
function getImageData(img, targetW, targetH) {
  const canvas = document.getElementById('offscreenCanvas');
  canvas.width  = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

/**
 * Build luminance map (Float32Array) from ImageData
 * Applies contrast and brightness, returns [0..255] per pixel
 */
function buildLumaMap(imageData, contrast, brightness) {
  const { data, width, height } = imageData;
  const luma = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      luma[y * width + x] = adjustLuma(luminance(r, g, b), contrast, brightness);
    }
  }
  return luma;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOBEL EDGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply Sobel operator to a luminance map.
 * Returns { magnitude: Float32Array, direction: Float32Array } (angles in radians)
 */
function applySobel(lumaMap, width, height) {
  const magnitude  = new Float32Array(width * height);
  const direction  = new Float32Array(width * height);

  // Sobel kernels
  const Kx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const Ky = [[-1,-2,-1], [ 0, 0, 0], [ 1, 2, 1]];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const luma = lumaMap[(y + ky) * width + (x + kx)];
          gx += Kx[ky+1][kx+1] * luma;
          gy += Ky[ky+1][kx+1] * luma;
        }
      }
      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }

  // Normalize magnitude to [0..255]
  let maxMag = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > maxMag) maxMag = magnitude[i];
  }
  if (maxMag > 0) {
    for (let i = 0; i < magnitude.length; i++) {
      magnitude[i] = (magnitude[i] / maxMag) * 255;
    }
  }

  return { magnitude, direction };
}

/**
 * Pick an edge character based on gradient direction angle (radians)
 * and corner context
 */
function directionToEdgeChar(angle) {
  // Normalize angle to [0, PI)
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;

  const PI = Math.PI;
  // Horizontal: near 0 or PI
  if (a < PI * 0.125 || a >= PI * 0.875) return EDGE_CHARS.horizontal[0];
  // Diagonal /: near PI*0.25
  if (a >= PI * 0.125 && a < PI * 0.375) return EDGE_CHARS.diag_fwd[0];
  // Vertical: near PI*0.5
  if (a >= PI * 0.375 && a < PI * 0.625) return EDGE_CHARS.vertical[0];
  // Diagonal \: near PI*0.75
  if (a >= PI * 0.625 && a < PI * 0.875) return EDGE_CHARS.diag_back[0];
  return EDGE_CHARS.horizontal[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOYD-STEINBERG DITHERING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply Floyd-Steinberg dithering to a copy of the luma map.
 * Quantizes to `levels` evenly-spaced values.
 * Returns a new quantized Float32Array.
 */
function floydSteinberg(lumaMap, width, height, levels = 8) {
  const buf = new Float32Array(lumaMap);
  const step = 255 / (levels - 1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const quantized = Math.round(old / step) * step;
      buf[idx] = quantized;
      const err = old - quantized;

      // Distribute error to neighbors
      if (x + 1 < width)                        buf[idx + 1]            += err * 7 / 16;
      if (y + 1 < height && x - 1 >= 0)         buf[idx + width - 1]    += err * 3 / 16;
      if (y + 1 < height)                        buf[idx + width]        += err * 5 / 16;
      if (y + 1 < height && x + 1 < width)      buf[idx + width + 1]    += err * 1 / 16;
    }
  }

  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAILLE ENCODER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode a 2×4 block of pixels into a Unicode Braille character.
 * pixels: Float32Array or array of 8 luma values in order:
 *   [tl, ml, lml, tr, mr, lmr, bl, br]
 *   mapped to dots: 1,2,3,4,5,6,7,8
 *
 * Unicode Braille bit positions:
 *   dot1(tl)  = bit 0 = 0x01
 *   dot2(ml)  = bit 1 = 0x02
 *   dot3(lml) = bit 2 = 0x04
 *   dot4(tr)  = bit 3 = 0x08
 *   dot5(mr)  = bit 4 = 0x10
 *   dot6(lmr) = bit 5 = 0x20
 *   dot7(bl)  = bit 6 = 0x40
 *   dot8(br)  = bit 7 = 0x80
 *
 * threshold: luma threshold (0..255) above which dot is "on"
 */
function encodeBraille(pixels, threshold) {
  let bits = 0;
  // Left column: rows 0-3 → dots 1,2,3,7
  if (pixels[0] >= threshold) bits |= 0x01; // dot1 - row 0 left
  if (pixels[1] >= threshold) bits |= 0x02; // dot2 - row 1 left
  if (pixels[2] >= threshold) bits |= 0x04; // dot3 - row 2 left
  if (pixels[6] >= threshold) bits |= 0x40; // dot7 - row 3 left
  // Right column: rows 0-3 → dots 4,5,6,8
  if (pixels[3] >= threshold) bits |= 0x08; // dot4 - row 0 right
  if (pixels[4] >= threshold) bits |= 0x10; // dot5 - row 1 right
  if (pixels[5] >= threshold) bits |= 0x20; // dot6 - row 2 right
  if (pixels[7] >= threshold) bits |= 0x80; // dot8 - row 3 right

  return String.fromCodePoint(BRAILLE_BASE + bits);
}

/**
 * Convert image to Braille ASCII art.
 * Each character covers 2×4 pixels of the source.
 * Returns array of strings (lines).
 */
function convertBraille(imageData, lumaMap, options) {
  const { width, height } = imageData;
  const { contrast, brightness, invert, dither } = options;

  // Optionally apply dithering
  const luma = dither ? floydSteinberg(lumaMap, width, height, 16) : lumaMap;

  // Threshold — midpoint
  const threshold = invert ? 128 : 128;

  const cols = Math.floor(width / 2);
  const rows = Math.floor(height / 4);
  const lines = [];

  for (let row = 0; row < rows; row++) {
    let line = '';
    const y0 = row * 4;

    for (let col = 0; col < cols; col++) {
      const x0 = col * 2;

      // 8 sample points for 2×4 braille cell
      // Left column (x0): rows y0..y0+3
      // Right column (x0+1): rows y0..y0+3
      const px = [
        getSafe(luma, width, height, x0,   y0),
        getSafe(luma, width, height, x0,   y0+1),
        getSafe(luma, width, height, x0,   y0+2),
        getSafe(luma, width, height, x0+1, y0),
        getSafe(luma, width, height, x0+1, y0+1),
        getSafe(luma, width, height, x0+1, y0+2),
        getSafe(luma, width, height, x0,   y0+3),
        getSafe(luma, width, height, x0+1, y0+3),
      ];

      // Apply invert
      const samples = invert ? px.map(v => 255 - v) : px;
      line += encodeBraille(samples, threshold);
    }
    lines.push(line);
  }

  return lines;
}

function getSafe(arr, w, h, x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return arr[y * w + x];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CONVERSION PIPELINES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Luminance-only conversion (with optional dithering)
 * cellW × cellH pixels per ASCII character
 */
function convertLuminance(imageData, options) {
  const { width, height } = imageData;
  const { ramp, invert, dither, contrast, brightness } = options;

  const lumaMap = buildLumaMap(imageData, contrast, brightness);
  const luma = dither ? floydSteinberg(lumaMap, width, height, ramp.length) : lumaMap;

  const cols = width;
  const rows = height;
  const lines = [];

  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const l = clamp(luma[y * width + x]);
      line += lumaToChar(l, ramp, invert);
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Edge detection mode — show edge characters where Sobel magnitude is high
 */
function convertEdges(imageData, options) {
  const { width, height } = imageData;
  const { ramp, invert, edgeThreshold, dither, contrast, brightness } = options;

  const lumaMap = buildLumaMap(imageData, contrast, brightness);
  const { magnitude, direction } = applySobel(lumaMap, width, height);

  const threshold = edgeThreshold * 2.55; // 0-100 → 0-255
  const lines = [];

  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx];
      if (mag > threshold) {
        line += directionToEdgeChar(direction[idx]);
      } else {
        // Background — use space or very light char
        const l = clamp(lumaMap[idx]);
        line += invert ? (l > 200 ? ramp[ramp.length - 1] : ' ') : (l < 50 ? ' ' : ' ');
      }
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Hybrid mode — edges take priority, fill with luminance characters
 */
function convertHybrid(imageData, options) {
  const { width, height } = imageData;
  const { ramp, invert, edgeThreshold, dither, contrast, brightness } = options;

  const lumaMap = buildLumaMap(imageData, contrast, brightness);
  const luma = dither ? floydSteinberg(lumaMap, width, height, ramp.length) : lumaMap;
  const { magnitude, direction } = applySobel(lumaMap, width, height);

  const threshold = edgeThreshold * 2.55;
  const lines = [];

  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx];

      if (mag > threshold) {
        // Edge region: use directional character, but scale by magnitude for intensity
        const edgeChar = directionToEdgeChar(direction[idx]);
        line += edgeChar;
      } else {
        // Fill region: luminance
        const l = clamp(luma[idx]);
        line += lumaToChar(l, ramp, invert);
      }
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Block mode — uses Unicode block characters for density
 */
function convertBlocks(imageData, options) {
  const { width, height } = imageData;
  const { invert, dither, contrast, brightness } = options;

  const lumaMap = buildLumaMap(imageData, contrast, brightness);
  const luma = dither ? floydSteinberg(lumaMap, width, height, BLOCK_CHARS.length) : lumaMap;

  const lines = [];

  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const l = clamp(luma[y * width + x]);
      line += lumaToChar(l, BLOCK_CHARS, invert);
    }
    lines.push(line);
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR SAMPLING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build color map: for each cell, compute average RGB
 * Returns array of {r,g,b} per pixel in the downsampled grid
 */
function buildColorMap(imageData) {
  const { data, width, height } = imageData;
  const colors = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      colors[y * width + x] = { r: data[i], g: data[i+1], b: data[i+2] };
    }
  }
  return colors;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML COLORIZED OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build colorized HTML string from ASCII lines + color map
 * Each character gets a span with its cell's color
 * @param {boolean} isBraille - if true, each char covers a 2×4 pixel block
 */
function buildColorizedHTML(lines, colorMap, gridW, colorMode, isBraille) {
  const htmlLines = lines.map((line, y) => {
    const chars = Array.from(line);
    const spans = chars.map((ch, x) => {
      let c = null;
      if (colorMap) {
        if (isBraille) {
          // Each braille char covers a 2×4 block of pixels in the source.
          // Sample the average color from that block.
          const bx = x * 2;
          const by = y * 4;
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const sx = bx + dx;
              const sy = by + dy;
              if (sx < gridW && sy < (colorMap.length / gridW)) {
                const ci = sy * gridW + sx;
                if (ci < colorMap.length && colorMap[ci]) {
                  rSum += colorMap[ci].r;
                  gSum += colorMap[ci].g;
                  bSum += colorMap[ci].b;
                  count++;
                }
              }
            }
          }
          if (count > 0) {
            c = { r: Math.round(rSum / count), g: Math.round(gSum / count), b: Math.round(bSum / count) };
          }
        } else {
          const idx = y * gridW + Math.min(x, gridW - 1);
          c = colorMap[idx] || null;
        }
      }
      let color;
      if (colorMode === 'color' && c) {
        color = `rgb(${c.r},${c.g},${c.b})`;
      } else if (colorMode === 'amber') {
        color = '#ffb000';
      } else if (colorMode === 'mono') {
        color = '#cccccc';
      } else {
        // matrix green — vary brightness slightly by luma
        if (c) {
          const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
          const brightness = 0.4 + (luma / 255) * 0.6;
          const g = Math.round(255 * brightness);
          color = `rgb(0,${g},${Math.round(g * 0.25)})`;
        } else {
          color = '#00ff41';
        }
      }
      if (ch === ' ') return ch;
      return `<span style="color:${color}">${escapeHtml(ch)}</span>`;
    });
    return spans.join('');
  });
  return htmlLines.join('\n');
}

function escapeHtml(ch) {
  if (ch === '&') return '&amp;';
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  return ch;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master conversion function.
 * @param {HTMLImageElement} img  - source image
 * @param {Object} opts           - all conversion options
 * @returns {{ lines: string[], colorLines: string|null, width: number, height: number, timeMs: number }}
 */
function convertImage(img, opts) {
  const t0 = performance.now();

  const {
    targetWidth,    // ASCII columns
    charsetName,    // 'standard' | 'extended' | 'blocks' | 'braille' | 'minimal' | 'custom'
    customRamp,     // string of chars if charsetName === 'custom'
    renderMode,     // 'luminance' | 'edges' | 'hybrid' | 'blocks'
    edgeSensitivity,// 0-100
    colorMode,      // 'matrix' | 'color' | 'mono' | 'amber'
    contrast,       // 50-200
    brightness,     // 50-200
    invert,         // bool
    dither,         // bool
  } = opts;

  // ── Compute grid dimensions ──────────────────────────────────────────────
  // ASCII characters are roughly 1:2 width:height ratio
  // So we need to correct for that when downsampling
  const CHAR_ASPECT = 0.5; // char width / char height (typical monospace ~8px × 16px → 0.5)

  let gridW, gridH;

  if (charsetName === 'braille') {
    // Braille: 2px per char column, 4px per char row
    // so source image pixels needed = gridW * 2 × gridH * 4
    gridW = targetWidth * 2;
    gridH = Math.round(gridW * (img.naturalHeight / img.naturalWidth) * CHAR_ASPECT * 2);
  } else {
    gridW = targetWidth;
    gridH = Math.round(targetWidth * (img.naturalHeight / img.naturalWidth) * CHAR_ASPECT);
  }

  gridH = Math.max(1, gridH);
  gridW = Math.max(1, gridW);

  // ── Load image into canvas ───────────────────────────────────────────────
  const imageData = getImageData(img, gridW, gridH);

  // ── Select character ramp ────────────────────────────────────────────────
  let ramp;
  if (charsetName === 'custom' && customRamp && customRamp.length > 0) {
    ramp = Array.from(customRamp);
  } else if (charsetName === 'blocks') {
    ramp = BLOCK_CHARS;
  } else if (charsetName === 'extended') {
    ramp = LUMINANCE_RAMP_EXTENDED;
  } else if (charsetName === 'minimal') {
    ramp = LUMINANCE_RAMP_MINIMAL;
  } else {
    ramp = LUMINANCE_RAMP_STANDARD;
  }

  const options = {
    ramp,
    invert,
    edgeThreshold: edgeSensitivity,
    dither,
    contrast,
    brightness,
  };

  // ── Run conversion pipeline ──────────────────────────────────────────────
  let lines;

  if (charsetName === 'braille') {
    const lumaMap = buildLumaMap(imageData, contrast, brightness);
    lines = convertBraille(imageData, lumaMap, { contrast, brightness, invert, dither });
  } else if (renderMode === 'edges') {
    lines = convertEdges(imageData, options);
  } else if (renderMode === 'blocks') {
    lines = convertBlocks(imageData, options);
  } else if (renderMode === 'luminance') {
    lines = convertLuminance(imageData, options);
  } else {
    // hybrid (default)
    lines = convertHybrid(imageData, options);
  }

  // ── Build color map for colorized output ─────────────────────────────────
  let colorMap = null;
  let htmlContent = null;
  const outputGridW = lines[0] ? Array.from(lines[0]).length : gridW;

  if (colorMode !== 'matrix' || true) {
    // Always build color map — we use it for matrix green variation too
    colorMap = buildColorMap(imageData);
    htmlContent = buildColorizedHTML(lines, colorMap, imageData.width, colorMode, charsetName === 'braille');
  }

  const timeMs = Math.round(performance.now() - t0);

  return {
    lines,
    htmlContent,
    gridW: outputGridW,
    gridH: lines.length,
    sourceW: imageData.width,
    sourceH: imageData.height,
    timeMs,
  };
}

// Export to global scope
window.AsciifyEngine = {
  convertImage,
  CHAR_RAMPS,
  LUMINANCE_RAMP_STANDARD,
  buildLumaMap,
  applySobel,
  floydSteinberg,
  encodeBraille,
  convertBraille,
};
