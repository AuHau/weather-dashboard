// All configuration comes from environment variables (see README / .env.example).

function str(name, def = '') {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? def : v.trim();
}

function num(name, def) {
  const v = str(name);
  if (v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number, got "${v}"`);
  return n;
}

function bool(name, def) {
  const v = str(name).toLowerCase();
  if (v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v);
}

export const USER_AGENT = 'weather-dashboard/1.0 (+https://github.com/AuHau/weather-dashboard)';

export const config = {
  port: num('PORT', 8080),

  ha: {
    url: str('HA_URL').replace(/\/+$/, ''),
    token: str('HA_TOKEN'),
    // Optional: device id or device name of the weather station. Its sensors are
    // discovered automatically by device_class; the explicit entity ids below win.
    device: str('HA_WEATHER_STATION_DEVICE'),
    entities: {
      temperature: str('HA_TEMPERATURE_ENTITY'),
      humidity: str('HA_HUMIDITY_ENTITY'),
      pressure: str('HA_PRESSURE_ENTITY'),
      windSpeed: str('HA_WIND_SPEED_ENTITY'),
      windGust: str('HA_WIND_GUST_ENTITY'),
      windBearing: str('HA_WIND_BEARING_ENTITY'),
      rainToday: str('HA_RAIN_TODAY_ENTITY'),
      feelsLike: str('HA_FEELS_LIKE_ENTITY'),
    },
    // Use the temperature sensor history to get today's observed min/max.
    useHistory: bool('HA_USE_HISTORY', true),
  },

  // Location. Defaults to the Home Assistant home location.
  latitude: str('LATITUDE') === '' ? null : num('LATITUDE'),
  longitude: str('LONGITUDE') === '' ? null : num('LONGITUDE'),
  locationName: str('LOCATION_NAME'),
  timeZone: str('TZ', 'Europe/Prague'),

  aladin: {
    url: str('ALADIN_URL', 'https://aladinonline.oblacno.cz/get_data.php'),
    cacheMinutes: num('ALADIN_CACHE_MINUTES', 30),
  },

  // Open-Meteo fills what ALADIN does not have: precipitation probability and
  // the days beyond ALADIN's ~54 h horizon.
  openMeteo: {
    enabled: bool('OPEN_METEO_ENABLED', true),
    url: str('OPEN_METEO_URL', 'https://api.open-meteo.com/v1/forecast'),
    cacheMinutes: num('OPEN_METEO_CACHE_MINUTES', 60),
  },

  // How often the page reloads itself in the browser (0 = never).
  refreshSeconds: num('REFRESH_SECONDS', 300),
  // How long Home Assistant states are cached on the server.
  haCacheSeconds: num('HA_CACHE_SECONDS', 60),
  hours: num('FORECAST_HOURS', 16),
  days: num('FORECAST_DAYS', 4),
};
