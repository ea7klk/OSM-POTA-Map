const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serverSource = fs.readFileSync(require.resolve('../server'), 'utf8');

test('serves only the static app and external API configuration', () => {
    assert.doesNotMatch(serverSource, /app\.get\(['"]\/api\/pota\//);
    assert.doesNotMatch(serverSource, /PotaCatalogueService|startNightlyCsvRefresh|normalizePotaReference/);
    assert.match(serverSource, /POTA_CATALOGUE_URL = process\.env\.POTA_CATALOGUE_URL/);
    assert.match(serverSource, /POTA_NAMES_URL = process\.env\.POTA_NAMES_URL/);
    assert.match(serverSource, /POTA_STATUS_URL = process\.env\.POTA_STATUS_URL/);
    assert.match(serverSource, /POTA_SPOTS_URL = process\.env\.POTA_SPOTS_URL/);
});

test('uses the external POTA names endpoint without a double slash', () => {
    assert.match(serverSource, /https:\/\/api\.spainip\.es\/v1\/pota\/names/);
    assert.doesNotMatch(serverSource, /api\.spainip\.es\/\/v1\/pota\/names/);
});

test('configures the external POTA status endpoint', () => {
    assert.match(serverSource, /https:\/\/api\.spainip\.es\/v1\/pota\/status/);
    assert.match(serverSource, /window\.POTA_STATUS_URL = '\$\{POTA_STATUS_URL\}'/);
});
