# POTA (Parks on the Air) Map

## Project Overview

This project provides an interactive web-based map for POTA (Parks on the Air) locations, designed for amateur radio enthusiasts. It allows users to explore and find Parks on the Air for their amateur radio operations.

## Features

- Interactive map displaying POTA locations
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

- `MATOMO_URL`: The URL of your Matomo analytics instance.
- `MATOMO_SITE_ID`: The site ID for your application in Matomo.

To set these variables when running the Docker container, use the `-e` flag:

```
docker run -d -p 8080:80 -e MATOMO_URL="https://your-matomo-url.com/" -e MATOMO_SITE_ID="2" --name osm-pota-map-container osm-pota-map
```

## Usage

- Pan and zoom the map to explore POTA locations
- Click on markers to view details about specific POTA sites
- Use the locate control to find your current position on the map

## Contributing

Contributions to improve the map data are welcome. If you're a regular participant in the POTA program, consider contributing to OpenStreetMap to enhance the accuracy and completeness of the data.

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

Note: The accuracy and completeness of the map data depend on volunteers maintaining the OpenStreetMap database. Instructions on how to contribute to OpenStreetMap will be provided soon.