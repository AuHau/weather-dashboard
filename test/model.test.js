import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAladin } from '../src/aladin.js';
import { buildModel, classifyHour, classifyWmo, apparentTemp } from '../src/model.js';
import { renderPage } from '../src/render.js';
import { num, windDir, local } from '../src/format.js';

const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/aladin.json', import.meta.url)));
const aladin = parseAladin(raw);

test('parses ALADIN run time and units', () => {
  assert.equal(aladin.runTime.toISOString(), '2026-11-07T12:00:00.000Z');
  assert.equal(local(aladin.hours[0].time, 'Europe/Prague').h, 13); // matches forecastTimeIso
  const h = aladin.hours[0];
  assert.ok(h.pressure > 900 && h.pressure < 1100, 'pressure in hPa');
  assert.ok(h.humidity > 1 && h.humidity <= 100, 'humidity in %');
  assert.equal(aladin.hours[8].snowFraction, 0.25);
});

test('Czech formatting', () => {
  assert.equal(num(-2.04, 1), '−2,0');
  assert.equal(num(-0.2), '0');
  assert.equal(windDir(225), 'JZ');
  assert.equal(windDir(350), 'S');
});

test('classification', () => {
  assert.equal(classifyHour({ clouds: 0.05, precip: 0, snowFraction: 0 }, false).text, 'Jasno');
  assert.equal(classifyHour({ clouds: 0.05, precip: 0, snowFraction: 0 }, true).kind, 'moon');
  assert.equal(classifyHour({ clouds: 0.5, precip: 0, snowFraction: 0 }, false).kind, 'partly');
  assert.equal(classifyHour({ clouds: 1, precip: 1, snowFraction: 0.9 }, false).kind, 'snow');
  assert.equal(classifyWmo(63).kind, 'rain');
  assert.ok(Math.abs(apparentTemp(7.4, 82, 14) - 4.8) < 1.5);
});

test('builds the view model and renders', () => {
  const m = buildModel({
    now: new Date('2026-11-07T16:30:00Z'),
    timeZone: 'Europe/Prague',
    lat: 50.4372,
    lon: 15.3517,
    locationName: 'Jičín',
    current: { temperature: 7.4, humidity: 82, windSpeed: 14, windGust: 27, windBearing: 225, pressure: 1018.2, rainToday: 0.4, updatedAt: new Date('2026-11-07T16:25:00Z') },
    todayRange: { min: 1.2, max: 9.6 },
    aladin,
    openMeteo: null,
    hoursCount: 16,
    daysCount: 4,
    errors: [],
  });
  assert.equal(m.hours.length, 16);
  assert.equal(m.hours[0].hour, '17');
  assert.ok(m.hours[0].night);
  assert.equal(m.current.temp, '7,4°');
  assert.equal(m.current.windDir, 'JZ');
  assert.equal(m.current.hi, '10°');
  assert.equal(m.updated, '17:25');
  assert.equal(m.hasProb, false);
  assert.equal(m.days[0].source, 'ALADIN');
  assert.equal(m.days.length, 1); // only Sunday is fully covered by ALADIN without Open-Meteo
  assert.ok(m.hours.some((h) => h.kind === 'rain' || h.kind === 'snow'));
  const html = renderPage(m, { refreshSeconds: 300 });
  assert.match(html, /Jičín/);
  assert.match(html, /http-equiv="refresh" content="300"/);
});

test('e-ink PNG conversion quantizes and rotates', async () => {
  const { PNG } = await import('pngjs');
  const { toEink } = await import('../src/png.js');
  const src = new PNG({ width: 3, height: 2 });
  const grays = [0, 30, 100, 200, 250, 255];
  grays.forEach((g, i) => src.data.set([g, g, g, 255], i * 4));
  const out = PNG.sync.read(toEink(PNG.sync.write(src), { levels: 8, rotate: 90 }));
  assert.equal(out.width, 2);
  assert.equal(out.height, 3);
  const vals = new Set();
  for (let i = 0; i < out.data.length; i += 4) vals.add(out.data[i]);
  for (const v of vals) assert.ok([0, 36, 73, 109, 146, 182, 219, 255].includes(v), `unexpected gray ${v}`);
  // top-left of the rotated image is the bottom-left source pixel (200 → 182)
  assert.equal(out.data[0], 182);
  const bw = PNG.sync.read(toEink(PNG.sync.write(src), { levels: 2 }));
  assert.equal(bw.data[4], 0); // 30 → black
  assert.equal(bw.data[12], 255); // 200 → white
});
