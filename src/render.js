// Server-side HTML for the 1200×825 e-ink dashboard (3-bit grayscale palette).
// No client-side JS: works on simple e-reader browsers and headless screenshotters.
import { escapeHtml as e } from './format.js';
import { weatherIcon, SUNRISE, SUNSET } from './icons.js';

const BARLOW = "font-family: 'Barlow Semi Condensed', Inter, sans-serif";
const LABEL = 'font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #B6B6B6';
const VALUE = `${BARLOW}; font-size: 30px; font-weight: 600; white-space: nowrap`;

function stat(label, valueHtml) {
  return `<div style="display: flex; flex-direction: column; gap: 2px"><span style="${LABEL}">${label}</span><span style="${VALUE}">${valueHtml}</span></div>`;
}

function header(m) {
  const status = m.errors.length
    ? `<span style="font-size: 16px; font-weight: 700; color: #000000">${e(m.errors.join(' · '))}</span>`
    : `<span style="font-size: 16px; font-weight: 500; color: #6D6D6D">Aktualizováno ${e(m.updated)}</span>`;
  return `
<header style="height: 64px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #000000; box-sizing: border-box; padding-bottom: 12px">
  <div style="display: flex; align-items: baseline; gap: 16px">
    <h1 style="margin: 0; font-size: 34px; font-weight: 700; letter-spacing: -0.5px">${e(m.location)}</h1>
    <span style="font-size: 22px; font-weight: 500; color: #494949">${e(m.date)}</span>
  </div>
  <div style="display: flex; align-items: center; gap: 28px; font-size: 20px; font-weight: 600">
    <span style="display: flex; align-items: center; gap: 8px">${SUNRISE}${e(m.sunrise)}</span>
    <span style="display: flex; align-items: center; gap: 8px">${SUNSET}${e(m.sunset)}</span>
    ${status}
  </div>
</header>`;
}

function current(m) {
  const c = m.current;
  const wind = `${e(c.wind)} <span style="font-size: 18px">km/h</span>${
    c.gust ? ` <span style="font-size: 18px; color: #B6B6B6">nárazy ${e(c.gust)}</span>` : ''
  }`;
  return `
<section style="width: 420px; flex: none; box-sizing: border-box; padding: 28px; background: #000000; color: #FFFFFF; border-radius: 8px; display: flex; flex-direction: column; gap: 20px">
  <div style="display: flex; align-items: center; gap: 16px">
    ${weatherIcon(c.kind, 108, 2.6, '#000000')}
    <div style="${BARLOW}; font-size: 116px; font-weight: 600; line-height: 1; letter-spacing: -2px; white-space: nowrap">${e(c.temp)}</div>
  </div>
  <div style="display: flex; flex-direction: column; gap: 4px; border-bottom: 2px solid #494949; padding-bottom: 16px">
    <div style="font-size: 26px; font-weight: 600">${e(c.cond)}</div>
    <div style="font-size: 19px; font-weight: 500; color: #B6B6B6">Pocitově ${e(c.feels)} · Max ${e(c.hi)} · Min ${e(c.lo)}</div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; row-gap: 14px">
    ${stat('Vlhkost', `${e(c.humidity)} %`)}
    ${stat(`Vítr${c.windDir ? ` · ${e(c.windDir)}` : ''}`, wind)}
    ${stat('Tlak', `${e(c.pressure)} <span style="font-size: 18px">hPa</span>`)}
    ${stat('Srážky dnes', `${e(c.rainToday)} <span style="font-size: 18px">mm</span>`)}
  </div>
</section>`;
}

function hourCol(h) {
  const bg = h.night ? '#DBDBDB' : '#FFFFFF';
  const hourStyle = h.current ? 'background: #000000; color: #FFFFFF' : 'background: transparent; color: #000000';
  return `
<div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; background: ${bg}">
  <div style="height: 34px; display: flex; align-items: center">
    <span style="font-size: 16px; font-weight: 700; padding: 2px 5px; border-radius: 4px; ${hourStyle}">${e(h.hour)}</span>
  </div>
  <div style="height: 40px; display: flex; align-items: center; justify-content: center; color: #000000">${weatherIcon(h.kind, 30, 3.5, bg)}</div>
  <div style="height: 140px; width: 100%; position: relative">
    <span style="position: absolute; left: 0; right: 0; top: ${h.labelTop}px; text-align: center; ${BARLOW}; font-size: 22px; font-weight: 700">${e(h.temp)}</span>
    <span style="position: absolute; left: 50%; top: ${h.dotTop}px; width: 10px; height: 10px; margin-left: -7px; border: 2px solid #000000; border-radius: 50%; background: #FFFFFF; z-index: 2"></span>
  </div>
  <div style="height: 64px; width: 100%; display: flex; align-items: flex-end; justify-content: center; border-bottom: 2px solid #000000">
    <span style="width: 18px; height: ${h.barH}px; background: #494949"></span>
  </div>
  <div style="height: 30px; display: flex; align-items: center; font-size: 15px; font-weight: 600; color: ${h.probStrong ? '#000000' : '#6D6D6D'}">${e(h.prob)}</div>
</div>`;
}

function hourly(m) {
  const body = m.hours.length
    ? `<div style="position: relative; display: flex; border-top: 2px solid #000000; border-bottom: 2px solid #000000">
    ${m.hours.map(hourCol).join('')}
    <svg viewBox="0 0 684 140" width="100%" height="140" preserveAspectRatio="none" style="position: absolute; left: 0; top: 74px; z-index: 1; pointer-events: none" aria-hidden="true"><polyline points="${m.points}" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline></svg>
  </div>`
    : `<div style="height: 312px; display: flex; align-items: center; justify-content: center; border-top: 2px solid #000000; border-bottom: 2px solid #000000; font-size: 20px; font-weight: 600; color: #494949">Předpověď ALADIN není k dispozici</div>`;
  return `
<section style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 12px">
  <div style="height: 36px; display: flex; align-items: baseline; justify-content: space-between">
    <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase">Dnes</h2>
    <span style="font-size: 18px; font-weight: 500; color: #494949">Max ${e(m.today.hi)} · Min ${e(m.today.lo)} · Srážky ${e(m.today.precip)} mm</span>
  </div>
  ${body}
  <div style="display: flex; gap: 24px; font-size: 14px; font-weight: 500; color: #494949">
    <span style="display: flex; align-items: center; gap: 6px"><span style="width: 12px; height: 12px; background: #494949"></span>Srážky v mm (sloupec)</span>
    <span>${m.hasProb ? '% pravděpodobnost srážek' : 'mm srážek za hodinu'}</span>
    <span style="display: flex; align-items: center; gap: 6px"><span style="width: 12px; height: 12px; background: #DBDBDB; border: 1px solid #929292"></span>Po západu slunce</span>
    ${m.aladinRun ? `<span style="margin-left: auto">ALADIN ${e(m.aladinRun)}</span>` : ''}
  </div>
</section>`;
}

function dayCard(d) {
  return `
<div style="box-sizing: border-box; border: 2px solid #000000; border-radius: 8px; padding: 18px 20px; display: flex; flex-direction: column; justify-content: space-between">
  <div style="display: flex; align-items: baseline; justify-content: space-between">
    <span style="font-size: 24px; font-weight: 700">${e(d.name)}</span>
    <span style="font-size: 17px; font-weight: 500; color: #6D6D6D">${e(d.date)}</span>
  </div>
  <div style="display: flex; align-items: center; gap: 14px">
    <div style="color: #000000; display: flex">${weatherIcon(d.kind, 64, 3, '#FFFFFF')}</div>
    <div style="display: flex; flex-direction: column; min-width: 0">
      <span style="${BARLOW}; font-size: 48px; font-weight: 600; line-height: 1; white-space: nowrap">${e(d.hi)}<span style="font-size: 30px; color: #6D6D6D"> / ${e(d.lo)}</span></span>
      <span style="font-size: 17px; font-weight: 600; color: #242424">${e(d.cond)}</span>
    </div>
  </div>
  <div style="display: flex; justify-content: space-between; border-top: 2px solid #B6B6B6; padding-top: 10px; font-size: 16px; font-weight: 600; color: #242424">
    <span>${e(d.rain)}</span>
    <span>${e(d.wind)}</span>
  </div>
</div>`;
}

export function renderPage(m, { refreshSeconds }) {
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1200">
${refreshSeconds > 0 ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ''}
<title>Počasí · ${e(m.location)}</title>
<link rel="stylesheet" href="fonts.css">
<style>
html, body { margin: 0; background: #FFFFFF; }
* { -webkit-font-smoothing: antialiased; }
</style>
</head>
<body>
<div style="width: 1200px; height: 825px; box-sizing: border-box; padding: 32px; background: #FFFFFF; color: #000000; font-family: Inter, system-ui, sans-serif; display: flex; flex-direction: column; gap: 24px; overflow: hidden">
${header(m)}
<div style="height: 420px; display: flex; gap: 32px">
${current(m)}
${hourly(m)}
</div>
<section style="height: 229px; display: grid; grid-template-columns: repeat(${Math.max(1, m.days.length)}, minmax(0, 1fr)); gap: 24px">
${m.days.map(dayCard).join('')}
</section>
</div>
</body>
</html>`;
}
