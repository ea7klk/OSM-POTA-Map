//Add Material Icons font
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
document.head.appendChild(link);

// OSM4Leaflet class implementation
class OSM4Leaflet extends L.Layer {
    constructor(options) {
        super(options);
        this.options = L.Util.extend({}, this.options, options);
        this.baseLayer = null;
        this.markerLayer = L.layerGroup();
        this.errorPopup = null;
    }

    onAdd(map) {
        this.map = map;
        if (!this.baseLayer) {
            this.initBaseLayer();
        }
        this.map.addLayer(this.baseLayer);
        this.map.addLayer(this.markerLayer);
        
        // Remove loadData() call from here

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
        const extendedBounds = this.extendBounds(bounds);
        const query = this.buildOverpassQuery(extendedBounds);
        this.fetchPOTAData(query).then(data => {
            if (data) {
                this.addData(data);
                this.clearErrorPopup();
            } else {
                this.showErrorPopup();
            }
        });
    }

    extendBounds(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return L.latLngBounds(
            L.latLng(Math.floor(sw.lat), Math.floor(sw.lng)),
            L.latLng(Math.ceil(ne.lat), Math.ceil(ne.lng))
        );
    }

    buildOverpassQuery(bounds) {
        const { _southWest, _northEast } = bounds;
        return `nwr["communication:amateur_radio:pota"](${_southWest.lat},${_southWest.lng},${_northEast.lat},${_northEast.lng});`;
    }

    async fetchPOTAData(query) {
        const overpassUrl = window.OVERPASS_URL || '/api/overpass';
        const url = `${overpassUrl}?query=${encodeURIComponent(query)}`;
        
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
        
        const currentZoom = this.map.getZoom();
        const potaElements = new Map();

        geojson.features.forEach(feature => {
            if (feature.geometry) {
                let potaId = feature.properties.tags['communication:amateur_radio:pota'];
                if (!potaId && feature.properties.relations) {
                    // Check if the feature is a sub-element of a relation
                    const relation = feature.properties.relations.find(r => r.tags && r.tags['communication:amateur_radio:pota']);
                    if (relation) {
                        potaId = relation.tags['communication:amateur_radio:pota'];
                    }
                }
                
                const isUnmapped = feature.properties.tags['unmapped_osm'] === 'true';
                
                // Skip unmapped features if zoom level is <= 8
                if (isUnmapped && currentZoom <= 8) {
                    return;
                }
                
                if (potaId) {
                    if (!potaElements.has(potaId)) {
                        potaElements.set(potaId, []);
                    }
                    potaElements.get(potaId).push(feature);
                }
                
                // Add to base layer only if not unmapped or zoom level > 8
                this.baseLayer.addData(feature);
            }
        });

        potaElements.forEach((features, potaId) => {
            const isRelationWithOnlyWays = features.every(f => f.geometry.type === 'LineString' || f.geometry.type === 'Polygon');
            
            let center;
            if (isRelationWithOnlyWays) {
                // Calculate the center of the relation (top-level element)
                const bounds = L.geoJSON(features).getBounds();
                center = bounds.getCenter();
            } else {
                // For other cases, use the center of all features
                const bounds = L.geoJSON(features).getBounds();
                center = bounds.getCenter();
            }

            const name = features[0].properties.tags.name || 'Unnamed';
            const isUnmapped = features[0].properties.tags['unmapped_osm'] === 'true';

            // Skip marker creation for unmapped features if zoom level is <= 8
            if (isUnmapped && currentZoom <= 8) {
                return;
            }

            let popupContent = `<div style="text-align: center;"><b>${name}</b><br>POTA-ID: <a href="https://pota.app/#/park/${potaId}" target="_blank">${potaId}</a>`;
            if (isUnmapped) {
                popupContent += `<br>This POTA reference hasn't been mapped on OpenStreetMap yet. You can contribute by editing the map on <a href="https://www.openstreetmap.org/query?lat=${center.lat}&lon=${center.lng}" target="_blank">openstreetmap.org</a> and adding the tag <b>communication:amateur_radio:pota=${potaId}</b> to the top-level relation for the reference.`;
            }
            popupContent += '</div>';

            let marker;
            if (isUnmapped) {
                // Create a div element with Material Icons
                const iconHtml = '<span class="material-icons" style="font-size: 22px; color: #8b0000;">info</span>';
                const infoIcon = L.divIcon({
                    html: iconHtml,
                    className: 'material-icons-marker',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                    popupAnchor: [0, -11]
                });
                marker = L.marker(center, { icon: infoIcon });
            } else {
                marker = L.marker(center, {
                    icon: L.icon({
                        iconUrl: 'pota_marker.png',
                        iconSize: [41, 41],
                        iconAnchor: [20, 41],
                        popupAnchor: [0, -41]
                    })
                });
            }
            marker.addTo(this.markerLayer);
            marker.bindPopup(popupContent);

            // Add event listeners to the marker
            marker.on({
                mouseover: () => this.highlightFeatures(features),
                mouseout: () => this.resetHighlightFeatures(features),
                click: () => {
                    this.highlightFeatures(features);
                    marker.openPopup();
                }
            });
        });

        if (this.options.afterParse) {
            this.options.afterParse(geojson);
        }
    }

    highlightFeatures(features) {
        features.forEach(feature => {
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
        });
    }

    resetHighlightFeatures(features) {
        features.forEach(feature => {
            const layer = this.baseLayer.getLayers().find(layer => layer.feature === feature);
            if (layer) {
                this.baseLayer.resetStyle(layer);
            }
        });
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
            let potaId = feature.properties.tags['communication:amateur_radio:pota'];
            if (!potaId && feature.properties.relations) {
                const relation = feature.properties.relations.find(r => r.tags && r.tags['communication:amateur_radio:pota']);
                if (relation) {
                    potaId = relation.tags['communication:amateur_radio:pota'];
                }
            }
            if (potaId) {
                const popupContent = `<div style="text-align: center;"><b>${name}</b><br>POTA-ID: <a href="https://pota.app/#/park/${potaId}" target="_blank">${potaId}</a></div>`;
                layer.bindPopup(popupContent);
            }

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
                    // Removed fitBounds to prevent zooming on click
                    e.target.openPopup();
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

// Combine moveend and zoomend events into a single listener
map.on('moveend zoomend', () => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    setCookie('mapView', `${center.lat},${center.lng},${zoom}`, 30); // Save for 30 days
    osmLayer.loadData();
});

// Initial data load
osmLayer.loadData();