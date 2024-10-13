// OSM4Leaflet class implementation
class OSM4Leaflet extends L.Layer {
    constructor(options) {
        super(options);
        this.options = L.Util.extend({}, this.options, options);
        this.baseLayer = null;
        this.markerLayer = L.layerGroup();
        this.lastQueriedBounds = null;
        this.errorPopup = null;
    }

    onAdd(map) {
        this.map = map;
        if (!this.baseLayer) {
            this.initBaseLayer();
        }
        this.map.addLayer(this.baseLayer);
        this.map.addLayer(this.markerLayer);
        this.loadData();

        // Add event listeners
        this.map.on('zoomend', this.clearErrorPopup, this);
        this.map.on('movestart', this.closeAllPopups, this);
        this.map.on('zoomstart', this.closeAllPopups, this);
    }

    onRemove(map) {
        if (this.baseLayer) {
            map.removeLayer(this.baseLayer);
        }
        map.removeLayer(this.markerLayer);

        // Remove event listeners
        this.map.off('zoomend', this.clearErrorPopup, this);
        this.map.off('movestart', this.closeAllPopups, this);
        this.map.off('zoomstart', this.closeAllPopups, this);
    }

    initBaseLayer() {
        const BaseLayerClass = this.options.baseLayerClass || L.GeoJSON;
        this.baseLayer = new BaseLayerClass(null, this.options.baseLayerOptions);
    }

    loadData() {
        const bounds = this.map.getBounds();
        const roundedBounds = this.roundBounds(bounds);
        
        if (!this.lastQueriedBounds || !this.lastQueriedBounds.contains(bounds)) {
            const query = this.buildOverpassQuery(roundedBounds);
            this.fetchPOTAData(query).then(data => {
                if (data) {
                    this.addData(data);
                    this.lastQueriedBounds = roundedBounds;
                    this.clearErrorPopup();
                } else {
                    this.showErrorPopup();
                }
            });
        }
    }

    roundBounds(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return L.latLngBounds(
            L.latLng(Math.floor(sw.lat / 10) * 10, Math.floor(sw.lng / 10) * 10),
            L.latLng(Math.ceil(ne.lat / 10) * 10, Math.ceil(ne.lng / 10) * 10)
        );
    }

    buildOverpassQuery(bounds) {
        const { _southWest, _northEast } = bounds;
        return `nwr["communication:amateur_radio:pota"](${_southWest.lat},${_southWest.lng},${_northEast.lat},${_northEast.lng});`;
    }

    async fetchPOTAData(query) {
        const url = `/api/overpass?query=${encodeURIComponent(query)}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching POTA data:', error);
            return null;
        }
    }

    showErrorPopup() {
        const popupContent = '<div style="text-align: center;">The selected area is too large. Please zoom in.</div>';
        if (this.errorPopup) {
            this.errorPopup.setContent(popupContent);
        } else {
            this.errorPopup = L.popup()
                .setLatLng(this.map.getCenter())
                .setContent(popupContent)
                .openOn(this.map);
        }
    }

    clearErrorPopup() {
        if (this.errorPopup) {
            this.map.closePopup(this.errorPopup);
            this.errorPopup = null;
        }
    }

    closeAllPopups() {
        this.map.closePopup();
    }

    addData(osmData) {
        if (!osmData || !osmData.elements) {
            console.log('No POTA data to display');
            return;
        }

        const geojson = osmtogeojson(osmData);
        this.baseLayer.clearLayers();
        this.markerLayer.clearLayers();
        
        this.baseLayer.addData(geojson);

        const potaIdSet = new Set();

        geojson.features.forEach(feature => {
            if (feature.geometry) {
                const potaId = feature.properties.tags['communication:amateur_radio:pota'];
                if (potaId && !potaIdSet.has(potaId)) {
                    potaIdSet.add(potaId);

                    let center;
                    if (feature.geometry.type === 'Point') {
                        center = L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                    } else if (feature.geometry.type === 'LineString') {
                        const coords = feature.geometry.coordinates;
                        const midIndex = Math.floor(coords.length / 2);
                        center = L.latLng(coords[midIndex][1], coords[midIndex][0]);
                    } else {
                        const bounds = L.geoJSON(feature).getBounds();
                        center = bounds.getCenter();
                    }

                    const name = feature.properties.tags.name || 'Unnamed';

                    const popupContent = `<div style="text-align: center;"><b>${name}</b><br>POTA: ${potaId}</div>`;

                    const marker = L.marker(center, {
                        icon: L.icon({
                            iconUrl: 'pota_marker.png',
                            iconSize: [41, 41],
                            iconAnchor: [20, 41],
                            popupAnchor: [0, -41]
                        })
                    }).addTo(this.markerLayer);
                    marker.bindPopup(popupContent);

                    // Add event listeners to the marker
                    marker.on({
                        mouseover: () => this.highlightFeature(feature),
                        mouseout: () => this.resetHighlight(feature),
                        click: () => this.highlightFeature(feature)
                    });
                }
            }
        });

        if (this.options.afterParse) {
            this.options.afterParse(geojson);
        }
    }

    highlightFeature(feature) {
        const layer = this.baseLayer.getLayers().find(layer => layer.feature === feature);
        if (layer) {
            layer.setStyle({
                color: darkenColor('#43a047', 15),
                fillColor: darkenColor('#43a047', 15),
                weight: 4,
                opacity: 0.7,
                fillOpacity: 0.45  // 15% darker than 0.3
            });
        }
    }

    resetHighlight(feature) {
        const layer = this.baseLayer.getLayers().find(layer => layer.feature === feature);
        if (layer) {
            this.baseLayer.resetStyle(layer);
        }
    }

    getBaseLayer() {
        return this.baseLayer;
    }
}

// Initialize the map
let initialView = [50, 10]; // Default center of Europe
let initialZoom = 4; // Default zoom level

// Function to get cookie by name
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

// Check if there's a saved location in cookies
const savedView = getCookie('mapView');
if (savedView) {
    const [lat, lng, zoom] = savedView.split(',').map(Number);
    initialView = [lat, lng];
    initialZoom = zoom;
}

const map = L.map('map').setView(initialView, initialZoom);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Function to darken a color by a given percentage
function darkenColor(color, percent) {
    const num = parseInt(color.replace("#",""), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) - amt,
    G = (num >> 8 & 0x00FF) - amt,
    B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255)).toString(16).slice(1);
}

// Create and add the OSM4Leaflet layer
const osmLayer = new OSM4Leaflet({
    baseLayerOptions: {
        style: function(feature) {
            return {
                color: '#43a047',
                fillColor: '#43a047',
                weight: 4,
                opacity: 0.7,
                fillOpacity: 0.3
            };
        },
        onEachFeature: function(feature, layer) {
            const name = feature.properties.tags.name || 'Unnamed';
            const potaId = feature.properties.tags['communication:amateur_radio:pota'];
            const popupContent = `<div style="text-align: center;"><b>${name}</b><br>POTA: ${potaId}</div>`;
            layer.bindPopup(popupContent);

            layer.on({
                mouseover: function(e) {
                    const layer = e.target;
                    layer.setStyle({
                        color: darkenColor('#43a047', 15),
                        fillColor: darkenColor('#43a047', 15),
                        weight: 4,
                        opacity: 0.7,
                        fillOpacity: 0.45  // 15% darker than 0.3
                    });
                },
                mouseout: function(e) {
                    osmLayer.baseLayer.resetStyle(e.target);
                },
                click: function(e) {
                    map.fitBounds(e.target.getBounds());
                }
            });
        },
        pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
                radius: 5,
                fillColor: '#43a047',
                color: '#000',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
        }
    }
});
osmLayer.addTo(map);

// Add locate control
L.control.locate({
    position: 'bottomright',
    drawCircle: false,
    followCircle: false,
    showPopup: false,
    strings: {
        title: "Show me where I am"
    },
    setView: 'always',
    initialZoomLevel: 11
}).addTo(map);

// Event listener for map moveend event
map.on('moveend', () => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    setCookie('mapView', `${center.lat},${center.lng},${zoom}`, 30); // Save for 30 days
    osmLayer.loadData();
});

// Initial data load
osmLayer.loadData();