import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from './config.js';
import { haConfigured, getCurrent, getHaLocation, getTemperatureRange } from './homeassistant.js';
import { getAladin } from './aladin.js';
import { getOpenMeteo } from './openmeteo.js';
import { buildModel } from './model.js';
import { renderPage } from './render.js';
import { startOfLocalDay } from './format.js';
import { renderPng, closeBrowser } from './png.js';

const require = createRequire(import.meta.url);

// ---------- fonts (self-hosted, so the display works without internet access to Google) ----------

const FONT_PACKAGES = {
  inter: { pkg: '@fontsource/inter', weights: [400, 500, 600, 700] },
  barlow: { pkg: '@fontsource/barlow-semi-condensed', weights: [500, 600, 700] },
};
const fontDirs = Object.fromEntries(
  Object.entries(FONT_PACKAGES).map(([k, v]) => [k, path.dirname(require.resolve(`${v.pkg}/package.json`))]),
);

async function buildFontsCss() {
  const parts = [];
  for (const [key, { weights }] of Object.entries(FONT_PACKAGES)) {
    for (const w of weights) {
      const css = await fs.readFile(path.join(fontDirs[key], `${w}.css`), 'utf8');
      // Only latin + latin-ext are needed for Czech; drop cyrillic/greek/vietnamese blocks.
      const blocks = css.split(/(?=\/\* )/).filter((b) => /\/\* [\w-]*latin/.test(b) || !b.includes('@font-face'));
      parts.push(blocks.join('').replaceAll('url(./files/', `url(fonts/${key}/`));
    }
  }
  return parts.join('\n');
}
const fontsCss = await buildFontsCss();

// ---------- data ----------

async function resolveLocation() {
  let lat = config.latitude;
  let lon = config.longitude;
  let name = config.locationName;
  let tz = config.timeZone;
  if ((lat === null || lon === null || !name) && haConfigured()) {
    try {
      const loc = await getHaLocation();
      if (loc) {
        lat ??= loc.latitude;
        lon ??= loc.longitude;
        name ||= loc.name;
        if (!process.env.TZ && loc.timeZone) tz = loc.timeZone;
      }
    } catch (err) {
      console.warn(`[ha] cannot read location: ${err.message}`);
    }
  }
  if (lat === null || lon === null) throw new Error('Location unknown: set LATITUDE/LONGITUDE or configure Home Assistant');
  return { lat, lon, name: name || 'Počasí', tz };
}

async function collect() {
  const errors = [];
  const now = new Date();
  const loc = await resolveLocation();
  const [current, aladin, openMeteo] = await Promise.all([
    getCurrent().catch((err) => {
      console.warn(`[ha] ${err.message}`);
      return null;
    }),
    getAladin(loc.lat, loc.lon).catch(() => null),
    getOpenMeteo(loc.lat, loc.lon, loc.tz).catch(() => null),
  ]);
  let todayRange = null;
  if (current?.entities?.temperature) {
    todayRange = await getTemperatureRange(current.entities.temperature, startOfLocalDay(now, loc.tz)).catch((err) => {
      console.warn(`[ha] history: ${err.message}`);
      return null;
    });
  }
  if (!haConfigured()) errors.push('HA_URL / HA_TOKEN nenastaveno');
  else if (!current) errors.push('Home Assistant nedostupný');
  const model = buildModel({
    now,
    timeZone: loc.tz,
    lat: loc.lat,
    lon: loc.lon,
    locationName: loc.name,
    current,
    todayRange,
    aladin,
    openMeteo,
    hoursCount: config.hours,
    daysCount: config.days,
    errors,
  });
  return { model, current, loc };
}

// ---------- http ----------

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/' || p === '/index.html') {
      const { model } = await collect();
      return send(res, 200, 'text/html; charset=utf-8', renderPage(model, { refreshSeconds: config.refreshSeconds }));
    }
    if (p === '/api/data') {
      const { model, current, loc } = await collect();
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ location: loc, current, model }, null, 2));
    }
    if (p === '/image.png') {
      const q = url.searchParams;
      const opts = {
        levels: q.has('levels') ? Number(q.get('levels')) : config.png.levels,
        rotate: q.has('rotate') ? Number(q.get('rotate')) : config.png.rotate,
        invert: q.has('invert') ? ['1', 'true'].includes(q.get('invert')) : config.png.invert,
      };
      if (![0, 90, 180, 270].includes(opts.rotate)) return send(res, 400, 'text/plain', 'rotate must be 0, 90, 180 or 270');
      if (!Number.isInteger(opts.levels) || opts.levels < 2 || opts.levels > 256) {
        return send(res, 400, 'text/plain', 'levels must be an integer 2–256');
      }
      const png = await renderPng(`http://127.0.0.1:${config.port}/`, opts);
      return send(res, 200, 'image/png', png, { 'Content-Length': png.length });
    }
    if (p === '/healthz') return send(res, 200, 'text/plain', 'ok');
    if (p === '/fonts.css') {
      return send(res, 200, 'text/css; charset=utf-8', fontsCss, { 'Cache-Control': 'public, max-age=604800' });
    }
    const m = p.match(/^\/fonts\/(inter|barlow)\/([\w.-]+\.woff2?)$/);
    if (m) {
      const file = path.join(fontDirs[m[1]], 'files', m[2]);
      const data = await fs.readFile(file).catch(() => null);
      if (!data) return send(res, 404, 'text/plain', 'not found');
      return send(res, 200, m[2].endsWith('woff2') ? 'font/woff2' : 'font/woff', data, {
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    }
    send(res, 404, 'text/plain', 'not found');
  } catch (err) {
    console.error(err);
    send(res, 500, 'text/plain; charset=utf-8', `Error: ${err.message}`);
  }
});

server.listen(config.port, () => {
  console.log(`weather-dashboard listening on :${config.port}`);
  if (!haConfigured()) console.warn('HA_URL / HA_TOKEN not set — current conditions will fall back to the ALADIN forecast');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await closeBrowser();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
