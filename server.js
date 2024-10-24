const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Matomo configuration
const MATOMO_ENABLED = process.env.MATOMO_ENABLED || 'false';
const MATOMO_URL = process.env.MATOMO_URL || '';
const MATOMO_SITE_ID = process.env.MATOMO_SITE_ID || '';

// Overpass URL configuration
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

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
    `);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});