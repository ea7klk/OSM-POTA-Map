const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
    MAX_BBOX_AREA_KM2,
    MAX_ELEMENTS,
    bboxAreaKm2,
    parseBounds
} = require('../bbox-limits');

test('uses the same bbox area and feature limits as Ham Radio Map', () => {
    assert.equal(MAX_BBOX_AREA_KM2, 50_000_000);
    assert.equal(MAX_ELEMENTS, 4_000);
    assert.ok(bboxAreaKm2({ south: -90, west: -180, north: 90, east: 180 }) > MAX_BBOX_AREA_KM2);
    assert.ok(bboxAreaKm2({ south: 35, west: -10, north: 45, east: 5 }) < MAX_BBOX_AREA_KM2);
});

test('keeps browser globals isolated so app.js can import the shared limits', () => {
    const source = fs.readFileSync(require.resolve('../bbox-limits'), 'utf8');
    const context = vm.createContext({ window: {} });

    vm.runInContext(source, context);
    assert.doesNotThrow(() => vm.runInContext(
        'const { MAX_BBOX_AREA_KM2, MAX_ELEMENTS, bboxAreaKm2 } = window.POTAMAP_BBOX_LIMITS;',
        context
    ));
});

test('calculates bbox area using latitude-adjusted longitude width', () => {
    const actual = bboxAreaKm2({ south: 0, west: 0, north: 10, east: 10 });
    const expected = 111.32 * 10 * 111.32 * Math.cos(5 * Math.PI / 180) * 10;
    assert.ok(Math.abs(actual - expected) < 1e-6);
});

test('measures antimeridian bboxes by their wrapped longitude span', () => {
    const bounds = { south: 0, west: 170, north: 10, east: -170 };
    const wrappedArea = bboxAreaKm2(bounds);
    const unwrappedArea = 111.32 * 10 * 111.32 * Math.cos(5 * Math.PI / 180) * 340;

    assert.ok(wrappedArea < unwrappedArea);
    const expectedWrappedArea = 111.32 * 10 * 111.32 * Math.cos(5 * Math.PI / 180) * 20;
    assert.ok(Math.abs(wrappedArea - expectedWrappedArea) < 1e-6);
});

test('parses bounded coordinates and preserves antimeridian boxes', () => {
    assert.deepEqual(parseBounds({ south: '0', west: '170', north: '10', east: '-170' }), {
        south: 0,
        west: 170,
        north: 10,
        east: -170
    });
    assert.equal(parseBounds({ south: '-91', west: 0, north: 10, east: 10 }), null);
});
