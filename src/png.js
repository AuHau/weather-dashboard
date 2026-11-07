// PNG rendering of the dashboard for e-ink displays: headless Chromium takes a
// screenshot of the HTML page, then it is converted to grayscale, snapped to the
// panel's gray levels (no dithering) and optionally rotated.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { config } from './config.js';

export const WIDTH = 1200;
export const HEIGHT = 825;

const CHROME_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function chromePath() {
  if (config.png.chromiumPath) return config.png.chromiumPath;
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chromium not found; set CHROMIUM_PATH');
  return found;
}

let browserPromise = null;

async function browser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.connected) return b;
  }
  browserPromise = puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      '--no-sandbox', // container runs unprivileged without user namespaces
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--hide-scrollbars',
      '--font-render-hinting=none',
    ],
  });
  const b = await browserPromise;
  b.on('disconnected', () => {
    browserPromise = null;
  });
  return b;
}

async function screenshot(url) {
  const page = await (await browser()).newPage();
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Convert an RGBA PNG to grayscale snapped to `levels` evenly spaced grays
 * (8 = 3-bit, 4 = 2-bit, 2 = black/white; 0 or 256 = no quantization),
 * rotated clockwise by `rotate` degrees (0/90/180/270).
 */
export function toEink(pngBuffer, { levels = 8, rotate = 0, invert = false } = {}) {
  const src = PNG.sync.read(Buffer.from(pngBuffer)); // puppeteer returns a Uint8Array
  const { width: w, height: h, data } = src;
  const swap = rotate === 90 || rotate === 270;
  const out = new PNG({ width: swap ? h : w, height: swap ? w : h, colorType: 0, inputColorType: 0, bitDepth: 8 });
  const gray = Buffer.alloc(out.width * out.height);
  const quant = levels >= 2 && levels < 256;
  const step = quant ? 255 / (levels - 1) : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Composite on white for transparency, then luminance.
      const a = data[i + 3] / 255;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * a + 255 * (1 - a);
      let v = quant ? Math.round(Math.round(lum / step) * step) : Math.round(lum);
      if (invert) v = 255 - v;
      let ox = x;
      let oy = y;
      if (rotate === 90) [ox, oy] = [h - 1 - y, x];
      else if (rotate === 180) [ox, oy] = [w - 1 - x, h - 1 - y];
      else if (rotate === 270) [ox, oy] = [y, w - 1 - x];
      gray[oy * out.width + ox] = v;
    }
  }
  out.data = gray;
  return PNG.sync.write(out, { colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
}

// Renders are serialized and cached per option set, so a device polling the
// endpoint does not start a browser render on every request.
const cache = new Map(); // key -> { at, buf }
let queue = Promise.resolve();

export function renderPng(pageUrl, opts) {
  const key = JSON.stringify(opts);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.png.cacheSeconds * 1000) return Promise.resolve(hit.buf);
  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again && Date.now() - again.at < config.png.cacheSeconds * 1000) return again.buf;
    const buf = toEink(await screenshot(pageUrl), opts);
    cache.set(key, { at: Date.now(), buf });
    return buf;
  });
  queue = job.catch(() => {});
  return job;
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  await b?.close().catch(() => {});
}
