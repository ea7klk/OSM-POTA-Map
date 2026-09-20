//Add Material Icons font
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
document.head.appendChild(link);
const { MAX_BBOX_AREA_KM2, bboxAreaKm2 } = window.POTAMAP_BBOX_LIMITS;
const {
    buildActivatorProfileUrl,
    buildParkUrl,
    buildSpotsRequestUrl,
    formatSpotLastSeen
} = window.POTAMAP_SPOTS;
let potaStatus = new Map();
let potaNames = new Map();

function normalizePotaReference(value) {
    return String(value || '').trim().toUpperCase();
}

function splitPotaReferences(value) {
    return String(value || '')
        .split(';')
        .map(normalizePotaReference)
        .filter(Boolean);
}

function getPotaOfficialName(value) {
    const names = (Array.isArray(value) ? value : splitPotaReferences(value))
        .map(reference => potaNames.get(normalizePotaReference(reference)))
        .filter(Boolean);
    return names.join(' / ');
}

function getPotaIdFromFeature(feature) {
    const tags = feature.properties && feature.properties.tags;
    let potaId = tags && tags['communication:amateur_radio:pota'];
    if (!potaId && feature.properties && feature.properties.relations) {
        const relation = feature.properties.relations.find(r => r.tags && r.tags['communication:amateur_radio:pota']);
        if (relation) potaId = relation.tags['communication:amateur_radio:pota'];
    }
    return potaId;
}

function getPotaReferencesFromFeature(feature) {
    const references = new Set();
    const directReference = feature.properties && feature.properties.tags && feature.properties.tags['communication:amateur_radio:pota'];
    splitPotaReferences(directReference).forEach(reference => references.add(reference));
    (feature.properties && feature.properties.relations || []).forEach(relation => {
        splitPotaReferences(relation.tags && relation.tags['communication:amateur_radio:pota'])
            .forEach(reference => references.add(reference));
    });
    return [...references];
}

function getPotaStatusSummary(value) {
    const references = Array.isArray(value) ? value : splitPotaReferences(value);
    let hasActive = false;
    let hasInactive = false;
    references.forEach(reference => {
        const status = potaStatus.get(normalizePotaReference(reference));
        if (!status || typeof status.active !== 'boolean') return;
        if (status.active) hasActive = true;
        else hasInactive = true;
    });
    if (hasActive && hasInactive) return 'mixed';
    if (hasInactive) return 'inactive';
    if (hasActive) return 'active';
    return 'unknown';
}

function getPotaStatusColor(summary) {
    if (summary === 'inactive') return '#757575';
    if (summary === 'mixed') return '#a66b00';
    return '#43a047';
}

function getPotaStatusMarkup(value) {
    const summary = getPotaStatusSummary(value);
    if (summary === 'inactive') {
        return '<br><span class="pota-status pota-status-inactive"><b>Currently inactive in the POTA catalogue.</b></span>' +
            '<br>This OSM feature is retained because the park may be reactivated in the future.';
    }
    if (summary === 'mixed') {
        return '<br><span class="pota-status pota-status-mixed"><b>Mixed POTA status.</b></span>' +
            '<br>One or more references on this OSM feature are currently inactive.';
    }
    return '';
}

function getPotaFeatureStyle(feature) {
    const summary = getPotaStatusSummary(getPotaReferencesFromFeature(feature));
    const color = getPotaStatusColor(summary);
    return {
        color,
        fillColor: color,
        weight: 4,
        opacity: 0.7,
        fillOpacity: summary === 'inactive' ? 0.22 : 0.3
    };
}

// OSM4Leaflet class implementation
class OSM4Leaflet extends L.Layer {
    constructor(options) {
        super(options);
        this.options = L.Util.extend({}, this.options, options);
        this.baseLayer = null;
        this.markerLayer = L.markerClusterGroup({
            chunkedLoading: true,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: cluster => {
                const childCount = cluster.getChildCount();
                return L.divIcon({
                    html: `<span class="pota-osm-cluster-count">${childCount}</span>`,
                    className: 'pota-osm-cluster',
                    iconSize: [44, 44]
                });
            }
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
        this.statusCache = { value: null, fetchedAt: 0 };
        this.statusRequest = null;
        this.statusRefreshMs = 5 * 60 * 1000;
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
        const requestId = ++this.loadRequestId;

        const { _southWest, _northEast } = extendedBounds;
        const bbox = {
            south: _southWest.lat,
            west: _southWest.lng,
            north: _northEast.lat,
            east: _northEast.lng
        };
        const area = bboxAreaKm2(bbox);
        if (area > MAX_BBOX_AREA_KM2) {
            this.baseLayer.clearLayers();
            this.markerLayer.clearLayers();
            this.catalogueLayer.clearLayers();
            this.showErrorPopup(`This map view covers about ${Math.round(area).toLocaleString()} km². Zoom in to ${MAX_BBOX_AREA_KM2.toLocaleString()} km² or less.`);
            return;
        }

        this.clearErrorPopup();
        const results = await Promise.allSettled([
            this.fetchPOTAData(this.buildOverpassQuery(extendedBounds)),
            this.fetchCatalogueData(extendedBounds),
            this.fetchStatusData()
        ]);
        if (requestId !== this.loadRequestId) return;

        const [osmResult, catalogueResult, statusResult] = results;
        if (statusResult.status === 'fulfilled' && statusResult.value && Array.isArray(statusResult.value.inactive)) {
            potaStatus = new Map(statusResult.value.inactive
                .map(reference => [normalizePotaReference(reference), { active: false }]));
        } else if (statusResult.status === 'rejected') {
            console.error('Error fetching POTA status data:', statusResult.reason);
        }
        let osmReferences = new Set();
        let osmError = null;
        if (osmResult.status === 'fulfilled' && osmResult.value && Array.isArray(osmResult.value.elements)) {
            osmReferences = collectPotaRefsFromResponse(osmResult.value);
            const namesResult = await Promise.allSettled([this.fetchNamesData(osmReferences)]);
            if (namesResult[0].status === 'fulfilled' && namesResult[0].value) {
                potaNames = new Map(Object.entries(namesResult[0].value.names || {})
                    .map(([reference, name]) => [normalizePotaReference(reference), String(name)]));
            } else {
                potaNames = new Map();
                console.error('Error fetching POTA name data:', namesResult[0].reason);
            }
            this.addData(osmResult.value);
        } else {
            osmError = 'OSM POTA features could not be loaded.';
        }

        if (osmError) this.showErrorPopup(osmError);
        if (catalogueResult.status === 'fulfilled' && catalogueResult.value) {
            this.addCatalogueData(catalogueResult.value, osmReferences);
        } else {
            console.error('Error fetching POTA catalogue data:', catalogueResult.reason);
            this.catalogueLayer.clearLayers();
            if (catalogueResult.reason && catalogueResult.reason.status === 413) {
                this.showErrorPopup(catalogueResult.reason.message);
            }
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
        const overpassUrl = window.OVERPASS_URL || 'https://api.spainip.es/v1/overpass/interpreter';
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
        if (!response.ok) {
            const details = await response.json().catch(() => ({}));
            const error = new Error(details.error || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    async fetchStatusData() {
        const now = Date.now();
        if (this.statusCache.value && now - this.statusCache.fetchedAt < this.statusRefreshMs) {
            return this.statusCache.value;
        }
        if (this.statusRequest) return this.statusRequest;

        const statusUrl = new URL(window.POTA_STATUS_URL || '/api/pota/status', window.location.href);
        this.statusRequest = (async () => {
            const response = await fetch(statusUrl, {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) {
                const details = await response.json().catch(() => ({}));
                throw new Error(details.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.statusCache = { value: data, fetchedAt: Date.now() };
            return data;
        })().finally(() => {
            this.statusRequest = null;
        });
        return this.statusRequest;
    }

    async fetchNamesData(references) {
        const namesUrl = new URL(window.POTA_NAMES_URL || '/api/pota/names', window.location.href);
        namesUrl.searchParams.set('references', [...references].join(','));
        const response = await fetch(namesUrl, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        if (!response.ok) {
            const details = await response.json().catch(() => ({}));
            throw new Error(details.error || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

    showErrorPopup(message = 'The selected area is too large. Please zoom in.') {
        const popupContent = `<div style="text-align: center;">${escapeHtml(message)}</div>`;
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
        if (!Array.isArray(catalogue.features)) return;

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
            const guideUrl = new URL('/help/index.html', window.location.origin);
            guideUrl.searchParams.set('lat', latitude);
            guideUrl.searchParams.set('lon', longitude);
            guideUrl.searchParams.set('zoom', '16');
            const popupContent = `<div class="pota-catalogue-popup"><b>${safeName}</b><br>` +
                `POTA ID: <a href="${potaUrl}" target="_blank" rel="noopener noreferrer">${safeReference}</a>` +
                '<br>This POTA park is not yet linked to an OpenStreetMap feature.' +
                '<br>The marker position comes from the POTA catalogue and may be approximate.' +
                `<br><a href="${guideUrl.href}" target="_blank" rel="noopener noreferrer">Help map it in OpenStreetMap</a>` +
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
        
        const potaElements = new Map();
        const markers = [];

        geojson.features.forEach(feature => {
            if (feature.geometry) {
                const potaId = getPotaIdFromFeature(feature);
                
                const isUnmapped = feature.properties.tags['unmapped_osm'] === 'true';
                
                if (potaId) {
                    const normalizedPotaId = normalizePotaReference(potaId);
                    if (!potaElements.has(normalizedPotaId)) {
                        potaElements.set(normalizedPotaId, []);
                    }
                    potaElements.get(normalizedPotaId).push(feature);
                }
                
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

            const name = getPotaOfficialName(potaId) || features[0].properties.tags.name || 'Unnamed';
            const isUnmapped = features[0].properties.tags['unmapped_osm'] === 'true';
            const statusSummary = getPotaStatusSummary(potaId);

            let popupContent = `<div class="pota-osm-popup"><b>${escapeHtml(name)}</b><br>POTA-ID: <a href="https://pota.app/#/park/${encodeURIComponent(potaId)}" target="_blank" rel="noopener noreferrer">${escapeHtml(potaId)}</a>`;
            popupContent += getPotaStatusMarkup(potaId);
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
            } else if (statusSummary === 'inactive' || statusSummary === 'mixed') {
                const iconName = statusSummary === 'inactive' ? 'pause_circle' : 'help_outline';
                const icon = L.divIcon({
                    html: `<span class="material-icons pota-inactive-icon" aria-label="${statusSummary === 'inactive' ? 'Inactive' : 'Mixed status'} POTA park">${iconName}</span>`,
                    className: `pota-inactive-marker pota-inactive-marker-${statusSummary}`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -15]
                });
                marker = L.marker(center, { icon });
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
        const highlightColor = darkenColor(getPotaFeatureStyle(features[0]).color, 15);
        features.forEach(feature => {
            const layer = this.baseLayer.getLayers().find(layer => layer.feature === feature);
            if (layer) {
                layer.setStyle({
                    color: highlightColor,
                    fillColor: highlightColor,
                    weight: 4,
                    opacity: 0.7,
                    fillOpacity: 0.45
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

function collectPotaRefsFromResponse(osmData) {
    const references = new Set();
    (osmData.elements || []).forEach(element => {
        const value = element.tags && element.tags['communication:amateur_radio:pota'];
        splitPotaReferences(value).forEach(reference => references.add(reference));
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

function buildSpotPopup(properties) {
    const activator = String(properties.activator || '').trim();
    const reference = String(properties.reference || properties.pota_ref || '').trim();
    const name = String(properties.name || properties.parkName || 'Unnamed').trim();
    const activatorMarkup = activator
        ? `<a href="${buildActivatorProfileUrl(activator)}" target="_blank" rel="noopener noreferrer">${escapeHtml(activator)}</a>`
        : 'Unknown';
    const referenceMarkup = reference
        ? `<a href="${buildParkUrl(reference)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference)}</a>`
        : 'Unknown';

    return '<div class="pota-spot-popup">' +
        `<div><b>Last Seen:</b> ${escapeHtml(formatSpotLastSeen(properties.spotTime))}</div>` +
        `<div><b>Activator:</b> ${activatorMarkup}</div>` +
        `<div><b>Mode:</b> ${escapeHtml(properties.mode || 'Unknown')}</div>` +
        `<div><b>Frequency:</b> ${escapeHtml(properties.frequency || 'Unknown')}</div>` +
        `<div><b>Reference:</b> ${referenceMarkup}</div>` +
        `<div><b>Name:</b> ${escapeHtml(name)}</div>` +
        '</div>';
}

class PotaSpotsLayer extends L.Layer {
    constructor(options = {}) {
        super(options);
        this.options = L.Util.extend({}, this.options, options);
        this.layer = L.layerGroup();
        this.loadRequestId = 0;
        this.loadTimeout = null;
        this.refreshTimer = null;
        this.refreshMs = 60 * 1000;
    }

    onAdd(map) {
        this.map = map;
        if (!map.getPane('potaSpotsPane')) {
            map.createPane('potaSpotsPane');
            map.getPane('potaSpotsPane').style.zIndex = 650;
        }
        map.addLayer(this.layer);
        map.on('moveend', this.debouncedLoad, this);
        this.load();
        this.refreshTimer = setInterval(() => this.load(), this.refreshMs);
    }

    onRemove(map) {
        map.off('moveend', this.debouncedLoad, this);
        map.removeLayer(this.layer);
        if (this.loadTimeout) clearTimeout(this.loadTimeout);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.loadTimeout = null;
        this.refreshTimer = null;
    }

    debouncedLoad() {
        if (this.loadTimeout) clearTimeout(this.loadTimeout);
        this.loadTimeout = setTimeout(() => this.load(), 250);
    }

    async fetchSpotsData(bounds) {
        const { _southWest, _northEast } = bounds;
        const url = buildSpotsRequestUrl(window.POTA_SPOTS_URL || 'https://api.spainip.es/v1/pota/spots', {
            south: _southWest.lat,
            west: _southWest.lng,
            north: _northEast.lat,
            east: _northEast.lng
        });
        const response = await fetch(url, {
            headers: { Accept: 'application/geo+json, application/json' },
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

    async load() {
        if (!this.map) return;
        const requestId = ++this.loadRequestId;
        try {
            const data = await this.fetchSpotsData(this.map.getBounds());
            if (requestId !== this.loadRequestId) return;
            this.addData(data);
        } catch (error) {
            if (requestId !== this.loadRequestId) return;
            console.error('Error fetching POTA spots data:', error);
            this.layer.clearLayers();
        }
    }

    addData(data) {
        this.layer.clearLayers();
        if (!data || !Array.isArray(data.features)) return;

        data.features.forEach(feature => {
            const coordinates = feature.geometry && feature.geometry.coordinates;
            if (!Array.isArray(coordinates) || coordinates.length < 2) return;
            const [longitude, latitude] = coordinates;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

            const properties = feature.properties || {};
            const marker = L.marker([latitude, longitude], {
                pane: 'potaSpotsPane',
                icon: L.divIcon({
                    html: '<span class="pota-spot-icon" aria-hidden="true">' +
                        '<span class="material-icons">settings_input_antenna</span>' +
                        '<span class="pota-spot-wave pota-spot-wave-1"></span>' +
                        '<span class="pota-spot-wave pota-spot-wave-2"></span>' +
                        '</span>',
                    className: 'pota-spot-marker',
                    iconSize: [38, 38],
                    iconAnchor: [19, 19],
                    popupAnchor: [0, -19]
                })
            });
            marker.bindPopup(buildSpotPopup(properties));
            marker.on('popupopen', () => marker.setPopupContent(buildSpotPopup(properties)));
            marker.addTo(this.layer);
        });
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
        style: getPotaFeatureStyle,
        onEachFeature: function(feature, layer) {
            const potaId = getPotaIdFromFeature(feature);
            const name = getPotaOfficialName(potaId) || feature.properties.tags.name || 'Unnamed';
            if (potaId) {
                const popupContent = `<div class="pota-osm-popup"><b>${escapeHtml(name)}</b><br>POTA-ID: <a href="https://pota.app/#/park/${encodeURIComponent(potaId)}" target="_blank" rel="noopener noreferrer">${escapeHtml(potaId)}</a>${getPotaStatusMarkup(potaId)}</div>`;
                layer.bindPopup(popupContent);
            }

            layer.on({
                mouseover: function(e) {
                    const layer = e.target;
                    const highlightColor = darkenColor(getPotaFeatureStyle(feature).color, 15);
                    layer.setStyle({ color: highlightColor, fillColor: highlightColor, weight: 4, opacity: 0.7, fillOpacity: 0.45 });
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
            const style = getPotaFeatureStyle(feature);
            return L.circleMarker(latlng, {
                radius: 5,
                fillColor: style.fillColor,
                color: '#000',
                weight: 2,
                opacity: 1,
                fillOpacity: style.fillOpacity === 0.22 ? 0.65 : 0.8
            });
        }
    }
});
osmLayer.addTo(map);

const potaCatalogueLayer = osmLayer.catalogueLayer;
potaCatalogueLayer.addTo(map);
const potaSpotsLayer = new PotaSpotsLayer();
potaSpotsLayer.addTo(map);
L.control.layers(null, {
    'OpenStreetMap POTA features': osmLayer,
    'Active POTA parks not linked in OSM': potaCatalogueLayer,
    'Current POTA spots': potaSpotsLayer
}, { collapsed: true }).addTo(map);

const statusLegend = L.control({ position: 'topright' });
statusLegend.onAdd = () => {
    const container = L.DomUtil.create('div', 'pota-status-legend');
    container.innerHTML = '<b>POTA status</b>' +
        '<span><i class="pota-legend-swatch pota-legend-active"></i>Active</span>' +
        '<span><i class="pota-legend-swatch pota-legend-inactive"></i>Inactive</span>' +
        '<span><i class="pota-legend-swatch pota-legend-unmapped"></i>Unmapped active park</span>';
    L.DomEvent.disableClickPropagation(container);
    return container;
};
statusLegend.addTo(map);

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
