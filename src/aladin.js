// ALADIN (ČHMÚ, Czech limited-area model) point forecast.
// Uses the JSON endpoint behind the "Aladin Online" app, which serves the
// latest ALADIN CZ run interpolated to a point: hourly values for ~54 h.
import { config, USER_AGENT } from './config.js';

const cache = new Map(); // key -> { at, data }

function parseRunTime(raw) {
  // "forecastTime" is UTC, e.g. "Nov 7, 2026 12:00:00 PM".
  const t = Date.parse(`${raw.forecastTime} UTC`);
  if (Number.isFinite(t)) return new Date(t);
  throw new Error(`ALADIN: cannot parse forecastTime "${raw.forecastTime}"`);
}

export function parseAladin(raw) {
  const p = raw.parameterValues || {};
  const start = parseRunTime(raw);
  const n = raw.forecastLength || (p.TEMPERATURE || []).length;
  const at = (key, i, scale = 1) => {
    const v = p[key]?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v * scale : null;
  };
  const hours = [];
  for (let i = 0; i < n; i++) {
    const precip = Math.max(0, at('PRECIPITATION_TOTAL', i) ?? 0);
    const snow = Math.max(0, at('PRECIPITATION_SNOW', i) ?? 0);
    hours.push({
      time: new Date(start.getTime() + i * 3600_000),
      temp: at('TEMPERATURE', i),
      feels: at('APPARENT_TEMPERATURE', i),
      precip: precip < 0.01 ? 0 : precip,
      snowFraction: precip > 0.01 ? Math.min(1, snow / precip) : 0,
      clouds: at('CLOUDS_TOTAL', i), // 0..1
      humidity: at('HUMIDITY', i, 100),
      wind: at('WIND_SPEED', i, 3.6), // m/s -> km/h
      gust: at('WIND_GUST_SPEED', i, 3.6),
      windDir: at('WIND_DIRECTION', i),
      pressure: at('PRESSURE', i, 0.01), // Pa -> hPa
    });
  }
  return { runTime: start, hours, source: 'ALADIN' };
}

export async function getAladin(lat, lon) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.aladin.cacheMinutes * 60_000) return hit.data;

  const url = `${config.aladin.url}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseAladin(await res.json());
    if (!data.hours.length) throw new Error('empty forecast');
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.warn(`[aladin] fetch failed: ${err.message}`);
    if (hit) return hit.data; // serve stale data rather than nothing
    throw err;
  }
}
