// Function to get cookie value
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// Function to set cookie
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value};${expires};path=/`;
}

// Initialize the map
let initialView = [50.0, 10.0]; // Center of Europe
let initialZoom = 4;

// Check for saved position and zoom
const savedLat = getCookie('mapLat');
const savedLng = getCookie('mapLng');
const savedZoom = getCookie('mapZoom');

if (savedLat && savedLng && savedZoom) {
    initialView = [parseFloat(savedLat), parseFloat(savedLng)];
    initialZoom = parseInt(savedZoom);
}

const map = L.map('map').setView(initialView, initialZoom);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Add zoom control
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Add locate control with initial zoom level of 14
L.control.locate({
    position: 'topright',
    strings: {
        title: "Locate me"
    },
    setView: 'always',
    initialZoomLevel: 14
}).addTo(map);

// Save position and zoom level when changed
map.on('moveend', function() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    setCookie('mapLat', center.lat, 30);
    setCookie('mapLng', center.lng, 30);
    setCookie('mapZoom', zoom, 30);
    fetchPOTALocations(); // Fetch new locations when map moves
});

// Function to create Overpass API query for visible area
function createOverpassQuery() {
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    return `
    [out:json];
    (
      nwr["communication:amateur_radio:pota"](${south},${west},${north},${east});
    );
    out geom;
    `;
}

// Function to fetch POTA locations
async function fetchPOTALocations() {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = createOverpassQuery();
    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: query
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Oops! We haven't received JSON!");
        }
        const data = await response.json();
        clearMap();
        addLocationsToMap(data.elements);
    } catch (error) {
        console.error("There was a problem with the fetch operation:", error.message);
    }
}

// Function to clear existing markers and lines
function clearMap() {
    map.eachLayer(function (layer) {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });
}

// Function to create popup content
function createPopupContent(location) {
    const potaRef = location.tags['communication:amateur_radio:pota'];
    const commonName = location.tags['name'] || 'Unnamed Location';
    return `<strong>${commonName}</strong><br>POTA ID: <strong>${potaRef}</strong>`;
}

// Custom icon for POTA markers
const potaIcon = L.icon({
    iconUrl: 'pota_marker.png',
    iconSize: [41, 41],
    iconAnchor: [15, 1],
    popupAnchor: [1, -34]
});

// Function to add markers and lines to the map
function addLocationsToMap(locations) {
    const potaRefs = new Set();

    locations.forEach(location => {
        const potaRef = location.tags['communication:amateur_radio:pota'];
        const popupContent = createPopupContent(location);

        if (location.type === 'node') {
            L.marker([location.lat, location.lon], {icon: potaIcon})
                .addTo(map)
                .bindPopup(popupContent);
        } else if (location.type === 'way' || location.type === 'route') {
            // Add green line for the way or route
            const coordinates = location.geometry.map(point => [point.lat, point.lon]);
            L.polyline(coordinates, {color: 'green'}).addTo(map);

            // Add marker only for the first occurrence of this POTA reference
            if (!potaRefs.has(potaRef)) {
                potaRefs.add(potaRef);
                const firstPoint = coordinates[0];
                L.marker(firstPoint, {icon: potaIcon})
                    .addTo(map)
                    .bindPopup(popupContent);
            }
        } else if (location.type === 'relation') {
            if (location.members) {
                let relationCoordinates = [];
                location.members.forEach(member => {
                    if ((member.type === 'way' || member.type === 'route') && member.geometry) {
                        const coordinates = member.geometry.map(point => [point.lat, point.lon]);
                        L.polyline(coordinates, {color: 'green'}).addTo(map);
                        relationCoordinates = relationCoordinates.concat(coordinates);
                    }
                });
                
                // Add marker for the relation using the first coordinate of its members
                if (relationCoordinates.length > 0 && !potaRefs.has(potaRef)) {
                    potaRefs.add(potaRef);
                    L.marker(relationCoordinates[0], {icon: potaIcon})
                        .addTo(map)
                        .bindPopup(popupContent);
                }
            } else if (location.center) {
                // Fallback to using the center if no members are available
                if (!potaRefs.has(potaRef)) {
                    potaRefs.add(potaRef);
                    L.marker([location.center.lat, location.center.lon], {icon: potaIcon})
                        .addTo(map)
                        .bindPopup(popupContent);
                }
            }
        }
    });
}

// Initial fetch of POTA locations
fetchPOTALocations();