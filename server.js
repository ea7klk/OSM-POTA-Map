const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Matomo configuration
const MATOMO_ENABLED = process.env.MATOMO_ENABLED || 'false';
const MATOMO_URL = process.env.MATOMO_URL || '';
const MATOMO_SITE_ID = process.env.MATOMO_SITE_ID || '';

// Overpass URL configuration
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://api.spainip.es/v1/overpass/interpreter';
const POTA_CATALOGUE_URL = process.env.POTA_CATALOGUE_URL || 'https://api.spainip.es/v1/pota/unmapped';
const POTA_NAMES_URL = process.env.POTA_NAMES_URL || 'https://api.spainip.es/v1/pota/names';
const POTA_STATUS_URL = process.env.POTA_STATUS_URL || 'https://api.spainip.es/v1/pota/status';
const POTA_SPOTS_URL = process.env.POTA_SPOTS_URL || 'https://api.spainip.es/v1/pota/spots';

app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        window.MATOMO_ENABLED = '${MATOMO_ENABLED}';
        window.MATOMO_URL = '${MATOMO_URL}';
        window.MATOMO_SITE_ID = '${MATOMO_SITE_ID}';
        window.OVERPASS_URL = '${OVERPASS_URL}';
        window.POTA_CATALOGUE_URL = '${POTA_CATALOGUE_URL}';
        window.POTA_NAMES_URL = '${POTA_NAMES_URL}';
        window.POTA_STATUS_URL = '${POTA_STATUS_URL}';
        window.POTA_SPOTS_URL = '${POTA_SPOTS_URL}';
    `);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
