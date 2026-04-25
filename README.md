<picture>
  <source media="(prefers-color-scheme: dark)" srcset="logos/motorisk-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="logos/motorisk-light.gif">
  <img src="logos/motorisk-light.gif" alt="motorisk" height="100">
</picture>

Route analysis tool for motorcyclists in Spain. Draw a route on the map and get an overlay of DGT high-risk segments, real road geometry via OSRM, weather conditions, and an elevation profile.

**Live at [motorisk.app](https://motorisk.app)**

## Screenshots

| Risk segments | Weather forecast |
|---|---|
| ![Risk segments](screenshots/risk.png) | ![Weather forecast](screenshots/weather.png) |

| Elevation profile | Route builder |
|---|---|
| ![Elevation profile](screenshots/elevation.png) | ![Themes](screenshots/themes.png) |

## What it does

**Risk segments** ingest DGT's official DATEX2 feed of high-risk motorcycle segments and store them in PostGIS. When you submit a route, a spatial intersection query (`ST_Intersects`) returns every flagged segment your route crosses, with road badge, province, and kilometrage.

**Real road geometry** snaps routes to actual roads via a self-hosted OSRM instance built from OpenStreetMap data covering mainland Spain and the Canary Islands, merged into a single routing graph. Waypoints snap to the nearest road on click. No straight lines between clicks.

**Route modes** let you bias each segment's geometry between speed and curvature. *Fast* uses OSRM's default driving profile, motorways included. *Balanced* and *Curvy* both exclude motorways and ask OSRM for three alternatives: *Balanced* picks the route with the best curvature-per-kilometre ratio (sinuous without taking the long way round), while *Curvy* picks the most sinuous one regardless of extra distance. Curvature is scored on the server as the sum of bearing deltas along the geometry, normalised by route length. If no non-motorway route exists, the request falls back to the direct one.

**Weather** samples the route at 50 km intervals and queries Open-Meteo for wind speed, precipitation, and visibility at each point. Supports forecast lookup up to 7 days ahead with per-hour resolution. Alert conditions (wind > 50 km/h, precipitation > 0.5 mm, visibility < 1 km) are flagged on both the map and the elevation profile.

**Elevation profile** samples the route geometry and queries the Open-Meteo Elevation API (Copernicus DEM GLO-90, 90 m resolution) to render an interactive profile chart with min/max altitude, cumulative gain, and weather alert markers.

## Route building

Routes are built waypoint by waypoint. Click the map or search for a place by name — each new point snaps to the nearest road and a new segment is fetched from OSRM. Waypoints can be dragged on the map to adjust the route, reordered in the sidebar by dragging the handle, or deleted individually. Inserting a stop between two existing waypoints is also supported, up to a maximum of 10 waypoints per route.

The search box uses [Photon](https://photon.komoot.io) for forward geocoding and reverse geocoding for human-readable names when dropping a pin. Keyboard navigation works throughout: arrow keys move through results, Enter selects, Escape cancels. Device geolocation is available via the location button in each slot.

A circular mode closes the route back to the starting point — useful for loop rides. The reverse button flips waypoint order and rebuilds all segments in parallel, so the map updates all at once rather than one segment at a time.

## Stack

| Layer | Tech |
|---|---|
| API | Go (`net/http`, no framework) |
| Spatial queries | PostgreSQL 17 + PostGIS 3.5 |
| Routing | OSRM (self-hosted, MLD algorithm) |
| Geocoding | Photon (Komoot, OpenStreetMap-based) |
| Road data | OpenStreetMap via Geofabrik |
| Risk data | DGT - Punto de Acceso Nacional (DATEX2) |
| Weather & elevation | Open-Meteo |
| Frontend | HTML + Leaflet.js (single file, no bundler) |
| Infrastructure | Docker Compose + nginx, hosted on Hetzner CX22 |

## Architecture

```
POST /route/segments   →  ST_Intersects(route, risk_segments) on PostGIS
POST /route/weather    →  Open-Meteo hourly/current forecast per sampled point
POST /route/elevation  →  Open-Meteo Elevation API (Copernicus DEM GLO-90)
POST /route/snap       →  OSRM nearest: snaps a point to the road network
POST /route/geometry   →  OSRM route: road geometry between two points
POST /route/geocode    →  Photon forward geocoding (place name to coordinates)
POST /route/reverse    →  Photon reverse geocoding (coordinates to place name)
GET  /health           →  liveness check
```

After the user draws a route, the frontend fires `/route/segments`, `/route/weather`, and `/route/elevation` in parallel via `Promise.all`. Road-snapping and geometry fetching go through the backend so OSRM is never exposed publicly. Open-Meteo responses are cached in an LRU memory cache (elevation: no expiry, weather: 10 min TTL, max 1000 entries) to avoid redundant requests.

## Spatial query

The core query. With a GiST index on `geom`, this runs in milliseconds across the full national dataset:

```sql
SELECT id, road, province, direction, length_m, pk_start, pk_end,
       ST_AsGeoJSON(geom)
FROM risk_segments
WHERE ST_Intersects(
    geom,
    ST_SetSRID(ST_GeomFromText($1), 4326)
);
```

## Running locally

### Prerequisites

- [Colima](https://github.com/abiosoft/colima) or Docker Desktop
- Go 1.22+
- [osmium-tool](https://osmcode.org/osmium-tool/) (`brew install osmium-tool`)

### 1. Clone and configure

```bash
git clone https://github.com/fran-soria/motorisk.git
cd motorisk
cp .env.example .env
# edit .env with your values
```

### 2. Start the database

```bash
docker compose up -d db
```

### 3. Set up OSRM

Download Spain and Canary Islands OSM data, merge them, then preprocess. The extract step requires ~14 GB of RAM and takes around 10-20 minutes.

```bash
mkdir -p osrm-data

curl -L -o osrm-data/spain-latest.osm.pbf \
  https://download.geofabrik.de/europe/spain-latest.osm.pbf

curl -L -o osrm-data/canary-islands-latest.osm.pbf \
  https://download.geofabrik.de/africa/canary-islands-latest.osm.pbf

osmium merge \
  osrm-data/spain-latest.osm.pbf \
  osrm-data/canary-islands-latest.osm.pbf \
  -o osrm-data/spain-full.osm.pbf

docker run --rm -v "$(pwd)/osrm-data:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/spain-full.osm.pbf

docker run --rm -v "$(pwd)/osrm-data:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/spain-full.osrm

docker run --rm -v "$(pwd)/osrm-data:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/spain-full.osrm
```

### 4. Start all services

```bash
docker compose up -d
```

### 5. Ingest DGT data

```bash
go run cmd/ingest/main.go
```

Fetches the current DATEX2 feed from DGT, does map matching via OSRM for each segment, and loads everything into PostGIS.

### 6. Start the API

```bash
go run cmd/server/main.go
```

### 7. Open the frontend

```bash
open web/index.html
```

## Environment variables

See `.env.example`:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://motorisk:motorisk@localhost:5432/motorisk` |
| `OSRM_URL` | OSRM server base URL | `http://192.168.64.2:5000` |
| `PORT` | API port | `8080` |
| `CORS_ORIGIN` | Allowed CORS origin | `*` (dev) or `https://motorisk.app` (prod) |

With Colima, the VM is typically accessible at `192.168.64.2` rather than `localhost`. Run `colima ls` to confirm.

## Data sources

- **DGT risk segments**: [Punto de Acceso Nacional](https://nap.dgt.es/dataset/tramos-de-elevado-riesgo-para-motocicletas), DATEX2, updated on occurrence
- **Road network**: [Geofabrik Spain](https://download.geofabrik.de/europe/spain.html) + [Canary Islands](https://download.geofabrik.de/africa/canary-islands.html), OpenStreetMap, ODbL
- **Geocoding**: [Photon](https://photon.komoot.io), OpenStreetMap, ODbL
- **Weather & elevation**: [Open-Meteo](https://open-meteo.com), free for non-commercial use

## Themes

Six colour themes based on iconic motorcycles, each referencing original factory paint:

| Theme | Reference | Mode |
|---|---|---|
| Ducati 916 | Rosso Corsa PPG 473.101 · 1994 | Dark |
| Laverda 750 SF | RAL 2008 · 1969 | Dark |
| Kawasaki H2R | Candy Lime Green 777 · 2015 | Dark |
| Suzuki GSX-R750 | Navy blue · 1986 | Light |
| Honda CB750 | Candy Ruby Red R4C · 1969 | Light |
| BMW M1000RR | M Motorsport · 2021 | Light |

## Security

nginx serves the app with a full set of security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy). The Leaflet scripts loaded from unpkg.com have SRI integrity hashes so any tampered file gets blocked by the browser. The API enforces a 30 req/min per-IP rate limit at the nginx layer and a 1 MB body size cap on all POST endpoints. CORS origin is configurable via `CORS_ORIGIN` so the production deployment only accepts requests from `motorisk.app`.

## Limitations

- DGT data covers the national road network only (excludes Catalonia and the Basque Country for most datasets).
- OSRM map matching uses the `car` profile, appropriate for motorcycles on paved roads.
- Weather sampling is at 50 km intervals; conditions between points are not interpolated.
- Elevation resolution is 90 m (Copernicus DEM GLO-90).

## License

MIT

*Data: DGT · Open-Meteo · OpenStreetMap contributors · Photon (Komoot)*

---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="logos/motorisk-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="logos/motorisk-light.gif">
  <img src="logos/motorisk-light.gif" alt="motorisk" height="100">
</picture>

Herramienta de análisis de rutas para motoristas en España. Traza una ruta en el mapa y obtén los tramos de alto riesgo de la DGT, la geometría real de la carretera vía OSRM, las condiciones meteorológicas y un perfil de elevación interactivo.

**En producción en [motorisk.app](https://motorisk.app)**

Ver sección Screenshots más arriba.

## Qué hace

**Tramos de riesgo** ingesta el feed DATEX2 oficial de la DGT de tramos de elevado riesgo para motocicletas y los almacena en PostGIS. Al enviar una ruta, una query de intersección espacial devuelve cada tramo señalizado que cruza tu ruta, con el nombre de la carretera, la provincia y el punto kilométrico.

**Geometría real de carretera** ajusta las rutas a carreteras reales mediante una instancia self-hosted de OSRM construida con datos de OpenStreetMap para la península y las Islas Canarias, fusionados en un único grafo de routing con osmium. Los waypoints se snapean a la carretera más cercana al hacer click. OSRM no está expuesto públicamente; el backend actúa como proxy.

**Modos de ruta** permiten elegir el compromiso entre rapidez y curvatura para cada segmento. *Rápida* usa el perfil de conducción por defecto de OSRM, autopistas incluidas. *Equilibrada* y *Curvas* excluyen autopista y piden tres alternativas a OSRM: *Equilibrada* se queda con la de mejor ratio curvatura/kilómetro (sinuosa sin alargarse de más), mientras que *Curvas* elige la más sinuosa en absoluto, independientemente de la distancia extra. La curvatura se calcula en el servidor como la suma de variaciones de rumbo a lo largo de la geometría, normalizada por la longitud de la ruta. Si no existe alternativa sin autopista, se cae a la ruta directa.

**Construcción de rutas** funciona punto a punto: cada waypoint puede añadirse haciendo click en el mapa o buscando un lugar por nombre mediante geocodificación con Photon. Los waypoints se pueden reordenar arrastrando, borrar individualmente, o editar para insertar una parada intermedia, hasta un máximo de 10 por ruta. El modo circular cierra la ruta sobre el punto de origen. El botón de invertir reconstruye todos los segmentos en paralelo.

**Meteorología** muestrea la ruta cada 50 km y consulta Open-Meteo para obtener velocidad del viento, precipitación y visibilidad. Permite consultar el forecast hasta 7 días vista con resolución horaria. Las alertas se marcan en el mapa y en el perfil de elevación.

**Perfil de elevación** muestrea la geometría de la ruta y consulta la API de elevación de Open-Meteo (Copernicus DEM GLO-90, resolución 90 m) para renderizar un gráfico interactivo con altitud mínima/máxima, desnivel acumulado y marcadores de alertas meteorológicas.

## Ejecutar en local

Ver la versión en inglés para instrucciones completas. Variables de entorno en `.env.example`.

## Fuentes de datos

- **Tramos de riesgo DGT**: [Punto de Acceso Nacional](https://nap.dgt.es/dataset/tramos-de-elevado-riesgo-para-motocicletas), DATEX2
- **Red viaria**: [Geofabrik España](https://download.geofabrik.de/europe/spain.html) + [Canarias](https://download.geofabrik.de/africa/canary-islands.html), OpenStreetMap, ODbL
- **Geocodificación**: [Photon](https://photon.komoot.io), OpenStreetMap, ODbL
- **Meteorología y elevación**: [Open-Meteo](https://open-meteo.com)
