#!/usr/bin/env node
/**
 * Regenerates every HobyMine logo asset from a single source image.
 *
 * The canonical source is `apps/web/src/assets/hobymine-mark.png`: the logo
 * mark on a transparent background. Everything else (PWA icons, the Android
 * launcher icons and the native splash screens) is derived from it so the
 * brand stays consistent across platforms.
 *
 * Usage:
 *   node scripts/generate-logo-assets.mjs
 *   node scripts/generate-logo-assets.mjs --source path/to/raw-logo.png
 *
 * `--source` trims the raw image, adds the standard breathing room and writes
 * it over `hobymine-mark.png` before deriving the rest. The raw image must be
 * a PNG that already has a transparent background, so soft shadows and glossy
 * highlights survive intact.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');
const MARK_PATH = path.join(WEB, 'src', 'assets', 'hobymine-mark.png');
const ICONS_DIR = path.join(WEB, 'public', 'icons');
const RES_DIR = path.join(WEB, 'android', 'app', 'src', 'main', 'res');

/**
 * Clean white chrome behind every launcher/PWA icon. A solid white tile keeps
 * the crimson mark sharp on the home screen in both device themes, the way
 * YouTube Studio and other professional launchers do — the old pure-black tile
 * read as a harsh, muddy block against dark wallpapers.
 */
const ICON_BG = [255, 255, 255, 255];

/** The adaptive-icon foreground must stay transparent so the tile shows through. */
const FOREGROUND_BG = [0, 0, 0, 0];

/** Native splash screens keep the dark app chrome, matching the launch screen. */
const SPLASH_BG = [0, 0, 0, 255];

/**
 * Visible mark width as a fraction of the canvas, measured from the old art.
 *
 * These are deliberately generous in padding: a mark that fills most of the
 * tile looks cramped and gets cropped by round/squircle launcher masks, so the
 * logo occupies roughly two thirds of the surface and sits on breathing room.
 */
const ICON_MARK_WIDTH = 0.68;
const LAUNCHER_MARK_WIDTH = 0.58;
const LAUNCHER_ROUND_MARK_WIDTH = 0.56;
const FOREGROUND_MARK_WIDTH = 0.5;
const SPLASH_MARK_WIDTH = 0.451;

/** Transparent margin around the trimmed mark in `hobymine-mark.png`. */
const MARK_PADDING = 0.08;

/* -------------------------------------------------------------------------- */
/* PNG decoding / encoding                                                    */
/* -------------------------------------------------------------------------- */

function decodePng(file) {
  const buf = fs.readFileSync(file);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`${file}: only 8-bit PNGs are supported`);
  if (interlace) throw new Error(`${file}: interlaced PNGs are not supported`);

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`${file}: unsupported PNG color type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) {
    const r = out[j];
    const g = channels >= 3 ? out[j + 1] : r;
    const b = channels >= 3 ? out[j + 2] : r;
    const a = channels === 4 ? out[j + 3] : channels === 2 ? out[j + 1] : 255;
    const k = i * 4;
    rgba[k] = r;
    rgba[k + 1] = g;
    rgba[k + 2] = b;
    rgba[k + 3] = a;
  }

  return { width, height, data: rgba };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 4; // Paeth
    const src = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[src + x - 4] : 0;
      const b = y > 0 ? rgba[src - stride + x] : 0;
      const c = x >= 4 && y > 0 ? rgba[src - stride + x - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[row + 1 + x] = (rgba[src + x] - pred) & 255;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Image operations (premultiplied alpha keeps edges clean)                    */
/* -------------------------------------------------------------------------- */

function toPremul({ width, height, data }) {
  const out = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const k = i * 4;
    const a = data[k + 3] / 255;
    out[k] = (data[k] / 255) * a;
    out[k + 1] = (data[k + 1] / 255) * a;
    out[k + 2] = (data[k + 2] / 255) * a;
    out[k + 3] = a;
  }
  return out;
}

function fromPremul(px, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const k = i * 4;
    const a = px[k + 3];
    if (a <= 0.0001) {
      out[k] = 0;
      out[k + 1] = 0;
      out[k + 2] = 0;
      out[k + 3] = 0;
      continue;
    }
    out[k] = Math.max(0, Math.min(255, Math.round((px[k] / a) * 255)));
    out[k + 1] = Math.max(0, Math.min(255, Math.round((px[k + 1] / a) * 255)));
    out[k + 2] = Math.max(0, Math.min(255, Math.round((px[k + 2] / a) * 255)));
    out[k + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
  return { width, height, data: out };
}

function catmullRom(t) {
  const x = Math.abs(t);
  if (x < 1) return 1.5 * x ** 3 - 2.5 * x ** 2 + 1;
  if (x < 2) return -0.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2;
  return 0;
}

function resizePixels(src, sw, sh, dw, dh) {
  const srcPx = toPremul({ width: sw, height: sh, data: src });
  const downscale = dw < sw || dh < sh;

  // Horizontal pass: sw x sh -> dw x sh
  const mid = new Float32Array(dw * sh * 4);
  if (downscale) {
    const ratio = sw / dw;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < dw; x++) {
        const start = x * ratio;
        const end = start + ratio;
        let wsum = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sx = Math.floor(start); sx < Math.ceil(end); sx++) {
          const weight = Math.min(end, sx + 1) - Math.max(start, sx);
          if (weight <= 0) continue;
          const clamped = Math.min(sw - 1, Math.max(0, sx));
          const k = (y * sw + clamped) * 4;
          r += srcPx[k] * weight;
          g += srcPx[k + 1] * weight;
          b += srcPx[k + 2] * weight;
          a += srcPx[k + 3] * weight;
          wsum += weight;
        }
        const o = (y * dw + x) * 4;
        mid[o] = r / wsum;
        mid[o + 1] = g / wsum;
        mid[o + 2] = b / wsum;
        mid[o + 3] = a / wsum;
      }
    }
  } else {
    const scale = sw / dw;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < dw; x++) {
        const center = (x + 0.5) * scale - 0.5;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let wsum = 0;
        for (let sx = Math.floor(center) - 1; sx <= Math.ceil(center) + 1; sx++) {
          const weight = catmullRom(sx - center);
          if (weight <= 0) continue;
          const clamped = Math.min(sw - 1, Math.max(0, sx));
          const k = (y * sw + clamped) * 4;
          r += srcPx[k] * weight;
          g += srcPx[k + 1] * weight;
          b += srcPx[k + 2] * weight;
          a += srcPx[k + 3] * weight;
          wsum += weight;
        }
        const o = (y * dw + x) * 4;
        mid[o] = r / wsum;
        mid[o + 1] = g / wsum;
        mid[o + 2] = b / wsum;
        mid[o + 3] = a / wsum;
      }
    }
  }

  // Vertical pass: dw x sh -> dw x dh
  const out = new Float32Array(dw * dh * 4);
  if (downscale) {
    const ratio = sh / dh;
    for (let y = 0; y < dh; y++) {
      const start = y * ratio;
      const end = start + ratio;
      for (let x = 0; x < dw; x++) {
        let wsum = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = Math.floor(start); sy < Math.ceil(end); sy++) {
          const weight = Math.min(end, sy + 1) - Math.max(start, sy);
          if (weight <= 0) continue;
          const clamped = Math.min(sh - 1, Math.max(0, sy));
          const k = (clamped * dw + x) * 4;
          r += mid[k] * weight;
          g += mid[k + 1] * weight;
          b += mid[k + 2] * weight;
          a += mid[k + 3] * weight;
          wsum += weight;
        }
        const o = (y * dw + x) * 4;
        out[o] = r / wsum;
        out[o + 1] = g / wsum;
        out[o + 2] = b / wsum;
        out[o + 3] = a / wsum;
      }
    }
  } else {
    const scale = sh / dh;
    for (let y = 0; y < dh; y++) {
      const center = (y + 0.5) * scale - 0.5;
      for (let x = 0; x < dw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let wsum = 0;
        for (let sy = Math.floor(center) - 1; sy <= Math.ceil(center) + 1; sy++) {
          const weight = catmullRom(sy - center);
          if (weight <= 0) continue;
          const clamped = Math.min(sh - 1, Math.max(0, sy));
          const k = (clamped * dw + x) * 4;
          r += mid[k] * weight;
          g += mid[k + 1] * weight;
          b += mid[k + 2] * weight;
          a += mid[k + 3] * weight;
          wsum += weight;
        }
        const o = (y * dw + x) * 4;
        out[o] = r / wsum;
        out[o + 1] = g / wsum;
        out[o + 2] = b / wsum;
        out[o + 3] = a / wsum;
      }
    }
  }

  return fromPremul(out, dw, dh);
}

function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    img.data.copy(out, row * w * 4, ((y + row) * img.width + x) * 4, ((y + row) * img.width + x + w) * 4);
  }
  return { width: w, height: h, data: out };
}

/** Bounding box of visible pixels (alpha above a small threshold). */
function contentBox(img, threshold = 6) {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('image is fully transparent');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function addPadding(img, fraction) {
  const pad = Math.round(Math.max(img.width, img.height) * fraction);
  const out = { width: img.width + pad * 2, height: img.height + pad * 2, data: Buffer.alloc(0) };
  out.data = Buffer.alloc(out.width * out.height * 4);
  for (let y = 0; y < img.height; y++) {
    img.data.copy(out.data, ((y + pad) * out.width + pad) * 4, y * img.width * 4, (y + 1) * img.width * 4);
  }
  return out;
}

/** Draws `mark` centered on a canvas, scaled to `widthFraction` of the canvas. */
function compose(mark, size, widthFraction, { background = ICON_BG, circle = false } = {}) {
  /*
   * The drawn size is nudged so the leftover padding divides into two whole
   * pixels. `floor((size - width) / 2)` on an odd remainder leaves half a pixel
   * more padding on one side, which reads as a lopsided, slightly blurry logo.
   */
  let width = Math.max(1, Math.round(size * widthFraction));
  if ((size - width) % 2 !== 0) width -= 1;
  let height = Math.max(1, Math.round((width / mark.width) * mark.height));
  if ((size - height) % 2 !== 0) height -= 1;

  const scaled = resizePixels(mark.data, mark.width, mark.height, width, height);
  const scaledData = scaled.data;
  const canvas = { width: size, height: size, data: Buffer.alloc(size * size * 4) };
  const px = toPremul(canvas);
  const offsetX = (size - width) / 2;
  const offsetY = (size - height) / 2;

  // Background (optionally clipped to a circle with 4x4 supersampling).
  const bg = background.map((v) => v / 255);
  const radius = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 1;
      if (circle) {
        coverage = 0;
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const px2 = x + (sx + 0.5) / 4 - radius;
            const py2 = y + (sy + 0.5) / 4 - radius;
            if (px2 * px2 + py2 * py2 <= radius * radius) coverage += 1 / 16;
          }
        }
      }
      const k = (y * size + x) * 4;
      px[k] = bg[0] * bg[3] * coverage;
      px[k + 1] = bg[1] * bg[3] * coverage;
      px[k + 2] = bg[2] * bg[3] * coverage;
      px[k + 3] = bg[3] * coverage;
    }
  }

  // Mark over background (source-over in premultiplied space).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = offsetX + x;
      const cy = offsetY + y;
      if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
      const s = (y * width + x) * 4;
      const a = scaledData[s + 3] / 255;
      if (a <= 0) continue;
      const d = (cy * size + cx) * 4;
      const inv = 1 - a;
      px[d] = (scaledData[s] / 255) * a + px[d] * inv;
      px[d + 1] = (scaledData[s + 1] / 255) * a + px[d + 1] * inv;
      px[d + 2] = (scaledData[s + 2] / 255) * a + px[d + 2] * inv;
      px[d + 3] = a + px[d + 3] * inv;
    }
  }

  return fromPremul(px, size, size);
}

/* -------------------------------------------------------------------------- */
/* Asset generation                                                           */
/* -------------------------------------------------------------------------- */

function writePng(file, img) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(img.width, img.height, img.data));
  return `${path.relative(ROOT, file)} (${img.width}x${img.height})`;
}

function loadMark() {
  const raw = decodePng(MARK_PATH);
  const box = contentBox(raw);
  return crop(raw, box.x, box.y, box.width, box.height);
}

function buildMark(sourceFile) {
  const raw = decodePng(sourceFile);
  const box = contentBox(raw);
  const trimmed = crop(raw, box.x, box.y, box.width, box.height);
  const padded = addPadding(trimmed, MARK_PADDING);
  return padded;
}

function main() {
  const sourceIndex = process.argv.indexOf('--source');
  const written = [];

  if (sourceIndex !== -1) {
    const sourceFile = path.resolve(process.argv[sourceIndex + 1]);
    const padded = buildMark(sourceFile);
    written.push(writePng(MARK_PATH, padded));
  }

  const mark = loadMark();

  // PWA icons.
  for (const size of [192, 512]) {
    written.push(writePng(path.join(ICONS_DIR, `icon-${size}.png`), compose(mark, size, ICON_MARK_WIDTH)));
  }

  // Scalable favicon: same construction the previous icon.svg used.
  const icon512 = fs.readFileSync(path.join(ICONS_DIR, 'icon-512.png')).toString('base64');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="HobyMine">',
    '  <rect width="512" height="512" fill="#FFFFFF"/>',
    `  <image width="512" height="512" href="data:image/png;base64,${icon512}"/>`,
    '</svg>',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.svg'), svg);
  written.push(`${path.relative(ROOT, path.join(ICONS_DIR, 'icon.svg'))} (512x512)`);

  // Android launcher icons.
  const densities = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ];
  for (const [density, size] of densities) {
    const dir = path.join(RES_DIR, `mipmap-${density}`);
    written.push(writePng(path.join(dir, 'ic_launcher.png'), compose(mark, size, LAUNCHER_MARK_WIDTH)));
    written.push(
      writePng(path.join(dir, 'ic_launcher_round.png'), compose(mark, size, LAUNCHER_ROUND_MARK_WIDTH, { circle: true })),
    );
    written.push(
      writePng(
        path.join(dir, 'ic_launcher_foreground.png'),
        compose(mark, Math.round(size * 2.25), FOREGROUND_MARK_WIDTH, { background: FOREGROUND_BG }),
      ),
    );
  }

  // Native splash screens: one image per orientation/density bucket.
  const splashFiles = fs
    .readdirSync(RES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('drawable'))
    .map((entry) => path.join(RES_DIR, entry.name, 'splash.png'))
    .filter((file) => fs.existsSync(file));

  for (const file of splashFiles) {
    const { width, height } = decodePng(file);
    const target = Math.round(width * SPLASH_MARK_WIDTH);
    const markHeight = Math.round((target / mark.width) * mark.height);
    const scaled = resizePixels(mark.data, mark.width, mark.height, target, markHeight);
    const scaledData = scaled.data;
    const canvas = { width, height, data: Buffer.alloc(width * height * 4) };
    const px = toPremul(canvas);
    const bg = SPLASH_BG.map((v) => v / 255);
    for (let i = 0; i < width * height; i++) {
      const k = i * 4;
      px[k] = bg[0] * bg[3];
      px[k + 1] = bg[1] * bg[3];
      px[k + 2] = bg[2] * bg[3];
      px[k + 3] = bg[3];
    }
    const ox = Math.floor((width - target) / 2);
    const oy = Math.floor((height - markHeight) / 2);
    for (let y = 0; y < markHeight; y++) {
      for (let x = 0; x < target; x++) {
        const s = (y * target + x) * 4;
        const a = scaledData[s + 3] / 255;
        if (a <= 0) continue;
        const d = ((oy + y) * width + ox + x) * 4;
        const inv = 1 - a;
        px[d] = (scaledData[s] / 255) * a + px[d] * inv;
        px[d + 1] = (scaledData[s + 1] / 255) * a + px[d + 1] * inv;
        px[d + 2] = (scaledData[s + 2] / 255) * a + px[d + 2] * inv;
        px[d + 3] = a + px[d + 3] * inv;
      }
    }
    written.push(writePng(file, fromPremul(px, width, height)));
  }

  for (const line of written) console.log(`wrote ${line}`);
}

main();
