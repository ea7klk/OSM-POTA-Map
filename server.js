const express = require('express');
const path = require('path');
const axios = require('axios');
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

app.get('/api/overpass', async (req, res) => {
    const query = req.query.query;
    console.log("Query received:", query);
    const fullQuery = `[out:json];(${query});out geom;`;
    const encoded = encodeURIComponent(fullQuery);
    const url = `${OVERPASS_URL}?data=${encoded}`;

    try {
        const response = await axios.get(url);
        const data = response.data;
        res.json(data);
    } catch (error) {
        console.error('Error fetching POTA data:', error);
        res.status(500).json({ error: 'Failed to fetch data from Overpass API' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});