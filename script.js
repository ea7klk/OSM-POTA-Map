// Wrap the entire script in a function
function initMap() {
    console.log('Initializing map...');

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet is not loaded. Please make sure you have included the Leaflet library in your HTML file.');
        return;
    }

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

    // Create a layer group for markers and shapes
    const featureGroup = L.featureGroup().addTo(map);

    // Function to fetch POTA data from Overpass API
    async function fetchPOTAData(bounds) {
        console.log('Fetching POTA data for bounds:', bounds.toBBoxString());
        const overpassUrl = 'https://overpass-api.de/api/interpreter';
        const query = `
        [out:json][timeout:25];
        (
          nwr["communication:amateur_radio:pota"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
        );
        out geom;
        `;

        try {
            console.log('Sending Overpass API request with query:', query);
            const response = await fetch(overpassUrl, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Received POTA data:', data);
            return data.elements;
        } catch (error) {
            console.error('Error fetching POTA data:', error);
            return [];
        }
    }

    // Function to add features to the map
    function addFeaturesToMap(potaData) {
        console.log('Adding features to map. Number of elements:', potaData.length);
        featureGroup.clearLayers();

        // Group elements by POTA reference
        const groupedData = potaData.reduce((acc, element) => {
            const potaRef = element.tags['communication:amateur_radio:pota'];
            if (!acc[potaRef]) {
                acc[potaRef] = [];
            }
            acc[potaRef].push(element);
            return acc;
        }, {});

        Object.entries(groupedData).forEach(([potaRef, elements], index) => {
            let feature;
            let center;
            const bounds = L.latLngBounds();

            elements.forEach(element => {
                if (element.type === 'node') {
                    center = [element.lat, element.lon];
                    bounds.extend(center);
                } else if (element.type === 'way' && element.geometry) {
                    const coordinates = element.geometry.map(point => [point.lat, point.lon]);
                    feature = L.polyline(coordinates, {color: 'green', weight: 2});
                    bounds.extend(coordinates);
                } else if (element.type === 'relation' && element.members) {
                    const coordinates = element.members
                        .filter(member => member.type === 'way' && member.geometry)
                        .flatMap(member => member.geometry.map(point => [point.lat, point.lon]));
                    if (coordinates.length > 0) {
                        feature = L.polygon(coordinates, {color: 'green', fillColor: 'green', fillOpacity: 0.2});
                        bounds.extend(coordinates);
                    }
                }
            });

            if (!feature) {
                center = bounds.getCenter();
                feature = L.circleMarker(center, {
                    radius: 5,
                    fillColor: 'green',
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            }

            const element = elements[0];  // Use the first element for popup content
            const popupContent = `
                <strong>${element.tags.name || 'POTA Site'}</strong><br>
                Type: ${elements.map(e => e.type).join(', ')}<br>
                ID: ${elements.map(e => e.id).join(', ')}<br>
                POTA: ${potaRef}<br>
                Elements: ${elements.length}
            `;
            feature.bindPopup(popupContent);

            featureGroup.addLayer(feature);
            console.log(`Added feature ${index + 1} for POTA ${potaRef}`);
        });

        console.log('Total features added:', featureGroup.getLayers().length);
    }

    // Function to update data based on current map view
    async function updateMapData() {
        console.log('Updating map data...');
        const bounds = map.getBounds();
        const potaData = await fetchPOTAData(bounds);
        addFeaturesToMap(potaData);
    }

    // Update data when map moves
    map.on('moveend', updateMapData);

    // Initial data fetch
    console.log('Initiating initial data fetch...');
    updateMapData();

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

    // Restore map state
    restoreMapState();

    console.log('Map initialization complete');
}

// Wait for the DOM to be fully loaded before initializing the map
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded. Starting map initialization...');
    initMap();
});

// Log when the script has finished loading
console.log('Map script loaded');