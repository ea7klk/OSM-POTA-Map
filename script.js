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

// Add locate control
L.control.locate({
    position: 'topright',
    strings: {
        title: "Locate me"
    }
}).addTo(map);

// Save position and zoom level when changed
map.on('moveend', function() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    setCookie('mapLat', center.lat, 30);
    setCookie('mapLng', center.lng, 30);
    setCookie('mapZoom', zoom, 30);
});

// Overpass API query
const query = `
[out:json];
nwr["communication:amateur_radio:pota"];
out geom;
`;

// Function to fetch POTA locations
async function fetchPOTALocations() {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
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
        return data.elements;
    } catch (error) {
        console.error("There was a problem with the fetch operation:", error.message);
    }
}

// Function to add markers and lines to the map
function addLocationsToMap(locations) {
    const potaRefs = new Set();

    locations.forEach(location => {
        const potaRef = location.tags['communication:amateur_radio:pota'];

        if (location.type === 'node') {
            L.marker([location.lat, location.lon])
                .addTo(map)
                .bindPopup(`POTA Reference: ${potaRef}`);
        } else if (location.type === 'way' || location.type === 'route') {
            // Add green line for the way or route
            const coordinates = location.geometry.map(point => [point.lat, point.lon]);
            L.polyline(coordinates, {color: 'green'}).addTo(map);

            // Add marker only for the first occurrence of this POTA reference
            if (!potaRefs.has(potaRef)) {
                potaRefs.add(potaRef);
                const firstPoint = coordinates[0];
                L.marker(firstPoint)
                    .addTo(map)
                    .bindPopup(`POTA Reference: ${potaRef}`);
            }
        } else if (location.type === 'relation') {
            if (location.members) {
                location.members.forEach(member => {
                    if ((member.type === 'way' || member.type === 'route') && member.geometry) {
                        const coordinates = member.geometry.map(point => [point.lat, point.lon]);
                        L.polyline(coordinates, {color: 'green'}).addTo(map);
                    }
                });
            }
            if (location.center) {
                if (!potaRefs.has(potaRef)) {
                    potaRefs.add(potaRef);
                    L.marker([location.center.lat, location.center.lon])
                        .addTo(map)
                        .bindPopup(`POTA Reference: ${potaRef}`);
                }
            }
        }
    });
}

// Fetch and display POTA locations
fetchPOTALocations().then(locations => {
    if (locations) {
        addLocationsToMap(locations);
    }
}).catch(error => {
    console.error("Error fetching or processing POTA locations:", error);
});