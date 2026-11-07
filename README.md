# weather-dashboard

A 1200 × 825 px weather dashboard for 3-bit grayscale e-ink displays (8 gray levels, no dithering needed). The page is in Czech.

- **Current conditions** come from your weather station in **Home Assistant**.
- **Forecast** comes from **ALADIN**, the Czech Hydrometeorological Institute's (ČHMÚ) regional model. It uses the JSON endpoint behind the *Aladin Online* app, which serves the latest ALADIN CZ run for a single point, hour by hour, about 54 hours ahead.
- **Open-Meteo** (optional, on by default) fills what ALADIN doesn't provide: precipitation probability and the daily cards beyond ALADIN's ~2-day range. Each daily card uses ALADIN when ALADIN covers at least 20 hours of that day.

The page is rendered on the server as plain HTML with no client-side JavaScript. Fonts are self-hosted, so it also works on simple e-reader browsers and headless screenshot tools. The page reloads itself every `REFRESH_SECONDS`.

## Run

```bash
docker run -d --name weather-dashboard -p 8080:8080 \
  -e HA_URL=http://homeassistant.local:8123 \
  -e HA_TOKEN=<long-lived token> \
  -e HA_WEATHER_STATION_DEVICE="<device name or id>" \
  ghcr.io/auhau/weather-dashboard:latest
```

Then open `http://<host>:8080/` for the HTML page, or point the display at `http://<host>:8080/image.png`. To see the resolved entities and the computed data, open `/api/data`.

Create the token in Home Assistant under *Profile → Security → Long-lived access tokens*.

## PNG for e-ink displays

`GET /image.png` returns a 1200 × 825 8-bit grayscale PNG. A headless Chromium inside the container takes the screenshot. Every pixel is then snapped to evenly spaced gray levels with no dithering. With the default 8 levels these are exactly the design palette (`#000000`, `#242424` … `#FFFFFF`), so only anti-aliased edges change.

Renders are cached for `PNG_CACHE_SECONDS`. A fresh render takes about 1–2 s; a cached one is instant.

Query parameters override the env defaults for a single request:

| Parameter | Env | Default | |
|---|---|---|---|
| `levels` | `PNG_GRAY_LEVELS` | `8` | gray levels: `8` = 3-bit, `16` = 4-bit, `4` = 2-bit, `2` = black/white, `256` = no quantization |
| `rotate` | `PNG_ROTATE` | `0` | clockwise rotation: `0`, `90`, `180`, `270` (portrait-mounted panels) |
| `invert` | `PNG_INVERT` | `false` | invert the image |

Example: `/image.png?rotate=90&levels=2`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `HA_URL` | – | Home Assistant base URL |
| `HA_TOKEN` | – | Long-lived access token |
| `HA_WEATHER_STATION_DEVICE` | – | Device name or id of the weather station. Its sensors are matched by `device_class`, and indoor sensors are ignored |
| `HA_TEMPERATURE_ENTITY` | auto | Outdoor temperature |
| `HA_HUMIDITY_ENTITY` | auto | Outdoor humidity |
| `HA_PRESSURE_ENTITY` | auto | Pressure (relative/sea-level preferred) |
| `HA_WIND_SPEED_ENTITY` | auto | Wind speed |
| `HA_WIND_GUST_ENTITY` | auto | Wind gust |
| `HA_WIND_BEARING_ENTITY` | auto | Wind direction (degrees or compass) |
| `HA_RAIN_TODAY_ENTITY` | auto | Daily rain total |
| `HA_FEELS_LIKE_ENTITY` | auto | Feels-like temperature. If none is found, it is computed |
| `HA_USE_HISTORY` | `true` | Include today's observed min/max (from HA history) in today's Max/Min |
| `HA_CACHE_SECONDS` | `60` | Cache for HA states |
| `LATITUDE` / `LONGITUDE` | HA home | Forecast location |
| `LOCATION_NAME` | HA location name | Title in the header |
| `TZ` | `Europe/Prague` | Time zone |
| `REFRESH_SECONDS` | `300` | Page auto-reload interval (`0` = off) |
| `FORECAST_HOURS` | `16` | Columns in the hourly strip |
| `FORECAST_DAYS` | `4` | Daily cards |
| `ALADIN_URL` | `https://aladinonline.oblacno.cz/get_data.php` | ALADIN point-forecast endpoint |
| `ALADIN_CACHE_MINUTES` | `30` | |
| `OPEN_METEO_ENABLED` | `true` | Set `false` to use ALADIN only. The hourly strip then shows mm instead of % |
| `OPEN_METEO_CACHE_MINUTES` | `60` | |
| `PNG_GRAY_LEVELS` / `PNG_ROTATE` / `PNG_INVERT` | `8` / `0` / `false` | PNG defaults (see above) |
| `PNG_CACHE_SECONDS` | `60` | How long a rendered PNG is reused |
| `CHROMIUM_PATH` | `/usr/bin/chromium-browser` in the image | Chromium used for PNG rendering (outside Docker, a local Chrome is found automatically) |
| `PORT` | `8080` | |

Explicit `HA_*_ENTITY` variables override auto-discovery. Units are converted from each sensor's `unit_of_measurement` (°F, m/s, mph, inHg, in, …).

If Home Assistant is unreachable, the current-conditions block falls back to the ALADIN values for the current hour, and the header shows the error.

## Development

```bash
npm install
cp .env.example .env   # edit
node --env-file=.env src/server.js
npm test
```

## Docker image

`.github/workflows/docker.yml` runs the tests, then builds a multi-arch image (`linux/amd64`, `linux/arm64`) and pushes it to `ghcr.io/<owner>/<repo>`:

- pushes to `master` publish `latest` and `sha-<short>`
- `v*` tags publish semver tags
- pull requests only build
