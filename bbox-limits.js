(function () {
    const MAX_BBOX_AREA_KM2 = 50_000_000;
    const MAX_ELEMENTS = 4_000;

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

    const bboxLimits = { MAX_BBOX_AREA_KM2, MAX_ELEMENTS, bboxAreaKm2, parseBounds };

    if (typeof module !== 'undefined' && module.exports) module.exports = bboxLimits;
    if (typeof window !== 'undefined') window.POTAMAP_BBOX_LIMITS = bboxLimits;
})();
