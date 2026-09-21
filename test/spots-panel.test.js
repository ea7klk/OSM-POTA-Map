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
