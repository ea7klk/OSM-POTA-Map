// Initialize the map
const map = L.map('map', {
    zoomControl: false  // Disable default zoom control
}).setView([0, 0], 2);

// Add custom zoom control
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Add the OpenStreetMap tile layer
L.tileLayer.provider('OpenStreetMap.Mapnik').addTo(map);

// Function to fetch POTA data from Overpass API
async function fetchPOTAData() {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
    [out:json];
    nwr["communication:amateur_radio:pota"];
    out geom;
    `;

    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`
        });
        const data = await response.json();
        return data.elements;
    } catch (error) {
        console.error('Error fetching POTA data:', error);
        return [];
    }
}

// Function to add features to the map
function addFeaturesToMap(potaData) {
    const nameSet = new Set();

    potaData.forEach(element => {
        let feature;
        let center;

        if (element.type === 'node') {
            center = [element.lat, element.lon];
            feature = L.circle(center, {radius: 100, color: 'green', fillColor: 'green', fillOpacity: 0.2});
        } else if (element.type === 'way') {
            const coordinates = element.geometry.map(point => [point.lat, point.lon]);
            feature = L.polyline(coordinates, {color: 'green'});
            center = feature.getBounds().getCenter();
        } else if (element.type === 'relation') {
            const coordinates = element.members
                .filter(member => member.type === 'way')
                .flatMap(member => member.geometry ? member.geometry.map(point => [point.lat, point.lon]) : []);
            
            if (coordinates.length > 0) {
                if (element.tags.type === 'route') {
                    feature = L.polyline(coordinates, {color: 'green'});
                } else {
                    feature = L.polygon(coordinates, {color: 'green', fillColor: 'green', fillOpacity: 0.2});
                }
                center = feature.getBounds().getCenter();
            }
        }

        if (feature) {
            feature.addTo(map);

            // Add hover tooltip to feature
            const tooltipContent = `
                <div style="text-align: center;">
                    <strong>${element.tags.name || 'POTA Site'}</strong><br>
                    Park ID: ${element.tags['communication:amateur_radio:pota']}<br>
                    Element ID: ${element.id}
                </div>
            `;
            feature.bindTooltip(tooltipContent, {
                permanent: false,
                direction: 'top'
            });

            // Add centered marker only if it's the first occurrence of the name
            if (!nameSet.has(element.tags.name)) {
                nameSet.add(element.tags.name);
                const marker = L.marker(center).addTo(map);
                marker.bindTooltip(tooltipContent, {
                    permanent: false,
                    direction: 'top'
                });
            }
        }
    });
}

// Function to save map state
function saveMapState() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    Cookies.set('mapState', JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom: zoom
    }), { expires: 30 });  // Cookie expires in 30 days
}

// Function to restore map state
function restoreMapState() {
    const mapState = Cookies.get('mapState');
    if (mapState) {
        const { lat, lng, zoom } = JSON.parse(mapState);
        map.setView([lat, lng], zoom);
    }
}

// Add event listeners for map movement and zoom
map.on('moveend', saveMapState);
map.on('zoomend', saveMapState);

// Fetch and display POTA data
fetchPOTAData().then(potaData => {
    addFeaturesToMap(potaData);
    restoreMapState();  // Restore map state after adding features
});