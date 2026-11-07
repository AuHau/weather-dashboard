// Open-Meteo: supplementary data that ALADIN does not provide
// (precipitation probability, days beyond ALADIN's horizon).
import { config, USER_AGENT } from './config.js';

const cache = new Map();

// Open-Meteo returns local wall-clock times ("2026-11-08T14:00") for the
// requested timezone; keep them as strings and compare against local keys.
export async function getOpenMeteo(lat, lon, timeZone) {
  if (!config.openMeteo.enabled) return null;
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${timeZone}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.openMeteo.cacheMinutes * 60_000) return hit.data;

  const qs = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    timezone: timeZone,
    forecast_days: String(Math.max(3, config.days + 2)),
    hourly: 'precipitation_probability',
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
    ].join(','),
    wind_speed_unit: 'kmh',
  });
  try {
    const res = await fetch(`${config.openMeteo.url}?${qs}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const hourlyProb = new Map();
    j.hourly.time.forEach((t, i) => hourlyProb.set(t.slice(0, 13), j.hourly.precipitation_probability[i]));
    const daily = new Map();
    j.daily.time.forEach((d, i) =>
      daily.set(d, {
        code: j.daily.weather_code[i],
        hi: j.daily.temperature_2m_max[i],
        lo: j.daily.temperature_2m_min[i],
        precip: j.daily.precipitation_sum[i],
        prob: j.daily.precipitation_probability_max[i],
        wind: j.daily.wind_speed_10m_max[i],
        windDir: j.daily.wind_direction_10m_dominant[i],
      }),
    );
    const data = { hourlyProb, daily };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.warn(`[open-meteo] fetch failed: ${err.message}`);
    return hit ? hit.data : null;
  }
}
