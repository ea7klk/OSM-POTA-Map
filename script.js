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
        console.log('Fetched POTA data:', data);
        return data.elements;
    } catch (error) {
        console.error('Error fetching POTA data:', error);
        return [];
    }
}

// Function to add features to the map
function addFeaturesToMap(potaData) {
    console.log('Adding features to map. Total elements:', potaData.length);
    const nameSet = new Set();

    potaData.forEach((element, index) => {
        console.log(`Processing element ${index + 1}/${potaData.length}:`, element);
        let features = [];
        let center;

        if (element.type === 'node') {
            if (typeof element.lat === 'number' && typeof element.lon === 'number') {
                center = [element.lat, element.lon];
                features.push(L.circle(center, {radius: 100, color: 'green', fillColor: 'green', fillOpacity: 0.2}));
                console.log('Added circle for node:', center);
            } else {
                console.log('Invalid node coordinates:', element);
            }
        } else if (element.type === 'way') {
            if (element.geometry && element.geometry.length > 0) {
                const coordinates = element.geometry.map(point => [point.lat, point.lon]).filter(coord => coord[0] && coord[1]);
                if (coordinates.length > 0) {
                    features.push(L.polyline(coordinates, {color: 'green'}));
                    console.log('Added polyline for way:', coordinates);
                } else {
                    console.log('Way has no valid coordinates:', element);
                }
            } else {
                console.log('Way has no valid geometry:', element);
            }
        } else if (element.type === 'relation') {
            const wayMembers = element.members.filter(member => member.type === 'way');
            console.log('Processing relation. Way members:', wayMembers.length);
            
            wayMembers.forEach((wayMember, memberIndex) => {
                if (wayMember.geometry && wayMember.geometry.length > 0) {
                    const coordinates = wayMember.geometry.map(point => [point.lat, point.lon]).filter(coord => coord[0] && coord[1]);
                    if (coordinates.length > 0) {
                        features.push(L.polyline(coordinates, {color: 'green'}));
                        console.log(`Added polyline for way member ${memberIndex + 1}:`, coordinates);
                    } else {
                        console.log(`Way member ${memberIndex + 1} has no valid coordinates:`, wayMember);
                    }
                } else {
                    console.log(`Way member ${memberIndex + 1} has no valid geometry:`, wayMember);
                }
            });

            if (element.tags.type !== 'route' && features.length > 0) {
                const allCoordinates = features.flatMap(feature => feature.getLatLngs()[0]);
                if (allCoordinates.length > 0) {
                    features.push(L.polygon(allCoordinates, {color: 'green', fillColor: 'green', fillOpacity: 0.2}));
                    console.log('Added polygon for non-route relation:', allCoordinates);
                } else {
                    console.log('Non-route relation has no valid coordinates:', element);
                }
            }
        }

        if (features.length > 0) {
            const featureGroup = L.featureGroup(features);
            featureGroup.addTo(map);
            console.log('Added feature group to map:', featureGroup);

            const bounds = featureGroup.getBounds();
            if (bounds.isValid()) {
                center = bounds.getCenter();

                // Add hover tooltip to feature group
                const tooltipContent = `
                    <div style="text-align: center;">
                        <strong>${element.tags.name || 'POTA Site'}</strong><br>
                        Park ID: ${element.tags['communication:amateur_radio:pota']}<br>
                        Element ID: ${element.id}
                    </div>
                `;
                featureGroup.bindTooltip(tooltipContent, {
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
                    console.log('Added marker for unique name:', element.tags.name);
                }
            } else {
                console.log('Invalid bounds for feature group:', element);
            }
        } else {
            console.log('No features created for element:', element);
        }
    });
    console.log('Finished adding features to map');
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
    console.log('Fetched POTA data, adding features to map');
    addFeaturesToMap(potaData);
    console.log('Features added, restoring map state');
    restoreMapState();  // Restore map state after adding features
    console.log('Map initialization complete');
});