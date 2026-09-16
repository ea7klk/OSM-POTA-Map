const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const { PotaCatalogueService } = require('./pota-catalogue');

// Matomo configuration
const MATOMO_ENABLED = process.env.MATOMO_ENABLED || 'false';
const MATOMO_URL = process.env.MATOMO_URL || '';
const MATOMO_SITE_ID = process.env.MATOMO_SITE_ID || '';

// Overpass URL configuration
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass.ea7klk.es/api/interpreter';
const potaCatalogue = new PotaCatalogueService({
    overpassUrl: OVERPASS_URL,
    csvUrl: process.env.POTA_CSV_URL,
    csvRefreshMs: process.env.POTA_CSV_REFRESH_MS,
    csvRefreshHourUtc: process.env.POTA_CSV_REFRESH_HOUR_UTC,
    referenceRefreshMs: process.env.POTA_OSM_REFERENCE_REFRESH_MS
});

function parseBounds(query) {
    const values = ['south', 'west', 'north', 'east'].map(key => query[key]);
    if (values.some(value => value === undefined || value === '')) return null;

    const [south, west, north, east] = values.map(Number);
    if (![south, west, north, east].every(Number.isFinite)) return null;
    if (south < -90 || north > 90 || west < -180 || west > 180 || east < -180 || east > 180) return null;
    if (south > north) return null;
    return { south, west, north, east };
}

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

    try {
        const catalogue = await potaCatalogue.getUnmappedParks(bounds);
        res.set('Cache-Control', 'private, max-age=60');
        return res.json(catalogue);
    } catch (error) {
        console.error(`Unable to load the POTA catalogue: ${error.message}`);
        return res.status(503).json({ error: 'The POTA catalogue is temporarily unavailable.' });
    }
});

app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        window.MATOMO_ENABLED = '${MATOMO_ENABLED}';
        window.MATOMO_URL = '${MATOMO_URL}';
        window.MATOMO_SITE_ID = '${MATOMO_SITE_ID}';
        window.OVERPASS_URL = '${OVERPASS_URL}';
        window.POTA_CATALOGUE_URL = '/api/pota/unmapped';
    `);
});

potaCatalogue.startNightlyCsvRefresh();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
