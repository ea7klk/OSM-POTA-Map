// Initialize the map centered on Spain, showing all of Europe
const map = L.map('map', {
    zoomControl: false  // Disable default zoom control
}).setView([40.4637, -3.7492], 4);  // Coordinates for Madrid, Spain with zoom level 4

// Add the OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Add custom zoom control
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Create a custom control for the "Center on Me" button
L.Control.CenterOnMe = L.Control.extend({
    onAdd: function(map) {
        const btn = L.DomUtil.create('button', 'center-on-me-btn');
        btn.innerHTML = 'Center on Me';
        btn.style.padding = '10px';
        btn.style.backgroundColor = 'white';
        btn.style.border = '2px solid #ccc';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';

        btn.onclick = function() {
            map.locate({setView: true, maxZoom: 16});
        };

        return btn;
    }
});

// Add the "Center on Me" button to the map
new L.Control.CenterOnMe({ position: 'topleft' }).addTo(map);

// Handle location found event
map.on('locationfound', function(e) {
    L.marker(e.latlng).addTo(map)
        .bindPopup("You are here!").openPopup();
});

// Handle location error
map.on('locationerror', function(e) {
    alert("Could not find your location: " + e.message);
});

// Function to save map state
function saveMapState() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    localStorage.setItem('mapState', JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom: zoom
    }));
}

// Function to restore map state
function restoreMapState() {
    const mapState = localStorage.getItem('mapState');
    if (mapState) {
        const { lat, lng, zoom } = JSON.parse(mapState);
        map.setView([lat, lng], zoom);
    }
}

// Add event listeners for map movement and zoom
map.on('moveend', saveMapState);
map.on('zoomend', saveMapState);

// Restore map state on page load
document.addEventListener('DOMContentLoaded', () => {
    restoreMapState();
});