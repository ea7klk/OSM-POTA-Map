# POTA (Parks on the Air) Map

## Project Overview

This project provides an interactive web-based map for POTA (Parks on the Air) locations, designed for amateur radio enthusiasts. It allows users to explore and find Parks on the Air for their amateur radio operations.

## Features

- Interactive map displaying POTA locations
- Nearby markers grouped into clusters at lower zoom levels
- Separate layer for parks in the POTA catalogue that are not linked to OSM
- Utilizes OpenStreetMap data
- User location feature
- Mobile-responsive design

## Technology Stack

- HTML5
- CSS3
- JavaScript
- Leaflet.js for map functionality
- OpenStreetMap for map data
- Docker for containerization
- Nginx as the web server

## Building and Running with Docker

To build and run this application using Docker, follow these steps:

1. Ensure you have Docker installed on your system.

2. Clone the repository:
   ```
   git clone https://github.com/your-username/OSM-POTA-Map.git
   cd OSM-POTA-Map
   ```

3. Build the Docker image:
   ```
   docker build -t osm-pota-map .
   ```

4. Run the Docker container:
   ```
   docker run -d -p 8080:80 --name osm-pota-map-container osm-pota-map
   ```

   This command runs the container in detached mode (-d), maps port 8080 on your host to port 80 in the container (-p 8080:80), and names the container "osm-pota-map-container".

5. Access the application by opening a web browser and navigating to `http://localhost:8080`.

## Environment Variables

The application uses the following optional environment variables:

- `OVERPASS_URL`: The Overpass API interpreter endpoint. It defaults to
  `https://overpass.ea7klk.es/api/interpreter`.
- `POTA_CSV_URL`: POTA park catalogue CSV URL. It defaults to
  `https://pota.app/all_parks_ext.csv`.
- `POTA_CSV_REFRESH_MS`: CSV cache refresh period in milliseconds. Defaults to
  24 hours as a freshness fallback.
- `POTA_CSV_REFRESH_HOUR_UTC`: Hour of day in UTC for the scheduled CSV refresh.
  Defaults to 02:00 UTC.
- `POTA_OSM_REFERENCE_REFRESH_MS`: Refresh period for the complete set of POTA
  references tagged in OSM. Defaults to one minute.
- `MATOMO_URL`: The URL of your Matomo analytics instance.
- `MATOMO_SITE_ID`: The site ID for your application in Matomo.

To set these variables when running the Docker container, use the `-e` flag:

```
docker run -d -p 8080:80 -e MATOMO_URL="https://your-matomo-url.com/" -e MATOMO_SITE_ID="2" --name osm-pota-map-container osm-pota-map
```

## Usage

- Pan and zoom the map to explore POTA locations
- Click a cluster to zoom in; click an individual marker to view its POTA site details
- Use the layer control to show or hide OSM features and POTA catalogue
  candidates independently
- Use the locate control to find your current position on the map

## POTA catalogue layer

The map server downloads the POTA CSV into an in-memory catalogue and requests
the complete set of `communication:amateur_radio:pota` references from the
configured Overpass server. Its `/api/pota/unmapped` endpoint returns only CSV
parks whose references are absent from OSM, filtered to the requested bounding
box. The Leaflet catalogue layer displays those parks at their POTA-provided
coordinates and includes a link for adding the reference to OpenStreetMap.

OSM geometries and markers remain on the OSM layer. The CSV catalogue is never
inserted into the replicated Overpass database. The map server loads the CSV on
startup and refreshes it every night at 02:00 UTC; the OSM reference index
refreshes every minute when requested. The last good CSV catalogue remains
available if a refresh fails. If the OSM reference index expires and cannot be
refreshed, the endpoint returns an error instead of showing possible duplicates.

## Contributing

Contributions to improve the map data are welcome. If you're a regular participant in the POTA program, consider contributing to OpenStreetMap to enhance the accuracy and completeness of the data.

See [how to add a POTA reference to OpenStreetMap](docs/adding-pota-reference-to-osm.md), including the worked example for Sant Llorenç del Munt i l'Obac Nature Park (ES-0142).

## Author

Volker Kerkhoff, EA7KLK
Montequinto, Spain

## License

This project is open source. Please refer to the LICENSE file for more information.

## Acknowledgments

- OpenStreetMap and its community for providing the map data
- Leaflet.js for the interactive mapping library

## Contact

For any queries or suggestions, please contact Volker Kerkhoff, EA7KLK.

---

Note: The accuracy and completeness of the map data depend on volunteers maintaining the OpenStreetMap database.
