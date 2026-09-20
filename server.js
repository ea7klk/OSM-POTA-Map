const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const { PotaCatalogueService, normalizePotaReference } = require('./pota-catalogue');
const { MAX_BBOX_AREA_KM2, bboxAreaKm2, parseBounds } = require('./bbox-limits');

// Matomo configuration
const MATOMO_ENABLED = process.env.MATOMO_ENABLED || 'false';
const MATOMO_URL = process.env.MATOMO_URL || '';
const MATOMO_SITE_ID = process.env.MATOMO_SITE_ID || '';

// Overpass URL configuration
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://api.spainip.es/v1/overpass/interpreter';
const potaCatalogue = new PotaCatalogueService({
    overpassUrl: OVERPASS_URL,
    csvUrl: process.env.POTA_CSV_URL,
    csvRefreshMs: process.env.POTA_CSV_REFRESH_MS,
    csvRefreshHourUtc: process.env.POTA_CSV_REFRESH_HOUR_UTC,
    referenceRefreshMs: process.env.POTA_OSM_REFERENCE_REFRESH_MS
});

app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/pota/unmapped', async (req, res) => {
    const bounds = parseBounds(req.query);
    if (!bounds) {
        return res.status(400).json({
            error: 'Provide a valid bounding box using south, west, north, and east coordinates.'
        });
    }
    const area = bboxAreaKm2(bounds);
    if (area > MAX_BBOX_AREA_KM2) {
        return res.status(413).json({
            error: `This bounding box covers about ${Math.round(area).toLocaleString()} km². Zoom in to ${MAX_BBOX_AREA_KM2.toLocaleString()} km² or less.`
        });
    }

    try {
        const catalogue = await potaCatalogue.getUnmappedParks(bounds);
        res.set('Cache-Control', 'private, max-age=300');
        return res.json(catalogue);
    } catch (error) {
        console.error(`Unable to load the POTA catalogue: ${error.message}`);
        return res.status(503).json({ error: 'The POTA catalogue is temporarily unavailable.' });
    }
});

app.get('/api/pota/status', async (req, res) => {
    try {
        const status = await potaCatalogue.getPotaStatus();
        res.set('Cache-Control', 'private, max-age=60');
        return res.json(status);
    } catch (error) {
        console.error(`Unable to load POTA status data: ${error.message}`);
        return res.status(503).json({ error: 'The POTA status data is temporarily unavailable.' });
    }
});

app.get('/api/pota/names', async (req, res) => {
    const references = String(req.query.references || '')
        .split(',')
        .map(normalizePotaReference)
        .filter(Boolean);
    if (references.length > 1000) {
        return res.status(400).json({ error: 'Request at most 1,000 POTA references at a time.' });
    }

    try {
        const names = await potaCatalogue.getPotaNames(references);
        res.set('Cache-Control', 'private, max-age=300');
        return res.json(names);
    } catch (error) {
        console.error(`Unable to load POTA name data: ${error.message}`);
        return res.status(503).json({ error: 'The POTA name data is temporarily unavailable.' });
    }
});

app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        window.MATOMO_ENABLED = '${MATOMO_ENABLED}';
        window.MATOMO_URL = '${MATOMO_URL}';
        window.MATOMO_SITE_ID = '${MATOMO_SITE_ID}';
        window.OVERPASS_URL = '${OVERPASS_URL}';
        window.POTA_CATALOGUE_URL = 'https://api.spainip.es/v1/pota/unmapped';
        window.POTA_STATUS_URL = '/api/pota/status';
        window.POTA_NAMES_URL = 'https://api.spainip.es//v1/pota/names';
        window.POTA_SPOTS_URL = 'https://api.spainip.es/v1/pota/spots';
    `);
});

potaCatalogue.startNightlyCsvRefresh();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
