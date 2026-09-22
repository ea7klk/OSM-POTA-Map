'use strict';

(function exposeSpotsApi(root, moduleObject) {
    // These ranges cover the commonly used IARU amateur allocations while
    // accepting the region-specific portions used by POTA activators.
    const IARU_BANDS = [
        { value: '160m', label: '160 m', minMHz: 1.8, maxMHz: 2.0 },
        { value: '80m', label: '80 m', minMHz: 3.5, maxMHz: 4.0 },
        { value: '60m', label: '60 m', minMHz: 5.25, maxMHz: 5.45 },
        { value: '40m', label: '40 m', minMHz: 7.0, maxMHz: 7.3 },
        { value: '30m', label: '30 m', minMHz: 10.1, maxMHz: 10.15 },
        { value: '20m', label: '20 m', minMHz: 14.0, maxMHz: 14.35 },
        { value: '17m', label: '17 m', minMHz: 18.068, maxMHz: 18.168 },
        { value: '15m', label: '15 m', minMHz: 21.0, maxMHz: 21.45 },
        { value: '12m', label: '12 m', minMHz: 24.89, maxMHz: 24.99 },
        { value: '10m', label: '10 m', minMHz: 28.0, maxMHz: 29.7 },
        { value: '6m', label: '6 m', minMHz: 50.0, maxMHz: 54.0 },
        { value: '4m', label: '4 m', minMHz: 70.0, maxMHz: 70.5 },
        { value: '2m', label: '2 m', minMHz: 144.0, maxMHz: 148.0 },
        { value: '70cm', label: '70 cm', minMHz: 420.0, maxMHz: 450.0 },
        { value: '23cm', label: '23 cm', minMHz: 1240.0, maxMHz: 1300.0 }
    ];

    function parseSpotTime(value) {
        const text = String(value || '').trim();
        if (!text) return null;

        // The spots API returns UTC timestamps without an explicit offset.
        const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
        const timestamp = Date.parse(normalized);
        return Number.isNaN(timestamp) ? null : timestamp;
    }

    function formatUnit(value, unit) {
        return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
    }

    function formatSpotLastSeen(value, now = new Date()) {
        const timestamp = parseSpotTime(value);
        const nowTimestamp = now instanceof Date ? now.getTime() : Date.parse(now);
        if (timestamp === null || Number.isNaN(nowTimestamp)) return 'Unknown';

        const differenceSeconds = Math.max(0, Math.floor((nowTimestamp - timestamp) / 1000));
        if (differenceSeconds === 0) return 'just now';
        if (differenceSeconds < 60) return formatUnit(differenceSeconds, 'second');
        if (differenceSeconds < 3600) return formatUnit(Math.floor(differenceSeconds / 60), 'minute');
        if (differenceSeconds < 86400) return formatUnit(Math.floor(differenceSeconds / 3600), 'hour');
        return formatUnit(Math.floor(differenceSeconds / 86400), 'day');
    }

    function buildSpotsRequestUrl(baseUrl, bounds) {
        const url = new URL(baseUrl, 'https://potamap.local');
        url.search = new URLSearchParams({
            south: bounds.south,
            west: bounds.west,
            north: bounds.north,
            east: bounds.east
        }).toString();
        return url.href;
    }

    function buildActivatorProfileUrl(activator) {
        return `https://pota.app/#/profile/${encodeURIComponent(String(activator || '').trim())}`;
    }

    function buildParkUrl(reference) {
        return `https://pota.app/#/park/${encodeURIComponent(String(reference || '').trim())}`;
    }

    function getSpotDisplayValues(properties = {}) {
        return {
            spotTime: String(properties.spotTime || '').trim(),
            reference: String(properties.reference || properties.pota_ref || '').trim(),
            name: String(properties.name || properties.parkName || 'Unnamed').trim(),
            mode: String(properties.mode || 'Unknown').trim(),
            frequency: String(properties.frequency || 'Unknown').trim(),
            activator: String(properties.activator || '').trim()
        };
    }

    function parseFrequencyMHz(value) {
        const text = String(value || '').trim().replace(',', '.');
        if (!text) return null;

        const numericMatch = text.match(/[0-9]+(?:\.[0-9]+)?/);
        if (!numericMatch) return null;
        const numericValue = Number(numericMatch[0]);
        if (!Number.isFinite(numericValue)) return null;

        if (/\bghz\b/i.test(text)) return numericValue * 1000;
        if (/\bkhz\b/i.test(text)) return numericValue / 1000;
        if (/\bhz\b/i.test(text)) return numericValue / 1000000;
        if (numericValue >= 1000000) return numericValue / 1000000;
        if (numericValue >= 1000) return numericValue / 1000;
        return numericValue;
    }

    function getIaruBand(value) {
        const frequencyMHz = parseFrequencyMHz(value);
        if (frequencyMHz === null) return null;
        const band = IARU_BANDS.find(({ minMHz, maxMHz }) =>
            frequencyMHz >= minMHz && frequencyMHz <= maxMHz
        );
        return band ? band.value : null;
    }

    function getIaruBandOptions() {
        return IARU_BANDS.map(({ value, label }) => ({ value, label }));
    }

    function normalizeSpotMode(value) {
        return String(value || '').trim().toUpperCase();
    }

    function filterSpotFeatures(features, filters = {}) {
        const selectedMode = normalizeSpotMode(filters.mode);
        const selectedBand = String(filters.band || '').trim();
        return (Array.isArray(features) ? features : []).filter(feature => {
            const properties = feature && feature.properties || {};
            const modeMatches = !selectedMode || normalizeSpotMode(properties.mode) === selectedMode;
            const bandMatches = !selectedBand || getIaruBand(properties.frequency) === selectedBand;
            return modeMatches && bandMatches;
        });
    }

    function sortSpotFeaturesByNewest(features) {
        return (Array.isArray(features) ? features : []).slice().sort((left, right) => {
            const leftTime = parseSpotTime(left && left.properties && left.properties.spotTime);
            const rightTime = parseSpotTime(right && right.properties && right.properties.spotTime);
            if (leftTime === null && rightTime === null) return 0;
            if (leftTime === null) return 1;
            if (rightTime === null) return -1;
            return rightTime - leftTime;
        });
    }

    const api = {
        buildActivatorProfileUrl,
        buildParkUrl,
        buildSpotsRequestUrl,
        formatSpotLastSeen,
        filterSpotFeatures,
        getIaruBand,
        getIaruBandOptions,
        getSpotDisplayValues,
        normalizeSpotMode,
        parseFrequencyMHz,
        parseSpotTime,
        sortSpotFeaturesByNewest
    };

    if (moduleObject) {
        moduleObject.exports = api;
    }

    if (root) {
        root.POTAMAP_SPOTS = api;
    }
})(typeof window !== 'undefined' ? window : null, typeof module !== 'undefined' ? module : null);
