# OSM POTA Map

An interactive Leaflet map for Parks on the Air (POTA). The map shows POTA
features from OpenStreetMap (OSM) through the configured Overpass server and
adds a separate catalogue layer for active POTA parks that do not yet have an
OSM POTA reference. POTA data is requested directly from the external POTA
services; this application only serves the static web application and its
runtime configuration.

## Map layers and data precedence

- **OpenStreetMap:** OSM geometries and markers tagged with
  `communication:amateur_radio:pota` are displayed in the regular marker layer.
- **Unmapped POTA catalogue:** The external POTA service returns active parks
  whose references are not mapped in OSM, using the coordinates in the POTA
  catalogue. The map links to OSM so contributors can add the missing reference.
- **Current POTA spots:** A blue antenna layer shows spots in the current map
  view. The collapsible **POTA Spots** panel lists all current spots, newest
  first; clicking a reference centers the map on that spot at zoom level 9.
- Overpass clusters use a green style, while unmapped catalogue markers and
  their clusters use a red style in a separate Leaflet layer. The catalogue
  remains visible at every zoom level while the current bounding box is within
  the query limit. OSM results always take precedence, including when the
  matching OSM park is outside the current map view.

The browser requests official POTA names for references in the current OSM view,
active unmapped parks for the current map bounds, and current spots directly
from the configured external endpoints. An OSM reference that is not returned
by the names service is left visible with its OSM name.

## Query limits

The map enforces a maximum visible bounding-box area of 50,000,000 km² before
requesting the external bounds-based services. Zoom in when the map reports
that the area is too large. There is no feature-count cap; very dense views can
take longer to download and render.

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
| `OVERPASS_URL` | `https://api.spainip.es/v1/overpass/interpreter` | External Overpass endpoint used by the map. |
| `POTA_CATALOGUE_URL` | `https://api.spainip.es/v1/pota/unmapped` | External active, unmapped-park endpoint. |
| `POTA_NAMES_URL` | `https://api.spainip.es/v1/pota/names` | External official-name endpoint. |
| `POTA_SPOTS_URL` | `https://api.spainip.es/v1/pota/spots` | External current-spots endpoint. |
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
