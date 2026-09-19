# OSM POTA Map

An interactive Leaflet map for Parks on the Air (POTA). The map shows POTA
features from OpenStreetMap (OSM) through the configured Overpass server and
adds a separate catalogue layer for active POTA parks that do not yet have an
OSM POTA reference.

## Map layers and data precedence

- **OpenStreetMap:** OSM geometries and markers tagged with
  `communication:amateur_radio:pota` are displayed in the regular marker layer.
- **POTA status:** The server downloads the POTA CSV and uses its `active` field
  to label mapped OSM features. Inactive parks remain visible because they may
  be reactivated in the future, but use muted styling and an explicit inactive
  status in their popups.
- **Unmapped POTA catalogue:** The server compares active CSV park references
  with the complete OSM reference index. Only active parks whose references are
  absent from OSM are returned, using the coordinates in the CSV. The map links
  to OSM so contributors can add the missing reference.
- Overpass clusters use a green style. Inactive OSM parks use muted gray or
  amber styling, while unmapped catalogue markers and their clusters use a red
  style in a separate Leaflet layer. The catalogue remains visible at every
  zoom level while the current bounding box is within the query limit. OSM
  results always take precedence, including when the matching OSM park is
  outside the current map view.

The CSV is not written into the replicated Overpass database. The server loads
it on startup and refreshes it nightly at 02:00 UTC. The OSM reference index is
refreshed when needed, with a one-minute freshness window. If a refresh fails,
the last good CSV remains available; the server fails closed when it cannot
confirm OSM references, to avoid displaying duplicate parks. The status data is
served by `/api/pota/status` as a compact set of currently inactive references.
The browser requests official CSV names for the POTA references in the current
OSM view through `/api/pota/names`, and uses those names in mapped-feature
popups. `/api/pota/unmapped` remains restricted to active parks only. An OSM
reference that is not present in the current CSV is left visible with its OSM
name and no inactive label, because the catalogue cannot confirm its status.

## Query limits

The map and `/api/pota/unmapped` endpoint enforce a maximum visible bounding
box area of 50,000,000 km². Zoom in when the map reports that the area is too
large. There is no feature-count cap; very dense views can take longer to
download and render.

## Run locally

Requirements: Node.js 22 or later.

```sh
npm ci
npm start
```

Open <http://localhost:3000>. To build and run the same Node.js application in
a container:

```sh
docker build -t osm-pota-map .
docker run --rm -p 3000:3000 osm-pota-map
```

## Configuration

The server accepts these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OVERPASS_URL` | `https://overpass.ea7klk.es/api/interpreter` | Overpass endpoint used by the map and OSM reference index. |
| `POTA_CSV_URL` | `https://pota.app/all_parks_ext.csv` | POTA park catalogue CSV. |
| `POTA_CSV_REFRESH_MS` | 24 hours | CSV cache freshness fallback. The scheduled refresh runs at the configured UTC hour. |
| `POTA_CSV_REFRESH_HOUR_UTC` | `2` | UTC hour for the nightly CSV refresh. |
| `POTA_OSM_REFERENCE_REFRESH_MS` | 60,000 ms | OSM reference index freshness window. |
| `MATOMO_ENABLED` | `false` | Enables Matomo tracking when set to `true`. |
| `MATOMO_URL` | empty | Matomo base URL. |
| `MATOMO_SITE_ID` | empty | Matomo site ID. |

## Production build and deployment

The production image is built and pushed by the GitHub Actions workflow in
`.github/workflows/docker-build.yml`. Pushing a branch named
`release/vX.Y.Z` builds and publishes a multi-architecture image to GHCR and
creates the matching GitHub release.

The deployment is managed by Fleet from `fleet/potamap/resources.yaml`. After a
successful build, update the image there to the immutable GHCR digest and merge
or push that manifest change to `main`. Fleet then rolls out the new image. The
Deployment uses two replicas with `maxUnavailable: 0`, `maxSurge: 1`, readiness
checks, and a ten-second minimum ready time so existing pods remain available
while replacements become ready. Both replicas currently target the
`spainip-k3s` node.

## Development checks

Run the test suite with:

```sh
npm test
```

The multilingual OSM/POTA guides are maintained as Markdown in `docs/` and
rendered as static pages in `help/`. After editing a guide, regenerate the web
pages with:

```sh
npm run build:guides
```

The guide renderer uses the Node.js runtime already present in the app.

## Contributing

Contributions to improve the map data are welcome. See the [multilingual guide
to adding a POTA reference to OpenStreetMap](docs/adding-pota-reference-to-osm.md)
and its Spanish, English, German, Italian, and French examples.

## Credits

Created by Volker Kerkhoff, EA7KLK. Map data is provided by OpenStreetMap and
the POTA park catalogue; mapping uses Leaflet.
