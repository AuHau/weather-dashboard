// Czech formatting + timezone helpers.

const partsCache = new Map();

function fmt(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** Local wall-clock parts of `date` in `timeZone`. */
export function local(date, timeZone) {
  const p = Object.fromEntries(fmt(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    h: +p.hour,
    min: +p.minute,
    s: +p.second,
    dayKey: `${p.year}-${p.month}-${p.day}`,
    hourKey: `${p.year}-${p.month}-${p.day}T${p.hour}`,
  };
}

/** Start of the local day containing `date`, as a Date. */
export function startOfLocalDay(date, timeZone) {
  const l = local(date, timeZone);
  return new Date(date.getTime() - ((l.h * 60 + l.min) * 60 + l.s) * 1000 - date.getMilliseconds());
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function weekday(date, timeZone) {
  return cap(new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', timeZone }).format(date));
}

/** "Neděle 8. listopadu" */
export function longDate(date, timeZone) {
  const dm = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', timeZone }).format(date);
  return `${weekday(date, timeZone)} ${dm}`;
}

/** "9. 11." */
export function shortDate(date, timeZone) {
  const l = local(date, timeZone);
  return `${l.d}. ${l.m}.`;
}

export function hhmm(date, timeZone) {
  const l = local(date, timeZone);
  return `${String(l.h).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`;
}

/** Czech number: decimal comma, real minus sign. */
export function num(v, decimals = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  let s = v.toFixed(decimals);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); // no "−0"
  return s.replace('.', ',').replace('-', '−');
}

export const deg = (v, decimals = 0) => (Number.isFinite(v) ? `${num(v, decimals)}°` : '–');

/** Precipitation amount: one decimal below 10 mm, else whole. */
export const mm = (v) => (Number.isFinite(v) ? num(v, v >= 10 ? 0 : 1) : '–');

const DIRS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
/** Meteorological bearing (direction wind comes FROM) → Czech 8-point abbreviation. */
export function windDir(bearing) {
  if (!Number.isFinite(bearing)) return '';
  return DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
