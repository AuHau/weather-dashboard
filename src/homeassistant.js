// Home Assistant REST API client: current conditions from the weather station.
import { config } from './config.js';

const ROLES = ['temperature', 'humidity', 'pressure', 'windSpeed', 'windGust', 'windBearing', 'rainToday', 'feelsLike'];

export function haConfigured() {
  return Boolean(config.ha.url && config.ha.token);
}

async function ha(path, init = {}) {
  const res = await fetch(`${config.ha.url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.ha.token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Home Assistant ${path} → HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- discovery ----------

const has = (s, re) => re.test(s);

function describe(state) {
  const a = state.attributes || {};
  return {
    id: state.entity_id,
    dc: a.device_class || '',
    unit: a.unit_of_measurement || '',
    text: `${state.entity_id} ${a.friendly_name || ''}`.toLowerCase(),
  };
}

const INDOOR = /indoor|inside|interior|vnitr|vnitř/;

// Score candidates for each role; highest positive score wins.
const SCORERS = {
  temperature: (e) =>
    e.dc === 'temperature' && !has(e.text, /dew|feel|apparent|chill|heat_?index|rosn|pocit/)
      ? 10 - (has(e.text, INDOOR) ? 8 : 0) + (has(e.text, /outdoor|outside|venku|venkov/) ? 3 : 0)
      : 0,
  feelsLike: (e) => (e.dc === 'temperature' && has(e.text, /feel|apparent|pocit/) ? 10 : 0),
  humidity: (e) =>
    e.dc === 'humidity' ? 10 - (has(e.text, INDOOR) ? 8 : 0) + (has(e.text, /outdoor|outside/) ? 3 : 0) : 0,
  pressure: (e) =>
    e.dc === 'atmospheric_pressure' || e.dc === 'pressure'
      ? 10 + (has(e.text, /rel|sea|msl/) ? 3 : 0) - (has(e.text, /abs/) ? 1 : 0)
      : 0,
  windSpeed: (e) =>
    e.dc === 'wind_speed' && !has(e.text, /gust|max|naraz|náraz/) ? 10 + (has(e.text, /avg|average/) ? 1 : 0) : 0,
  windGust: (e) => (e.dc === 'wind_speed' && has(e.text, /gust|naraz|náraz/) ? 10 : 0),
  windBearing: (e) =>
    e.dc === 'wind_direction' || (has(e.text, /wind_?dir|bearing|směr|smer/) && (e.unit === '°' || e.unit === ''))
      ? 10 - (has(e.text, /avg|average/) ? 0 : 1)
      : 0,
  rainToday: (e) =>
    e.dc === 'precipitation'
      ? 5 + (has(e.text, /daily|today|day|dnes/) ? 5 : 0) - (has(e.text, /week|month|year|total|event|hour/) ? 4 : 0)
      : 0,
};

let discovered = null; // { role: entity_id }
let discoveredAt = 0;

async function discoverDevice(states) {
  if (!config.ha.device) return {};
  if (discovered && Date.now() - discoveredAt < 3600_000) return discovered;
  const dev = config.ha.device.replace(/'/g, "\\'");
  const template = `{% set d = '${dev}' %}{% set id = device_id(d) or d %}{{ device_entities(id) | tojson }}`;
  let ids = [];
  try {
    const out = await ha('/api/template', { method: 'POST', body: JSON.stringify({ template }) });
    ids = Array.isArray(out) ? out : JSON.parse(out);
  } catch (err) {
    console.warn(`[ha] device discovery failed: ${err.message}`);
    return {};
  }
  if (!ids.length) console.warn(`[ha] device "${config.ha.device}" has no entities (wrong id/name?)`);
  const pool = states.filter((s) => ids.includes(s.entity_id) && s.entity_id.startsWith('sensor.')).map(describe);
  const result = {};
  for (const role of ROLES) {
    let best = null;
    let bestScore = 0;
    for (const e of pool) {
      const sc = SCORERS[role](e);
      if (sc > bestScore) {
        best = e;
        bestScore = sc;
      }
    }
    if (best) result[role] = best.id;
  }
  console.log('[ha] discovered entities:', result);
  discovered = result;
  discoveredAt = Date.now();
  return result;
}

// ---------- unit conversion ----------

function toNumber(state) {
  if (!state) return null;
  const n = parseFloat(state.state);
  return Number.isFinite(n) ? n : null;
}

const unitOf = (s) => (s?.attributes?.unit_of_measurement || '').toLowerCase();

function tempC(s) {
  const v = toNumber(s);
  if (v === null) return null;
  return unitOf(s).includes('f') ? ((v - 32) * 5) / 9 : v;
}

function speedKmh(s) {
  const v = toNumber(s);
  if (v === null) return null;
  const u = unitOf(s);
  if (u === 'm/s') return v * 3.6;
  if (u === 'mph') return v * 1.609344;
  if (u === 'kn' || u === 'kt' || u === 'knots') return v * 1.852;
  if (u === 'ft/s') return v * 1.09728;
  return v; // km/h
}

function pressureHpa(s) {
  const v = toNumber(s);
  if (v === null) return null;
  const u = unitOf(s);
  if (u === 'pa') return v / 100;
  if (u === 'kpa') return v * 10;
  if (u === 'inhg') return v * 33.8639;
  if (u === 'mmhg') return v * 1.33322;
  if (u === 'psi') return v * 68.9476;
  return v; // hPa, mbar
}

function precipMm(s) {
  const v = toNumber(s);
  if (v === null) return null;
  const u = unitOf(s);
  if (u === 'in') return v * 25.4;
  if (u === 'cm') return v * 10;
  return v;
}

function bearingDeg(s) {
  const v = toNumber(s);
  if (v !== null) return v;
  // Some stations report a compass string ("NW", "SSE").
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const i = pts.indexOf(String(s?.state || '').toUpperCase());
  return i >= 0 ? i * 22.5 : null;
}

// ---------- public API ----------

let haLocation = null;

export async function getHaLocation() {
  if (haLocation || !haConfigured()) return haLocation;
  const c = await ha('/api/config');
  haLocation = {
    latitude: c.latitude,
    longitude: c.longitude,
    name: c.location_name,
    timeZone: c.time_zone,
  };
  return haLocation;
}

let cache = null;
let cacheAt = 0;

export async function getCurrent() {
  if (!haConfigured()) return null;
  if (cache && Date.now() - cacheAt < config.haCacheSeconds * 1000) return cache;

  const states = await ha('/api/states');
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const found = await discoverDevice(states);
  const entities = {};
  for (const role of ROLES) entities[role] = config.ha.entities[role] || found[role] || '';

  const get = (role) => {
    const id = entities[role];
    if (!id) return null;
    const s = byId.get(id);
    if (!s) console.warn(`[ha] entity ${id} (${role}) not found`);
    return s || null;
  };

  const updated = ROLES.map(get)
    .filter(Boolean)
    .map((s) => Date.parse(s.last_updated || s.last_changed))
    .filter(Number.isFinite);

  cache = {
    entities,
    temperature: tempC(get('temperature')),
    temperatureUnit: unitOf(get('temperature')),
    feelsLike: tempC(get('feelsLike')),
    humidity: toNumber(get('humidity')),
    pressure: pressureHpa(get('pressure')),
    windSpeed: speedKmh(get('windSpeed')),
    windGust: speedKmh(get('windGust')),
    windBearing: bearingDeg(get('windBearing')),
    rainToday: precipMm(get('rainToday')),
    updatedAt: updated.length ? new Date(Math.max(...updated)) : new Date(),
  };
  cacheAt = Date.now();
  return cache;
}

// Observed min/max of the temperature sensor since `since` (Date).
let histCache = null;
let histAt = 0;

export async function getTemperatureRange(entityId, since) {
  if (!haConfigured() || !config.ha.useHistory || !entityId) return null;
  const key = `${entityId}|${since.toISOString()}`;
  if (histCache?.key === key && Date.now() - histAt < 10 * 60_000) return histCache.value;
  const qs = new URLSearchParams({ filter_entity_id: entityId, minimal_response: '', no_attributes: '' });
  const data = await ha(`/api/history/period/${encodeURIComponent(since.toISOString())}?${qs}`);
  // minimal_response drops attributes, so take the unit from the live state.
  const isF = cache?.temperatureUnit?.includes('f');
  const vals = (data?.[0] || [])
    .map((s) => parseFloat(s.state))
    .filter(Number.isFinite)
    .map((v) => (isF ? ((v - 32) * 5) / 9 : v));
  const value = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  histCache = { key, value };
  histAt = Date.now();
  return value;
}
