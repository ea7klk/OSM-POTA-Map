const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PotaCatalogueService,
    collectPotaReferences,
    isInsideBounds,
    millisecondsUntilNextUtcHour,
    parsePotaActive,
    parsePotaCsv
} = require('../pota-catalogue');

const csv = [
    'name,longitude,active,reference,latitude,extra',
    'Mapped Park,-3.5,1,ES-0001,40.4,',
    '"Unmapped, Park",-4.25,1,ES-0002,41.75,',
    'Inactive Park,-4,0,ES-0003,41,',
    'No coordinates,,1,ES-0004,, '
].join('\r\n');

test('parses quoted CSV cells, reordered headers, active status and coordinates', () => {
    const parks = parsePotaCsv(csv);

    assert.deepEqual(parks, [
        { reference: 'ES-0001', name: 'Mapped Park', latitude: 40.4, longitude: -3.5, active: true },
        { reference: 'ES-0002', name: 'Unmapped, Park', latitude: 41.75, longitude: -4.25, active: true },
        { reference: 'ES-0003', name: 'Inactive Park', latitude: 41, longitude: -4, active: false }
    ]);
});

test('parses active status values without treating unknown values as active', () => {
    assert.equal(parsePotaActive('1'), true);
    assert.equal(parsePotaActive('TRUE'), true);
    assert.equal(parsePotaActive('0'), false);
    assert.equal(parsePotaActive('inactive'), false);
    assert.equal(parsePotaActive(''), null);
    assert.equal(parsePotaActive('pending'), null);
});

test('supports the fixed catalogue column positions used by the previous fetcher', () => {
    const parks = parsePotaCsv([
        'field0,field1,field2,field3,field4,field5,field6',
        'ES-0123,Test Park,1,id,location,36.1,-5.4'
    ].join('\n'));

    assert.deepEqual(parks, [
        { reference: 'ES-0123', name: 'Test Park', latitude: 36.1, longitude: -5.4, active: true }
    ]);
});

test('collects OSM references case-insensitively and splits semicolon values', () => {
    const references = collectPotaReferences([
        { tags: { 'communication:amateur_radio:pota': ' es-0001 ;ES-0002' } },
        { tags: { 'communication:amateur_radio:pota': 'ES-0003' } },
        { tags: { name: 'no POTA reference' } }
    ]);

    assert.deepEqual([...references], ['ES-0001', 'ES-0002', 'ES-0003']);
});

test('supports catalogue bounding boxes that cross the antimeridian', () => {
    const bounds = { south: -5, west: 170, north: 5, east: -170 };
    assert.equal(isInsideBounds({ latitude: 1, longitude: 179 }, bounds), true);
    assert.equal(isInsideBounds({ latitude: 1, longitude: -179 }, bounds), true);
    assert.equal(isInsideBounds({ latitude: 1, longitude: 0 }, bounds), false);
});

test('schedules a recurring CSV refresh for 02:00 UTC', async () => {
    let now = Date.UTC(2026, 0, 1, 1, 0, 0);
    const timers = [];
    let csvFetches = 0;
    const service = new PotaCatalogueService({
        now: () => now,
        csvRefreshMs: 24 * 60 * 60 * 1000,
        setTimeoutImpl: (callback, delay) => {
            const timer = { callback, delay, unref() {} };
            timers.push(timer);
            return timer;
        },
        logger: { info() {}, warn() {} },
        fetchImpl: async url => {
            if (url === 'https://csv.test/parks.csv') {
                csvFetches += 1;
                return { ok: true, text: async () => csv };
            }
            return { ok: true, json: async () => ({ elements: [] }) };
        },
        csvUrl: 'https://csv.test/parks.csv'
    });

    await service.startNightlyCsvRefresh();
    assert.equal(csvFetches, 1);
    assert.equal(timers[0].delay, 60 * 60 * 1000);

    now += timers[0].delay;
    await timers[0].callback();
    assert.equal(csvFetches, 2);
    assert.equal(timers.length, 2);
    assert.equal(timers[1].delay, 24 * 60 * 60 * 1000);
});

test('computes the next configured UTC refresh hour', () => {
    assert.equal(
        millisecondsUntilNextUtcHour(Date.UTC(2026, 0, 1, 1, 30), 2),
        30 * 60 * 1000
    );
    assert.equal(
        millisecondsUntilNextUtcHour(Date.UTC(2026, 0, 1, 2, 0), 2),
        24 * 60 * 60 * 1000
    );
});

test('returns only CSV parks without a globally matching OSM reference', async () => {
    const overpassData = {
        elements: [{
            type: 'relation',
            id: 10,
            tags: { 'communication:amateur_radio:pota': 'ES-0001' }
        }]
    };
    const service = new PotaCatalogueService({
        csvRefreshMs: 60_000,
        referenceRefreshMs: 60_000,
        logger: { warn() {} },
        fetchImpl: async url => {
            if (url === 'https://csv.test/parks.csv') {
                return { ok: true, text: async () => csv };
            }
            return { ok: true, json: async () => overpassData };
        },
        csvUrl: 'https://csv.test/parks.csv',
        overpassUrl: 'https://overpass.test/api/interpreter'
    });

    const response = await service.getUnmappedParks({
        south: 41,
        west: -5,
        north: 42,
        east: -3
    });

    assert.equal(response.type, 'FeatureCollection');
    assert.deepEqual(response.features.map(feature => feature.properties.pota_ref), ['ES-0002']);
    assert.deepEqual(response.features[0].geometry.coordinates, [-4.25, 41.75]);
    assert.equal(response.features[0].properties.source, 'pota_csv');
    assert.ok(response.metadata.csvUpdatedAt);
    assert.ok(response.metadata.osmReferencesUpdatedAt);
});

test('returns inactive parks in the status catalogue while excluding them from unmapped parks', async () => {
    const service = new PotaCatalogueService({
        logger: { warn() {} },
        fetchImpl: async url => {
            if (url === 'https://csv.test/parks.csv') return { ok: true, text: async () => csv };
            return { ok: true, json: async () => ({ elements: [] }) };
        },
        csvUrl: 'https://csv.test/parks.csv',
        overpassUrl: 'https://overpass.test/api/interpreter'
    });

    const status = await service.getPotaStatus();
    assert.equal(status.parks['ES-0003'].active, false);
    assert.equal(status.parks['ES-0003'].name, 'Inactive Park');

    const unmapped = await service.getUnmappedParks({
        south: 40,
        west: -5,
        north: 42,
        east: -3
    });
    assert.deepEqual(unmapped.features.map(feature => feature.properties.pota_ref), ['ES-0001', 'ES-0002']);
});

test('fails closed when an expired OSM reference index cannot be refreshed', async () => {
    let now = 1_000_000;
    let overpassAvailable = true;
    const service = new PotaCatalogueService({
        now: () => now,
        csvRefreshMs: 60_000,
        referenceRefreshMs: 60_000,
        logger: { warn() {} },
        fetchImpl: async url => {
            if (url === 'https://csv.test/parks.csv') return { ok: true, text: async () => csv };
            if (!overpassAvailable) return { ok: false, status: 503 };
            return { ok: true, json: async () => ({ elements: [] }) };
        },
        csvUrl: 'https://csv.test/parks.csv',
        overpassUrl: 'https://overpass.test/api/interpreter'
    });

    await service.getUnmappedParks({ south: 0, west: -10, north: 50, east: 10 });
    now += 60_001;
    overpassAvailable = false;

    await assert.rejects(
        service.getUnmappedParks({ south: 0, west: -10, north: 50, east: 10 }),
        /OSM reference index could not be refreshed/
    );
});
