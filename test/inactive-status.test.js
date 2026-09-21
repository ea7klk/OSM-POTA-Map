const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const root = require('node:path').resolve(__dirname, '..');
const appSource = fs.readFileSync(require.resolve('../app'), 'utf8');
const stylesSource = fs.readFileSync(require.resolve('../styles.css'), 'utf8');
const dockerfile = fs.readFileSync(`${root}/Dockerfile`, 'utf8');
const configTemplate = fs.readFileSync(`${root}/config.js.template`, 'utf8');
const entrypoint = fs.readFileSync(`${root}/docker-entrypoint.d/40-generate-config.sh`, 'utf8');

test('queries status only for mapped references returned by the current Overpass view', () => {
    assert.match(appSource, /osmReferences = collectPotaRefsFromResponse\(osmResult\.value\)/);
    assert.match(appSource, /if \(osmReferences\.size > 0\)/);
    assert.match(appSource, /this\.fetchStatusData\(osmReferences\)/);
    assert.match(appSource, /statusUrl\.searchParams\.set\('references', \[\.\.\.references\]\.join\(','\)\)/);
    assert.doesNotMatch(appSource, /fetchStatusData\(\)/);
});

test('normalizes numeric and boolean active values and applies inactive styling', () => {
    assert.match(appSource, /value === false \|\| value === 0 \|\| value === '0'/);
    assert.match(appSource, /normalizePotaActive\(status && typeof status === 'object' \? status\.active : status\)/);
    assert.match(appSource, /if \(summary === 'inactive'\) return '#757575'/);
    assert.match(appSource, /fillOpacity: summary === 'inactive' \? 0\.22 : 0\.3/);
    assert.match(appSource, /Currently inactive in the POTA catalogue/);
    assert.match(stylesSource, /\.pota-legend-inactive/);
    assert.match(stylesSource, /\.pota-inactive-icon/);
});

test('exposes the status endpoint through the static image configuration', () => {
    assert.match(dockerfile, /ENV POTA_STATUS_URL=https:\/\/api\.spainip\.es\/v1\/pota\/status/);
    assert.match(configTemplate, /window\.POTA_STATUS_URL = '\$\{POTA_STATUS_URL\}'/);
    assert.match(entrypoint, /POTA_STATUS_URL/);
});
