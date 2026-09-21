(function () {
    const MAX_BBOX_AREA_KM2 = 50_000_000;

    function bboxAreaKm2(bounds) {
        const height = 111.32 * Math.abs(bounds.north - bounds.south);
        const middleLatitude = (bounds.north + bounds.south) / 2;
        const longitudeSpan = bounds.west <= bounds.east
            ? bounds.east - bounds.west
            : 360 - bounds.west + bounds.east;
        const width = 111.32 * Math.max(0.03, Math.cos(middleLatitude * Math.PI / 180)) *
            Math.min(360, Math.max(0, longitudeSpan));
        return height * width;
    }

    function normalizeLongitude(value) {
        const longitude = Number(value);
        if (!Number.isFinite(longitude)) return null;

        const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
        return wrapped === -180 && longitude > 0 ? 180 : wrapped;
    }

    function normalizeBounds(bounds) {
        if (!bounds) return null;

        const values = ['south', 'west', 'north', 'east'].map(key => Number(bounds[key]));
        if (!values.every(Number.isFinite)) return null;

        const south = Math.max(-90, Math.min(90, values[0]));
        const north = Math.max(-90, Math.min(90, values[2]));
        if (south > north) return null;

        const west = normalizeLongitude(values[1]);
        const east = normalizeLongitude(values[3]);
        if (west === null || east === null) return null;

        return { south, west, north, east };
    }

    function parseBounds(query) {
        const values = ['south', 'west', 'north', 'east'].map(key => query[key]);
        if (values.some(value => value === undefined || value === '')) return null;

        const [south, west, north, east] = values.map(Number);
        if (![south, west, north, east].every(Number.isFinite)) return null;
        if (south < -90 || south > 90 || north < -90 || north > 90) return null;
        if (west < -180 || west > 180 || east < -180 || east > 180) return null;
        if (south > north) return null;
        return { south, west, north, east };
    }

    const bboxLimits = {
        MAX_BBOX_AREA_KM2,
        bboxAreaKm2,
        normalizeBounds,
        parseBounds
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = bboxLimits;
    if (typeof window !== 'undefined') window.POTAMAP_BBOX_LIMITS = bboxLimits;
})();
