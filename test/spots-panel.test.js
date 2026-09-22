const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const appSource = fs.readFileSync(require.resolve('../app'), 'utf8');
const stylesSource = fs.readFileSync(require.resolve('../styles.css'), 'utf8');

test('renders spot rows with Last Seen first and all detail fields available', () => {
    assert.match(appSource, /pota-spots-row-seen/);
    assert.match(appSource, /<b>Last seen<\/b>/);
    assert.match(appSource, /<b>Reference<\/b>/);
    assert.match(appSource, /<b>Name<\/b>/);
    assert.match(appSource, /<b>Mode<\/b>/);
    assert.match(appSource, /<b>Frequency<\/b>/);
    assert.match(appSource, /<b>Activator<\/b>/);
    assert.doesNotMatch(stylesSource, /\.pota-spots-(?:name|reference-cell|field)[^{]*\{[^}]*text-overflow:\s*ellipsis/s);
});

test('provides mode and band filters in the POTA Spots panel', () => {
    assert.match(appSource, /data-spot-filter="mode"/);
    assert.match(appSource, /data-spot-filter="band"/);
    assert.match(appSource, /getIaruBandOptions\(\)/);
    assert.match(appSource, /filterSpotFeatures\(this\.features, this\.filters\)/);
});

test('refreshing the spot list updates the map layer with the same response', () => {
    assert.match(appSource, /this\.map\.potaSpotsLayer\.addData\(data\)/);
    assert.match(appSource, /map\.potaSpotsLayer = potaSpotsLayer/);
});

test('provides compact all/none visibility controls for every API-backed layer', () => {
    assert.match(appSource, /data-visibility-action="all"/);
    assert.match(appSource, /data-visibility-action="none"/);
    assert.match(appSource, /data-visibility-layer="mapped"/);
    assert.match(appSource, /data-visibility-layer="unmapped"/);
    assert.match(appSource, /data-visibility-layer="spots"/);
    assert.match(appSource, /const shouldLoadMapped = potaLayerSelection\.mapped/);
    assert.match(appSource, /const shouldLoadUnmapped = potaLayerSelection\.unmapped/);
    assert.match(appSource, /if \(!this\.isVisible\) return;/);
});

test('persists the Show-window selection and restores it on reload', () => {
    assert.match(appSource, /const POTA_LAYER_SELECTION_COOKIE = 'potaLayerSelection'/);
    assert.match(appSource, /loadPotaLayerSelection\(\);/);
    assert.match(appSource, /JSON\.parse\(decodeURIComponent\(savedSelection\)\)/);
    assert.match(appSource, /encodeURIComponent\(JSON\.stringify\(potaLayerSelection\)\)/);
    assert.match(appSource, /savePotaLayerSelection\(\);/);
    assert.match(appSource, /this\.isVisible = potaLayerSelection\.spots/);
});

test('refreshes both POTA Spots views every 30 seconds', () => {
    assert.equal((appSource.match(/this\.refreshMs = 30 \* 1000/g) || []).length, 2);
    assert.doesNotMatch(appSource, /this\.refreshMs = 60 \* 1000/);
});

test('places the status legend below the Show control', () => {
    assert.match(appSource, /L\.control\(\{ position: 'topleft' \}\)/);
    assert.match(appSource, /visibilityControl\.addTo\(map\);[\s\S]*statusLegend\.addTo\(map\);/);
});

test('normalizes Leaflet map bounds for Overpass, catalogue, and spots requests', () => {
    assert.match(appSource, /normalizeBounds\(\{[\s\S]*south: bounds\.getSouth\(\)/);
    assert.match(appSource, /const bounds = getMapRequestBounds\(this\.map\);/);
    assert.match(appSource, /nwr\["communication:amateur_radio:pota"\]\(\$\{bounds\.south\},\$\{bounds\.west\},\$\{bounds\.north\},\$\{bounds\.east\}\)/);
    assert.doesNotMatch(appSource, /_southWest\.lng|_northEast\.lng|_southWest\.lat|_northEast\.lat/);
});

test('normalizes saved and moved map centers so returned features stay visible', () => {
    assert.match(appSource, /const normalizedLng = normalizeLongitude\(lng\)/);
    assert.match(appSource, /initialView = \[Math\.max\(-90, Math\.min\(90, lat\)\), normalizedLng\]/);
    assert.match(appSource, /map\.setView\(\[center\.lat, normalizedLng\], zoom, \{ animate: false \}\)/);
});

test('trusts the external unmapped endpoint without client-side deduplication', () => {
    assert.match(appSource, /this\.addCatalogueData\(catalogueResult\.value\)/);
    assert.doesNotMatch(appSource, /this\.addCatalogueData\(catalogueResult\.value, osmReferences\)/);
    assert.doesNotMatch(appSource, /osmReferences\.has\(normalizedReference\)/);
});
