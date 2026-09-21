//Add Material Icons font
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
document.head.appendChild(link);
const {
    MAX_BBOX_AREA_KM2,
    bboxAreaKm2,
    normalizeBounds,
    normalizeLongitude
} = window.POTAMAP_BBOX_LIMITS;
const {
    buildActivatorProfileUrl,
    buildParkUrl,
    buildSpotsRequestUrl,
    formatSpotLastSeen,
    getSpotDisplayValues,
    sortSpotFeaturesByNewest
} = window.POTAMAP_SPOTS;
let potaNames = new Map();
let potaStatus = new Map();
const potaLayerSelection = {
    mapped: true,
    unmapped: true,
    spots: true
};
const POTA_LAYER_SELECTION_COOKIE = 'potaLayerSelection';

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

function normalizePotaActive(value) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    return null;
}

function updatePotaStatus(data) {
    const parks = data && data.parks && typeof data.parks === 'object' ? data.parks : {};
    potaStatus = new Map(Object.entries(parks)
        .map(([reference, status]) => [
            normalizePotaReference(reference),
            normalizePotaActive(status && typeof status === 'object' ? status.active : status)
        ])
        .filter(([reference, active]) => reference && active !== null));
}

function getPotaStatusSummary(value) {
    const references = Array.isArray(value) ? value : splitPotaReferences(value);
    let hasActive = false;
    let hasInactive = false;
    references.forEach(reference => {
        const active = potaStatus.get(normalizePotaReference(reference));
        if (typeof active !== 'boolean') return;
        if (active) hasActive = true;
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

function getMapRequestBounds(map) {
    const bounds = map.getBounds();
    return normalizeBounds({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
    });
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
        const shouldLoadMapped = potaLayerSelection.mapped;
        const shouldLoadUnmapped = potaLayerSelection.unmapped;
        const bounds = getMapRequestBounds(this.map);
        const requestId = ++this.loadRequestId;

        if (!bounds) {
            this.showErrorPopup('The current map bounds are invalid. Please move or zoom the map and try again.');
            return;
        }

        if (!shouldLoadMapped) {
            this.baseLayer.clearLayers();
            this.markerLayer.clearLayers();
        }
        if (!shouldLoadUnmapped) {
            this.catalogueLayer.clearLayers();
        }
        if (!shouldLoadMapped && !shouldLoadUnmapped) {
            this.clearErrorPopup();
            return;
        }

        const bbox = {
            south: bounds.south,
            west: bounds.west,
            north: bounds.north,
            east: bounds.east
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
            shouldLoadMapped
                ? this.fetchPOTAData(this.buildOverpassQuery(bounds))
                : Promise.resolve(null),
            shouldLoadUnmapped
                ? this.fetchCatalogueData(bounds)
                : Promise.resolve(null),
        ]);
        if (requestId !== this.loadRequestId) return;

        const [osmResult, catalogueResult] = results;
        let osmReferences = new Set();
        let osmError = null;
        if (shouldLoadMapped && osmResult.status === 'fulfilled' && osmResult.value && Array.isArray(osmResult.value.elements)) {
            osmReferences = collectPotaRefsFromResponse(osmResult.value);
            if (osmReferences.size > 0) {
                const [namesResult, statusResult] = await Promise.allSettled([
                    this.fetchNamesData(osmReferences),
                    this.fetchStatusData(osmReferences)
                ]);
                if (statusResult.status === 'fulfilled' && statusResult.value) {
                    updatePotaStatus(statusResult.value);
                } else {
                    potaStatus = new Map();
                    console.error('Error fetching POTA status data:', statusResult.reason);
                }
                if (namesResult.status === 'fulfilled' && namesResult.value) {
                    potaNames = new Map(Object.entries(namesResult.value.names || {})
                        .map(([reference, name]) => [normalizePotaReference(reference), String(name)]));
                } else {
                    potaNames = new Map();
                    console.error('Error fetching POTA name data:', namesResult.reason);
                }
            } else {
                potaNames = new Map();
                potaStatus = new Map();
            }
            this.addData(osmResult.value);
        } else if (shouldLoadMapped) {
            osmError = 'OSM POTA features could not be loaded.';
        }

        if (osmError) this.showErrorPopup(osmError);
        if (shouldLoadUnmapped && catalogueResult.status === 'fulfilled' && catalogueResult.value) {
            this.addCatalogueData(catalogueResult.value);
        } else if (shouldLoadUnmapped) {
            console.error('Error fetching POTA catalogue data:', catalogueResult.reason);
            this.catalogueLayer.clearLayers();
            if (catalogueResult.reason && catalogueResult.reason.status === 413) {
                this.showErrorPopup(catalogueResult.reason.message);
            }
        }
    }

    buildOverpassQuery(bounds) {
        return `[out:json][timeout:60];nwr["communication:amateur_radio:pota"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out geom;`;
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
        const catalogueUrl = new URL(window.POTA_CATALOGUE_URL || 'https://api.spainip.es/v1/pota/unmapped');
        catalogueUrl.search = new URLSearchParams({
            south: bounds.south,
            west: bounds.west,
            north: bounds.north,
            east: bounds.east
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

    async fetchNamesData(references) {
        const namesUrl = new URL(window.POTA_NAMES_URL || 'https://api.spainip.es/v1/pota/names');
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

    async fetchStatusData(references) {
        const statusUrl = new URL(window.POTA_STATUS_URL || 'https://api.spainip.es/v1/pota/status');
        statusUrl.searchParams.set('references', [...references].join(','));
        const response = await fetch(statusUrl, {
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

    addCatalogueData(catalogue) {
        this.catalogueLayer.clearLayers();
        if (!Array.isArray(catalogue.features)) return;

        catalogue.features.forEach(feature => {
            const properties = feature.properties || {};
            const reference = String(properties.pota_ref || '').trim();
            const normalizedReference = normalizePotaReference(reference);
            const coordinates = feature.geometry && feature.geometry.coordinates;
            if (!reference || !normalizedReference || !Array.isArray(coordinates) || coordinates.length < 2) return;

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
            let popupContent = `<div class="pota-osm-popup"><b>${escapeHtml(name)}</b><br>POTA-ID: <a href="https://pota.app/#/park/${encodeURIComponent(potaId)}" target="_blank" rel="noopener noreferrer">${escapeHtml(potaId)}</a>`;
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
            } else if (getPotaStatusSummary(potaId) === 'inactive' || getPotaStatusSummary(potaId) === 'mixed') {
                const statusSummary = getPotaStatusSummary(potaId);
                const iconName = statusSummary === 'inactive' ? 'pause_circle' : 'help_outline';
                const statusIcon = L.divIcon({
                    html: `<span class="material-icons pota-inactive-icon" aria-label="${statusSummary === 'inactive' ? 'Inactive' : 'Mixed status'} POTA park">${iconName}</span>`,
                    className: `pota-inactive-marker pota-inactive-marker-${statusSummary}`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -15]
                });
                marker = L.marker(center, { icon: statusIcon });
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

    setSelection(selection) {
        if (!selection.mapped) {
            this.baseLayer.clearLayers();
            this.markerLayer.clearLayers();
        }
        if (!selection.unmapped) {
            this.catalogueLayer.clearLayers();
        }
        this.debouncedLoadData();
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
        this.refreshMs = 30 * 1000;
        this.isVisible = potaLayerSelection.spots;
    }

    onAdd(map) {
        this.map = map;
        if (!map.getPane('potaSpotsPane')) {
            map.createPane('potaSpotsPane');
            map.getPane('potaSpotsPane').style.zIndex = 650;
        }
        map.addLayer(this.layer);
        map.on('moveend', this.debouncedLoad, this);
        if (this.isVisible) this.load();
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
        if (!this.isVisible) return;
        if (this.loadTimeout) clearTimeout(this.loadTimeout);
        this.loadTimeout = setTimeout(() => this.load(), 250);
    }

    async fetchSpotsData(bounds) {
        const url = buildSpotsRequestUrl(window.POTA_SPOTS_URL || 'https://api.spainip.es/v1/pota/spots', {
            south: bounds.south,
            west: bounds.west,
            north: bounds.north,
            east: bounds.east
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
        if (!this.map || !this.isVisible) return;
        const requestId = ++this.loadRequestId;
        try {
            const bounds = getMapRequestBounds(this.map);
            if (!bounds) return;
            const data = await this.fetchSpotsData(bounds);
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

    setVisible(visible) {
        this.isVisible = Boolean(visible);
        this.loadRequestId += 1;
        if (!this.isVisible) {
            this.layer.clearLayers();
        } else if (this.map) {
            this.load();
        }
    }
}

class PotaSpotsPanel extends L.Control {
    constructor(options = {}) {
        super(L.Util.extend({ position: 'topright' }, options));
        this.features = [];
        this.loadRequestId = 0;
        this.refreshTimer = null;
        this.refreshMs = 30 * 1000;
        this.isCollapsed = true;
        this.isVisible = potaLayerSelection.spots;
    }

    onAdd(map) {
        this.map = map;
        this.container = L.DomUtil.create('section', 'pota-spots-panel is-collapsed');
        this.container.setAttribute('aria-label', 'POTA Spots');
        this.container.innerHTML = '<button type="button" class="pota-spots-panel-toggle" aria-expanded="false">' +
            '<span class="pota-spots-panel-title">POTA Spots</span>' +
            '<span class="material-icons pota-spots-panel-toggle-icon" aria-hidden="true">expand_more</span>' +
            '</button>' +
            '<div class="pota-spots-panel-content">' +
            '<div class="pota-spots-panel-status" role="status">Loading current spots…</div>' +
            '<div class="pota-spots-table-header" role="row">' +
            '<span>Name / Reference</span><span>Last seen · Mode · Frequency · Activator</span>' +
            '</div>' +
            '<div class="pota-spots-list" role="rowgroup"></div>' +
            '</div>';

        this.toggleButton = this.container.querySelector('.pota-spots-panel-toggle');
        this.toggleIcon = this.container.querySelector('.pota-spots-panel-toggle-icon');
        this.statusElement = this.container.querySelector('.pota-spots-panel-status');
        this.listElement = this.container.querySelector('.pota-spots-list');

        L.DomEvent.disableClickPropagation(this.container);
        L.DomEvent.disableScrollPropagation(this.container);
        L.DomEvent.on(this.toggleButton, 'click', this.toggle, this);
        L.DomEvent.on(this.listElement, 'click', this.handleListClick, this);

        if (this.isVisible) {
            this.load();
        } else {
            this.statusElement.textContent = 'Spots hidden — enable Spots to load.';
        }
        this.refreshTimer = setInterval(() => this.load(), this.refreshMs);
        return this.container;
    }

    onRemove() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        L.DomEvent.off(this.toggleButton, 'click', this.toggle, this);
        L.DomEvent.off(this.listElement, 'click', this.handleListClick, this);
        this.refreshTimer = null;
    }

    toggle() {
        this.isCollapsed = !this.isCollapsed;
        this.container.classList.toggle('is-collapsed', this.isCollapsed);
        this.toggleButton.setAttribute('aria-expanded', String(!this.isCollapsed));
        this.toggleIcon.textContent = this.isCollapsed ? 'expand_more' : 'expand_less';
    }

    async fetchAllSpotsData() {
        return this.fetchSpotsData({
            south: -90,
            west: -180,
            north: 90,
            east: 180
        });
    }

    async fetchSpotsData(bounds) {
        const url = buildSpotsRequestUrl(window.POTA_SPOTS_URL || 'https://api.spainip.es/v1/pota/spots', bounds);
        const response = await fetch(url, {
            headers: { Accept: 'application/geo+json, application/json' },
            cache: 'no-store'
        });
        if (!response.ok) {
            const details = await response.json().catch(() => ({}));
            throw new Error(details.error || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

    async load() {
        if (!this.isVisible) return;
        const requestId = ++this.loadRequestId;
        try {
            const data = await this.fetchAllSpotsData();
            if (requestId !== this.loadRequestId) return;
            this.features = sortSpotFeaturesByNewest(data.features);
            this.render();
        } catch (error) {
            if (requestId !== this.loadRequestId) return;
            this.features = [];
            this.listElement.innerHTML = '';
            this.statusElement.textContent = 'Unable to load current POTA spots.';
            console.error('Error fetching all POTA spots for the panel:', error);
        }
    }

    render() {
        this.statusElement.textContent = `${this.features.length.toLocaleString()} current spots`;
        this.listElement.innerHTML = this.features.map((feature, index) => {
            const values = getSpotDisplayValues(feature.properties || {});
            const coordinates = feature.geometry && feature.geometry.coordinates;
            const { reference, name, mode, frequency, activator, spotTime } = values;
            const canCenter = Array.isArray(coordinates) && coordinates.length >= 2 &&
                Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]));
            const referenceMarkup = reference && canCenter
                ? `<button type="button" class="pota-spots-reference" data-spot-index="${index}">${escapeHtml(reference)}</button>`
                : escapeHtml(reference || 'Unknown');
            const activatorMarkup = activator
                ? `<a href="${buildActivatorProfileUrl(activator)}" target="_blank" rel="noopener noreferrer">${escapeHtml(activator)}</a>`
                : 'Unknown';
            return '<div class="pota-spots-row" role="row">' +
                '<div class="pota-spots-row-line pota-spots-row-seen">' +
                `<span class="pota-spots-field"><b>Last seen</b> ${escapeHtml(formatSpotLastSeen(spotTime))}</span>` +
                `<span class="pota-spots-reference-cell"><b>Reference</b> ${referenceMarkup}</span>` +
                '</div>' +
                '<div class="pota-spots-row-line pota-spots-row-name">' +
                `<span class="pota-spots-name"><b>Name</b> ${escapeHtml(name)}</span>` +
                '</div>' +
                '<div class="pota-spots-row-line pota-spots-row-details">' +
                `<span class="pota-spots-field"><b>Mode</b> ${escapeHtml(mode)}</span>` +
                `<span class="pota-spots-field"><b>Frequency</b> ${escapeHtml(frequency)}</span>` +
                `<span class="pota-spots-field"><b>Activator</b> ${activatorMarkup}</span>` +
                '</div>' +
                '</div>';
        }).join('');
    }

    handleListClick(event) {
        const referenceButton = event.target.closest('.pota-spots-reference');
        if (!referenceButton) return;

        const feature = this.features[Number(referenceButton.dataset.spotIndex)];
        const coordinates = feature && feature.geometry && feature.geometry.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;

        const [longitude, latitude] = coordinates.map(Number);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        this.map.setView([latitude, longitude], 9);
    }

    setVisible(visible) {
        this.isVisible = Boolean(visible);
        this.loadRequestId += 1;
        if (!this.isVisible) {
            this.features = [];
            this.listElement.innerHTML = '';
            this.statusElement.textContent = 'Spots hidden — enable Spots to load.';
        } else if (this.map) {
            this.statusElement.textContent = 'Loading current spots…';
            this.load();
        }
    }
}

class PotaLayerVisibilityControl extends L.Control {
    constructor(options = {}) {
        super(L.Util.extend({ position: 'topleft' }, options));
        this.onSelectionChange = null;
    }

    onAdd(map) {
        this.map = map;
        this.container = L.DomUtil.create('div', 'pota-layer-visibility leaflet-control');
        this.container.setAttribute('aria-label', 'Map visibility');
        this.container.innerHTML = '<div class="pota-layer-visibility-title">Show</div>' +
            '<div class="pota-layer-visibility-actions">' +
            '<button type="button" data-visibility-action="all">All</button>' +
            '<button type="button" data-visibility-action="none">None</button>' +
            '</div>' +
            `<label><input type="checkbox" data-visibility-layer="mapped"${potaLayerSelection.mapped ? ' checked' : ''}>Mapped parks</label>` +
            `<label><input type="checkbox" data-visibility-layer="unmapped"${potaLayerSelection.unmapped ? ' checked' : ''}>Unmapped parks</label>` +
            `<label><input type="checkbox" data-visibility-layer="spots"${potaLayerSelection.spots ? ' checked' : ''}>Spots</label>`;
        L.DomEvent.disableClickPropagation(this.container);
        L.DomEvent.disableScrollPropagation(this.container);
        L.DomEvent.on(this.container, 'change', this.handleChange, this);
        L.DomEvent.on(this.container, 'click', this.handleClick, this);
        return this.container;
    }

    onRemove() {
        L.DomEvent.off(this.container, 'change', this.handleChange, this);
        L.DomEvent.off(this.container, 'click', this.handleClick, this);
    }

    getSelection() {
        return { ...potaLayerSelection };
    }

    setSelection(selection) {
        Object.keys(potaLayerSelection).forEach(layerName => {
            if (typeof selection[layerName] === 'boolean') {
                potaLayerSelection[layerName] = selection[layerName];
            }
            const input = this.container.querySelector(`[data-visibility-layer="${layerName}"]`);
            if (input) input.checked = potaLayerSelection[layerName];
        });
        this.emitSelectionChange();
    }

    emitSelectionChange() {
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this.getSelection());
        }
    }

    handleChange(event) {
        const input = event.target.closest('[data-visibility-layer]');
        if (!input) return;
        potaLayerSelection[input.dataset.visibilityLayer] = input.checked;
        savePotaLayerSelection();
        this.emitSelectionChange();
    }

    handleClick(event) {
        const button = event.target.closest('[data-visibility-action]');
        if (!button) return;
        const value = button.dataset.visibilityAction === 'all';
        Object.keys(potaLayerSelection).forEach(layerName => {
            potaLayerSelection[layerName] = value;
            const input = this.container.querySelector(`[data-visibility-layer="${layerName}"]`);
            if (input) input.checked = value;
        });
        savePotaLayerSelection();
        this.emitSelectionChange();
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

function loadPotaLayerSelection() {
    const savedSelection = getCookie(POTA_LAYER_SELECTION_COOKIE);
    if (!savedSelection) return;

    try {
        const parsedSelection = JSON.parse(decodeURIComponent(savedSelection));
        Object.keys(potaLayerSelection).forEach(layerName => {
            if (typeof parsedSelection[layerName] === 'boolean') {
                potaLayerSelection[layerName] = parsedSelection[layerName];
            }
        });
    } catch (error) {
        console.warn('Ignoring invalid saved POTA layer selection:', error);
    }
}

function savePotaLayerSelection() {
    setCookie(
        POTA_LAYER_SELECTION_COOKIE,
        encodeURIComponent(JSON.stringify(potaLayerSelection)),
        30
    );
}

loadPotaLayerSelection();

// Check if there's a saved location in cookies
const savedView = getCookie('mapView');
if (savedView) {
    const [lat, lng, zoom] = savedView.split(',').map(Number);
    const normalizedLng = normalizeLongitude(lng);
    if (Number.isFinite(lat) && normalizedLng !== null && Number.isFinite(zoom)) {
        initialView = [Math.max(-90, Math.min(90, lat)), normalizedLng];
        initialZoom = zoom;
    }
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

const potaSpotsPanel = new PotaSpotsPanel();
potaSpotsPanel.addTo(map);

const statusLegend = L.control({ position: 'topleft' });
statusLegend.onAdd = () => {
    const container = L.DomUtil.create('div', 'pota-status-legend');
    container.innerHTML = '<b>POTA status</b>' +
        '<span><i class="pota-legend-swatch pota-legend-active"></i>Active mapped park</span>' +
        '<span><i class="pota-legend-swatch pota-legend-inactive"></i>Inactive mapped park</span>' +
        '<span><i class="pota-legend-swatch pota-legend-unmapped"></i>Unmapped active park</span>';
    L.DomEvent.disableClickPropagation(container);
    return container;
};

const visibilityControl = new PotaLayerVisibilityControl();
visibilityControl.addTo(map);
visibilityControl.onSelectionChange = selection => {
    osmLayer.setSelection(selection);
    potaSpotsLayer.setVisible(selection.spots);
    potaSpotsPanel.setVisible(selection.spots);
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

    const normalizedLng = normalizeLongitude(center.lng);
    if (normalizedLng !== null && Math.abs(center.lng - normalizedLng) > 1e-9) {
        map.setView([center.lat, normalizedLng], zoom, { animate: false });
        return;
    }

    setCookie('mapView', `${center.lat},${center.lng},${zoom}`, 30); // Save for 30 days
});

// Load data only on moveend, with debounce
map.on('moveend', () => {
    osmLayer.debouncedLoadData();
});

// Initial data load
osmLayer.loadData();
