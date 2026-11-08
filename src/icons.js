// Stroke icons from the design (48×48 grid). `bg` fills the cloud so it
// covers the sun/moon behind it.

const SUN = '<circle cx="24" cy="24" r="8"></circle><path d="M24 4v5M24 39v5M4 24h5M39 24h5M9.9 9.9l3.5 3.5M34.6 34.6l3.5 3.5M9.9 38.1l3.5-3.5M34.6 13.4l3.5-3.5"></path>';
const MOON = '<path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z"></path>';
const SMALL_SUN = '<circle cx="18" cy="17" r="6"></circle><path d="M18 4v3M5 17h3M8.8 7.8l2.1 2.1M27.2 7.8l-2.1 2.1"></path>';
const SMALL_MOON = '<path d="M16 5a10 10 0 1 0 12 13A8 8 0 0 1 16 5z"></path>';
const PARTLY_CLOUD = (bg) => `<path d="M18 41h17a7 7 0 0 0 1-14 10 10 0 0 0-18.5-1.5A8 8 0 0 0 18 41z" fill="${bg}"></path>`;
const CLOUD = '<path d="M14 36h20a8 8 0 0 0 1-16 11 11 0 0 0-20.5-1.5A9 9 0 0 0 14 36z"></path>';
const RAIN = '<path d="M14 30h20a8 8 0 0 0 1-16 11 11 0 0 0-20.5-1.5A9 9 0 0 0 14 30z"></path><path d="M17 35l-2 6M25 35l-2 6M33 35l-2 6"></path>';
const SNOW = '<path d="M14 30h20a8 8 0 0 0 1-16 11 11 0 0 0-20.5-1.5A9 9 0 0 0 14 30z"></path><path d="M16 36v0M24 39v0M32 36v0M20 44v0M28 44v0" stroke-width="4"></path>';

const BODY = {
  sun: () => SUN,
  moon: () => MOON,
  partly: (bg) => SMALL_SUN + PARTLY_CLOUD(bg),
  partlyNight: (bg) => SMALL_MOON + PARTLY_CLOUD(bg),
  cloud: () => CLOUD,
  rain: () => RAIN,
  snow: () => SNOW,
};

export function weatherIcon(kind, size, strokeWidth, bg = '#FFFFFF') {
  const body = (BODY[kind] || BODY.cloud)(bg);
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Horizontal battery outline whose fill follows `pct` (0–100). */
export function batteryIcon(pct, color) {
  const w = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 22);
  return `<svg viewBox="0 0 34 18" width="34" height="18" fill="none" aria-hidden="true">`
    + `<rect x="1.5" y="1.5" width="28" height="15" rx="3" stroke="${color}" stroke-width="2.5"></rect>`
    + `<rect x="31" y="6" width="2.5" height="6" rx="1" fill="${color}"></rect>`
    + (w > 0 ? `<rect x="4.5" y="4.5" width="${w}" height="9" rx="1" fill="${color}"></rect>` : '')
    + `</svg>`;
}

export const SUNRISE = '<svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" role="img" aria-label="Východ slunce"><path d="M8 36h32M14 36a10 10 0 0 1 20 0M24 10v8M18 14l6-6 6 6"></path></svg>';
export const SUNSET = '<svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" role="img" aria-label="Západ slunce"><path d="M8 36h32M14 36a10 10 0 0 1 20 0M24 8v10M18 12l6 6 6-6"></path></svg>';
