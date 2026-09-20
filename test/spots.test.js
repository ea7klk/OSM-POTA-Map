const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
    buildActivatorProfileUrl,
    buildParkUrl,
    buildSpotsRequestUrl,
    formatSpotLastSeen,
    parseSpotTime,
    sortSpotFeaturesByNewest
} = require('../spots');

test('builds a spots API request with the current map bounds', () => {
    const url = new URL(buildSpotsRequestUrl('https://api.spainip.es/v1/pota/spots', {
        south: 40.1,
        west: -5.2,
        north: 41.3,
        east: -3.4
    }));

    assert.equal(url.origin, 'https://api.spainip.es');
    assert.equal(url.pathname, '/v1/pota/spots');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
        south: '40.1',
        west: '-5.2',
        north: '41.3',
        east: '-3.4'
    });
});

test('interprets timestamps without an offset as UTC', () => {
    assert.equal(
        parseSpotTime('2026-09-20T21:18:20'),
        Date.parse('2026-09-20T21:18:20Z')
    );
});

test('formats the elapsed time since a spot was seen', () => {
    const now = new Date('2026-09-20T21:20:25Z');

    assert.equal(formatSpotLastSeen('2026-09-20T21:20:00', now), '25 seconds ago');
    assert.equal(formatSpotLastSeen('2026-09-20T21:18:20', now), '2 minutes ago');
    assert.equal(formatSpotLastSeen('2026-09-20T19:20:25', now), '2 hours ago');
    assert.equal(formatSpotLastSeen('2026-09-18T21:20:25', now), '2 days ago');
    assert.equal(formatSpotLastSeen('not a timestamp', now), 'Unknown');
});

test('sorts all spot features newest first and puts invalid times last', () => {
    const features = [
        { properties: { spotTime: '2026-09-20T21:18:20' } },
        { properties: { spotTime: 'not a timestamp' } },
        { properties: { spotTime: '2026-09-20T21:20:25' } },
        { properties: { spotTime: '2026-09-20T21:20:25' } }
    ];

    assert.deepEqual(sortSpotFeaturesByNewest(features), [features[2], features[3], features[0], features[1]]);
    assert.deepEqual(features.map(feature => feature.properties.spotTime), [
        '2026-09-20T21:18:20',
        'not a timestamp',
        '2026-09-20T21:20:25',
        '2026-09-20T21:20:25'
    ]);
});

test('builds links for activator profiles and POTA references', () => {
    assert.equal(buildActivatorProfileUrl('EA7/KL?'), 'https://pota.app/#/profile/EA7%2FKL%3F');
    assert.equal(buildParkUrl('ES-0016'), 'https://pota.app/#/park/ES-0016');
});

test('keeps helper names scoped so app.js can import the browser API safely', () => {
    const source = fs.readFileSync(require.resolve('../spots'), 'utf8');
    const context = vm.createContext({ window: {} });

    vm.runInContext(source, context);
    assert.ok(context.window.POTAMAP_SPOTS);
    assert.equal(context.buildActivatorProfileUrl, undefined);
    assert.equal(context.buildParkUrl, undefined);
});
