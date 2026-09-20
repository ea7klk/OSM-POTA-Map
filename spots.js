'use strict';

(function exposeSpotsApi(root, moduleObject) {
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
        getSpotDisplayValues,
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
