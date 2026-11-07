// Turns raw data (Home Assistant + ALADIN + Open-Meteo) into the view model the page renders.
import SunCalc from 'suncalc';
import { local, longDate, shortDate, weekday, hhmm, deg, mm, num, windDir } from './format.js';

// ---------- conditions ----------

/** Classify one hour of ALADIN data → { kind, text }. kind: sun|moon|partly|partlyNight|cloud|rain|snow */
export function classifyHour({ clouds, precip, snowFraction }, night) {
  if (precip >= 0.1) {
    if (snowFraction >= 0.8) return { kind: 'snow', text: precip < 0.5 ? 'Slabé sněžení' : 'Sněžení' };
    if (snowFraction >= 0.2) return { kind: 'snow', text: 'Déšť se sněhem' };
    return { kind: 'rain', text: precip < 0.5 ? 'Slabý déšť' : 'Déšť' };
  }
  const c = clouds ?? 0;
  if (c < 0.25) return { kind: night ? 'moon' : 'sun', text: c < 0.1 ? 'Jasno' : 'Skoro jasno' };
  if (c < 0.65) return { kind: night ? 'partlyNight' : 'partly', text: 'Polojasno' };
  if (c < 0.9) return { kind: 'cloud', text: 'Oblačno' };
  return { kind: 'cloud', text: 'Zataženo' };
}

/** Classify a whole day of ALADIN hours. */
export function classifyDay(hours) {
  const precip = hours.reduce((a, h) => a + h.precip, 0);
  const snow = hours.reduce((a, h) => a + h.precip * h.snowFraction, 0);
  const sf = precip > 0 ? snow / precip : 0;
  if (precip >= 0.3) {
    const light = precip < 2;
    if (sf >= 0.8) return { kind: 'snow', text: light ? 'Slabé sněžení' : 'Sněžení' };
    if (sf >= 0.2) return { kind: 'snow', text: 'Déšť se sněhem' };
    return { kind: 'rain', text: light ? 'Slabý déšť' : 'Déšť' };
  }
  const daytime = hours.filter((h) => h.localHour >= 8 && h.localHour <= 18);
  const pool = daytime.length ? daytime : hours;
  const c = pool.reduce((a, h) => a + (h.clouds ?? 0), 0) / pool.length;
  return classifyHour({ clouds: c, precip: 0, snowFraction: 0 }, false);
}

/** WMO weather code (Open-Meteo) → { kind, text } */
export function classifyWmo(code) {
  if (code === 0) return { kind: 'sun', text: 'Jasno' };
  if (code === 1) return { kind: 'sun', text: 'Skoro jasno' };
  if (code === 2) return { kind: 'partly', text: 'Polojasno' };
  if (code === 3) return { kind: 'cloud', text: 'Zataženo' };
  if (code === 45 || code === 48) return { kind: 'cloud', text: 'Mlha' };
  if (code >= 51 && code <= 57) return { kind: 'rain', text: 'Mrholení' };
  if (code === 61 || code === 80) return { kind: 'rain', text: 'Slabý déšť' };
  if (code === 66 || code === 67) return { kind: 'rain', text: 'Mrznoucí déšť' };
  if ([63, 65, 81, 82].includes(code)) return { kind: 'rain', text: 'Déšť' };
  if ([71, 77, 85].includes(code)) return { kind: 'snow', text: 'Slabé sněžení' };
  if ([73, 75, 86].includes(code)) return { kind: 'snow', text: 'Sněžení' };
  if (code >= 95) return { kind: 'rain', text: 'Bouřky' };
  return { kind: 'cloud', text: 'Oblačno' };
}

/** Apparent temperature (Australian BoM formula), wind in km/h. */
export function apparentTemp(t, rh, windKmh) {
  if (!Number.isFinite(t)) return null;
  if (!Number.isFinite(rh) || !Number.isFinite(windKmh)) return null;
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return t + 0.33 * e - 0.7 * (windKmh / 3.6) - 4.0;
}

// ---------- helpers ----------

const first = (...vals) => vals.find((v) => v !== null && v !== undefined && Number.isFinite(v)) ?? null;

function sunTimes(date, lat, lon) {
  return SunCalc.getTimes(date, lat, lon);
}

function isNightHour(time, lat, lon) {
  const { sunrise, sunset } = sunTimes(time, lat, lon);
  if (isNaN(sunrise) || isNaN(sunset)) return false;
  const end = new Date(time.getTime() + 3600_000);
  return time >= sunset || end <= sunrise;
}

// ---------- view model ----------

/**
 * @param {object} p
 * @param {Date} p.now
 * @param {string} p.timeZone
 * @param {number} p.lat
 * @param {number} p.lon
 * @param {string} p.locationName
 * @param {object|null} p.current      Home Assistant station values
 * @param {object|null} p.todayRange   observed {min,max} today from HA history
 * @param {object|null} p.aladin       parsed ALADIN forecast
 * @param {object|null} p.openMeteo    Open-Meteo supplement
 * @param {number} p.hoursCount
 * @param {number} p.daysCount
 * @param {string[]} p.errors
 */
export function buildModel(p) {
  const { now, timeZone: tz, lat, lon } = p;
  const nowL = local(now, tz);
  const errors = [...(p.errors || [])];

  // Annotate ALADIN hours with local time info.
  const aHours = (p.aladin?.hours || []).map((h) => {
    const l = local(h.time, tz);
    return { ...h, localHour: l.h, dayKey: l.dayKey, hourKey: l.hourKey };
  });

  const sunToday = sunTimes(now, lat, lon);
  const nightNow = isNightHour(new Date(Math.floor(now.getTime() / 3600_000) * 3600_000), lat, lon);

  // Current ALADIN hour (fallback values + condition)
  const curA = aHours.find((h) => h.hourKey === nowL.hourKey) || aHours[0] || null;

  // ---- current block ----
  const c = p.current || {};
  const temp = first(c.temperature, curA?.temp);
  const humidity = first(c.humidity, curA?.humidity);
  const wind = first(c.windSpeed, curA?.wind);
  const gust = first(c.windGust, curA?.gust);
  const bearing = first(c.windBearing, curA?.windDir);
  const pressure = first(c.pressure, curA?.pressure);
  const feels = first(
    c.feelsLike,
    Number.isFinite(c.temperature) ? apparentTemp(c.temperature, humidity, wind) : null,
    curA?.feels,
  );
  const cond = curA ? classifyHour(curA, nightNow) : { kind: 'cloud', text: '–' };

  // ---- today ----
  const todayA = aHours.filter((h) => h.dayKey === nowL.dayKey);
  const remainingToday = todayA.filter((h) => h.time.getTime() + 3600_000 > now.getTime());
  const omToday = p.openMeteo?.daily.get(nowL.dayKey);
  const temps = [
    ...remainingToday.map((h) => h.temp),
    c.temperature,
    p.todayRange?.min,
    p.todayRange?.max,
  ].filter(Number.isFinite);
  const todayHi = temps.length ? Math.max(...temps) : first(omToday?.hi);
  const todayLo = temps.length ? Math.min(...temps) : first(omToday?.lo);
  const rainRemaining = remainingToday.reduce((a, h) => a + h.precip, 0);
  const todayPrecip = remainingToday.length
    ? rainRemaining + (Number.isFinite(c.rainToday) ? c.rainToday : 0)
    : first(omToday?.precip);

  // ---- hourly strip ----
  const startIdx = Math.max(0, aHours.findIndex((h) => h.time.getTime() + 3600_000 > now.getTime()));
  const strip = aHours.slice(startIdx, startIdx + p.hoursCount);
  const COL_AREA = 684; // px; width of the hourly section in the 1200 px layout
  const colW = strip.length ? COL_AREA / strip.length : 0;
  const tVals = strip.map((h) => h.temp).filter(Number.isFinite);
  const tMin = Math.min(...tVals);
  const tMax = Math.max(...tVals);
  const mmMax = Math.max(1, ...strip.map((h) => h.precip));
  const hasProb = Boolean(p.openMeteo?.hourlyProb?.size);
  const hours = strip.map((h, i) => {
    const t = h.temp ?? tMin;
    const y = tMax > tMin ? 36 + ((tMax - t) / (tMax - tMin)) * 92 : 82;
    const night = isNightHour(h.time, lat, lon);
    const k = classifyHour(h, night);
    const prob = hasProb ? p.openMeteo.hourlyProb.get(h.hourKey) : undefined;
    const showProb = Number.isFinite(prob);
    return {
      hour: String(h.localHour).padStart(2, '0'),
      temp: deg(h.temp),
      x: i * colW + colW / 2,
      y,
      dotTop: Math.round(y - 7),
      labelTop: Math.round(y - 34),
      barH: Math.round((h.precip / mmMax) * 56),
      prob: showProb ? `${prob} %` : mm(h.precip),
      probStrong: showProb ? prob >= 30 : h.precip >= 0.1,
      night,
      current: i === 0,
      kind: k.kind,
    };
  });
  const points = hours.map((h) => `${h.x.toFixed(1)},${h.y.toFixed(1)}`).join(' ');

  // ---- days ----
  const days = [];
  for (let i = 1; i <= p.daysCount; i++) {
    // Same wall-clock time i days later; good enough to pick the local day.
    const date = new Date(now.getTime() + i * 86400_000);
    const key = local(date, tz).dayKey;
    const dh = aHours.filter((h) => h.dayKey === key);
    const om = p.openMeteo?.daily.get(key);
    let d = null;
    if (dh.length >= 20) {
      const k = classifyDay(dh);
      const peak = dh.reduce((a, h) => ((h.wind ?? 0) > (a.wind ?? 0) ? h : a), dh[0]);
      const precip = dh.reduce((a, h) => a + h.precip, 0);
      d = {
        hi: Math.max(...dh.map((h) => h.temp)),
        lo: Math.min(...dh.map((h) => h.temp)),
        precip,
        prob: om?.prob,
        wind: peak.wind,
        windDir: peak.windDir,
        ...k,
        source: 'ALADIN',
      };
    } else if (om) {
      d = { hi: om.hi, lo: om.lo, precip: om.precip, prob: om.prob, wind: om.wind, windDir: om.windDir, ...classifyWmo(om.code), source: 'Open-Meteo' };
    }
    if (!d) continue;
    days.push({
      name: weekday(date, tz),
      date: shortDate(date, tz),
      hi: deg(d.hi),
      lo: deg(d.lo),
      cond: d.text,
      kind: d.kind,
      rain: Number.isFinite(d.prob) ? `${mm(d.precip)} mm · ${d.prob} %` : `${mm(d.precip)} mm`,
      wind: Number.isFinite(d.wind) ? `${num(d.wind)} km/h ${windDir(d.windDir)}`.trim() : '',
      source: d.source,
    });
  }

  if (!p.aladin) errors.push('ALADIN nedostupný');

  return {
    location: p.locationName,
    date: longDate(now, tz),
    sunrise: isNaN(sunToday.sunrise) ? '–' : hhmm(sunToday.sunrise, tz),
    sunset: isNaN(sunToday.sunset) ? '–' : hhmm(sunToday.sunset, tz),
    updated: hhmm(p.current?.updatedAt || now, tz),
    errors,
    current: {
      temp: deg(temp, 1),
      kind: cond.kind,
      cond: cond.text,
      feels: deg(feels, 1),
      hi: deg(todayHi),
      lo: deg(todayLo),
      humidity: Number.isFinite(humidity) ? num(humidity) : '–',
      wind: Number.isFinite(wind) ? num(wind) : '–',
      gust: Number.isFinite(gust) ? num(gust) : null,
      windDir: windDir(bearing),
      pressure: Number.isFinite(pressure) ? num(pressure) : '–',
      rainToday: mm(c.rainToday),
    },
    today: { hi: deg(todayHi), lo: deg(todayLo), precip: mm(todayPrecip) },
    hours,
    points,
    hasProb,
    days,
    aladinRun: p.aladin ? hhmm(p.aladin.runTime, tz) : null,
  };
}
