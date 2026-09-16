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
        this.markerLayer = L.markerClusterGroup({
            chunkedLoading: true,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true
        });
        this.catalogueLayer = L.markerClusterGroup({
            chunkedLoading: true,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: cluster => {
                const childCount = cluster.getChildCount();
                return L.divIcon({
                    html: `<span class="pota-catalogue-cluster-count">${childCount}</span>`,
                    className: 'pota-catalogue-cluster',
                    iconSize: [44, 44]
                });
            }
        });
        this.errorPopup = null;
        this.loadDataTimeout = null;
        this.loadRequestId = 0;
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

    debouncedLoadData() {
        if (this.loadDataTimeout) {
            clearTimeout(this.loadDataTimeout);
        }
        this.loadDataTimeout = setTimeout(() => {
            this.loadData();
        }, 250); // 250ms debounce delay
    }

    async loadData() {
        const bounds = this.map.getBounds();
        const extendedBounds = this.extendBounds(bounds);
        const query = this.buildOverpassQuery(extendedBounds);
        const requestId = ++this.loadRequestId;
        const results = await Promise.allSettled([
            this.fetchPOTAData(query),
            this.fetchCatalogueData(extendedBounds)
        ]);
        if (requestId !== this.loadRequestId) return;

        const [osmResult, catalogueResult] = results;
        let osmReferences = new Set();
        if (osmResult.status === 'fulfilled' && osmResult.value && Array.isArray(osmResult.value.elements)) {
            this.addData(osmResult.value);
            osmReferences = collectPotaRefsFromResponse(osmResult.value);
            this.clearErrorPopup();
        } else {
            this.showErrorPopup();
        }

        if (catalogueResult.status === 'fulfilled' && catalogueResult.value) {
            this.addCatalogueData(catalogueResult.value, osmReferences);
        } else {
            console.error('Error fetching POTA catalogue data:', catalogueResult.reason);
            this.catalogueLayer.clearLayers();
        }
    }

    extendBounds(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return L.latLngBounds(
            L.latLng(sw.lat, sw.lng),
            L.latLng(ne.lat, ne.lng)
        );
    }

    buildOverpassQuery(bounds) {
        const { _southWest, _northEast } = bounds;
        return `[out:json][timeout:60];nwr["communication:amateur_radio:pota"](${_southWest.lat},${_southWest.lng},${_northEast.lat},${_northEast.lng});out geom;`;
    }

    async fetchPOTAData(query) {
        const overpassUrl = window.OVERPASS_URL || 'https://overpass.ea7klk.es/api/interpreter';
        const url = `${overpassUrl}?data=${encodeURIComponent(query)}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept': 'application/json'
                }
            });
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

    async fetchCatalogueData(bounds) {
        const { _southWest, _northEast } = bounds;
        const catalogueUrl = new URL(window.POTA_CATALOGUE_URL || '/api/pota/unmapped', window.location.href);
        catalogueUrl.search = new URLSearchParams({
            south: _southWest.lat,
            west: _southWest.lng,
            north: _northEast.lat,
            east: _northEast.lng
        }).toString();

        const response = await fetch(catalogueUrl, {
            headers: { Accept: 'application/geo+json, application/json' },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
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

    addCatalogueData(catalogue, osmReferences) {
        this.catalogueLayer.clearLayers();
        if (this.map.getZoom() <= 8 || !Array.isArray(catalogue.features)) return;

        catalogue.features.forEach(feature => {
            const properties = feature.properties || {};
            const reference = String(properties.pota_ref || '').trim();
            const normalizedReference = normalizePotaReference(reference);
            const coordinates = feature.geometry && feature.geometry.coordinates;
            if (!reference || !normalizedReference || !Array.isArray(coordinates) || coordinates.length < 2) return;

            // The catalogue endpoint excludes all globally mapped POTA refs.
            // This viewport check also makes an OSM result win immediately if
            // it appears before the next cached global-index refresh.
            if (osmReferences.has(normalizedReference)) return;

            const [longitude, latitude] = coordinates;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

            const marker = L.marker([latitude, longitude], {
                icon: L.divIcon({
                    html: '<span class="material-icons">info</span>',
                    className: 'pota-catalogue-marker',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -14]
                })
            });

            const safeName = escapeHtml(properties.name || reference);
            const safeReference = escapeHtml(reference);
            const potaUrl = `https://pota.app/#/park/${encodeURIComponent(reference)}`;
            const editUrl = new URL('https://www.openstreetmap.org/edit');
            editUrl.searchParams.set('editor', 'id');
            editUrl.searchParams.set('lat', latitude);
            editUrl.searchParams.set('lon', longitude);
            editUrl.searchParams.set('zoom', '16');
            const popupContent = `<div class="pota-catalogue-popup"><b>${safeName}</b><br>` +
                `POTA ID: <a href="${potaUrl}" target="_blank" rel="noopener noreferrer">${safeReference}</a>` +
                '<br>This POTA park is not yet linked to an OpenStreetMap feature.' +
                '<br>The marker position comes from the POTA catalogue and may be approximate.' +
                `<br><a href="${editUrl.href}" target="_blank" rel="noopener noreferrer">Help map it in OpenStreetMap</a>` +
                `<br>Add <code>communication:amateur_radio:pota=${safeReference}</code> to the park feature.</div>`;
            marker.bindPopup(popupContent);
            marker.addTo(this.catalogueLayer);
        });
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
        const markers = [];

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
            markers.push(marker);
        });
        this.markerLayer.addLayers(markers);

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

function normalizePotaReference(value) {
    return String(value || '').trim().toUpperCase();
}

function collectPotaRefsFromResponse(osmData) {
    const references = new Set();
    (osmData.elements || []).forEach(element => {
        const value = element.tags && element.tags['communication:amateur_radio:pota'];
        String(value || '').split(';').forEach(reference => {
            const normalized = normalizePotaReference(reference);
            if (normalized) references.add(normalized);
        });
    });
    return references;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
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

const potaCatalogueLayer = osmLayer.catalogueLayer;
potaCatalogueLayer.addTo(map);
L.control.layers(null, {
    'OpenStreetMap POTA features': osmLayer,
    'POTA catalogue parks not linked in OSM': potaCatalogueLayer
}, { collapsed: true }).addTo(map);

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

// Save map state on any map movement
map.on('moveend', () => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    setCookie('mapView', `${center.lat},${center.lng},${zoom}`, 30); // Save for 30 days
});

// Load data only on moveend, with debounce
map.on('moveend', () => {
    osmLayer.debouncedLoadData();
});

// Initial data load
osmLayer.loadData();
