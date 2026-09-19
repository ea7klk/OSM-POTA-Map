const POTA_REFERENCE_KEY = 'communication:amateur_radio:pota';
const DEFAULT_POTA_CSV_URL = 'https://pota.app/all_parks_ext.csv';
const OSM_REFERENCE_QUERY = `[out:json][timeout:180];nwr["${POTA_REFERENCE_KEY}"];out tags;`;

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = text.replace(/^\uFEFF/, '');

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
        } else if (character === '"' && field.length === 0) {
            quoted = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && source[index + 1] === '\n') index += 1;
            row.push(field);
            if (row.some(value => value.length > 0)) rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }

    row.push(field);
    if (row.some(value => value.length > 0)) rows.push(row);
    if (quoted) throw new Error('POTA CSV has an unterminated quoted field');
    return rows;
}

function headerIndex(headers, names, fallback) {
    const normalized = headers.map(value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const index = normalized.findIndex(value => names.includes(value));
    return index === -1 ? fallback : index;
}

function parsePotaActive(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'active'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'inactive'].includes(normalized)) return false;
    return null;
}

function parsePotaCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('POTA CSV has no park rows');

    // all_parks_ext.csv has historically used these columns. Prefer named
    // columns when present so harmless upstream column reordering is safe.
    const headers = rows[0];
    const columns = {
        reference: headerIndex(headers, ['reference', 'parkreference', 'parkref', 'ref'], 0),
        name: headerIndex(headers, ['name', 'parkname'], 1),
        active: headerIndex(headers, ['active', 'isactive'], 2),
        latitude: headerIndex(headers, ['latitude', 'lat'], 5),
        longitude: headerIndex(headers, ['longitude', 'lon', 'lng'], 6)
    };

    const parks = new Map();
    for (const values of rows.slice(1)) {
        const reference = (values[columns.reference] || '').trim();
        const name = (values[columns.name] || '').trim();
        const active = parsePotaActive(values[columns.active]);
        const latitudeText = (values[columns.latitude] || '').trim();
        const longitudeText = (values[columns.longitude] || '').trim();
        if (!reference) continue;
        if (!latitudeText || !longitudeText) continue;

        const latitude = Number(latitudeText);
        const longitude = Number(longitudeText);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) continue;
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue;

        parks.set(normalizePotaReference(reference), {
            reference,
            name: name || reference,
            latitude,
            longitude,
            active
        });
    }

    if (parks.size === 0) throw new Error('POTA CSV did not contain any parks with valid coordinates');
    return Array.from(parks.values());
}

function normalizePotaReference(value) {
    return String(value || '').trim().toUpperCase();
}

function splitPotaReferences(value) {
    return String(value || '')
        .split(';')
        .map(normalizePotaReference)
        .filter(Boolean);
}

function collectPotaReferences(elements) {
    const references = new Set();
    for (const element of elements || []) {
        const tags = element && element.tags;
        if (!tags) continue;
        for (const reference of splitPotaReferences(tags[POTA_REFERENCE_KEY])) {
            references.add(reference);
        }
    }
    return references;
}

function isInsideBounds(park, bounds) {
    const insideLatitude = park.latitude >= bounds.south && park.latitude <= bounds.north;
    const insideLongitude = bounds.west <= bounds.east
        ? park.longitude >= bounds.west && park.longitude <= bounds.east
        : park.longitude >= bounds.west || park.longitude <= bounds.east;
    return insideLatitude && insideLongitude;
}

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validUtcHour(value, fallback = 2) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
}

function millisecondsUntilNextUtcHour(now, hour) {
    const current = new Date(now);
    const next = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
        validUtcHour(hour),
        0,
        0,
        0
    ));
    if (next.getTime() <= current.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - current.getTime();
}

class PotaCatalogueService {
    constructor(options = {}) {
        this.csvUrl = options.csvUrl || DEFAULT_POTA_CSV_URL;
        this.overpassUrl = options.overpassUrl || 'https://api.spainip.es/v1/overpass/interpreter';
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
        this.now = options.now || Date.now;
        this.setTimeoutImpl = options.setTimeoutImpl || setTimeout;
        this.logger = options.logger || console;
        this.csvRefreshMs = positiveInteger(options.csvRefreshMs, 24 * 60 * 60 * 1000);
        this.csvRefreshHourUtc = validUtcHour(options.csvRefreshHourUtc, 2);
        this.referenceRefreshMs = positiveInteger(options.referenceRefreshMs, 60 * 1000);
        this.requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 180 * 1000);
        this.cache = { parks: null, references: null };
        this.refreshing = { parks: null, references: null };
        this.nightlyRefreshStarted = false;
    }

    startNightlyCsvRefresh() {
        if (this.nightlyRefreshStarted) return;
        this.nightlyRefreshStarted = true;
        const initialRefresh = this.refreshCsvNow();
        this.scheduleNightlyCsvRefresh();
        return initialRefresh;
    }

    async refreshCsvNow() {
        const previous = this.cache.parks;
        try {
            await this.getCache('parks', true);
            if (this.cache.parks !== previous) {
                this.logger.info('POTA CSV catalogue refreshed');
            }
        } catch (error) {
            this.logger.warn(`POTA CSV catalogue refresh failed: ${error.message}`);
        }
    }

    scheduleNightlyCsvRefresh() {
        const delay = millisecondsUntilNextUtcHour(this.now(), this.csvRefreshHourUtc);
        const timer = this.setTimeoutImpl(async () => {
            try {
                await this.refreshCsvNow();
            } finally {
                this.scheduleNightlyCsvRefresh();
            }
        }, delay);
        if (timer && typeof timer.unref === 'function') timer.unref();
    }

    async getUnmappedParks(bounds) {
        const [parkCache, referenceCache] = await Promise.all([
            this.getCache('parks'),
            this.getCache('references')
        ]);
        const features = parkCache.value
            .filter(park => park.active === true)
            .filter(park => !referenceCache.value.has(normalizePotaReference(park.reference)))
            .filter(park => isInsideBounds(park, bounds))
            .map(park => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [park.longitude, park.latitude]
                },
                properties: {
                    pota_ref: park.reference,
                    name: park.name,
                    source: 'pota_csv'
                }
            }));

        return {
            type: 'FeatureCollection',
            features,
            metadata: {
                csvUpdatedAt: new Date(parkCache.fetchedAt).toISOString(),
                osmReferencesUpdatedAt: new Date(referenceCache.fetchedAt).toISOString()
            }
        };
    }

    async getPotaStatus() {
        const parkCache = await this.getCache('parks');
        const inactive = parkCache.value
            .filter(park => park.active === false)
            .map(park => normalizePotaReference(park.reference));

        return {
            inactive,
            metadata: {
                csvUpdatedAt: new Date(parkCache.fetchedAt).toISOString(),
                stale: Boolean(parkCache.lastError)
            }
        };
    }

    async getPotaNames(references) {
        const requested = new Set((references || [])
            .map(normalizePotaReference)
            .filter(Boolean));
        const parkCache = await this.getCache('parks');
        const names = Object.fromEntries(parkCache.value
            .filter(park => requested.has(normalizePotaReference(park.reference)))
            .map(park => [normalizePotaReference(park.reference), park.name]));

        return {
            names,
            metadata: {
                csvUpdatedAt: new Date(parkCache.fetchedAt).toISOString(),
                stale: Boolean(parkCache.lastError)
            }
        };
    }

    async getCache(kind, force = false) {
        const maxAge = kind === 'parks' ? this.csvRefreshMs : this.referenceRefreshMs;
        const current = this.cache[kind];
        if (!force && current && this.now() - current.fetchedAt < maxAge) return current;
        if (!force && current && current.retryAfter && current.retryAfter > this.now()) {
            if (kind === 'references') {
                throw new Error(`OSM reference index refresh is unavailable: ${current.lastError}`);
            }
            return current;
        }
        if (this.refreshing[kind]) return this.refreshing[kind];

        const refresh = (kind === 'parks' ? this.fetchParks() : this.fetchReferences())
            .then(value => {
                const updated = { value, fetchedAt: this.now() };
                this.cache[kind] = updated;
                return updated;
            })
            .catch(error => {
                if (current) {
                    this.logger.warn(`POTA ${kind} refresh failed: ${error.message}`);
                    current.retryAfter = this.now() + Math.min(maxAge, 5 * 60 * 1000);
                    current.lastError = error.message;
                    if (kind === 'references') {
                        throw new Error(`OSM reference index could not be refreshed: ${error.message}`);
                    }
                    this.logger.warn('Using the last good POTA CSV cache');
                    return current;
                }
                throw error;
            })
            .finally(() => {
                this.refreshing[kind] = null;
            });
        this.refreshing[kind] = refresh;
        return refresh;
    }

    async fetchParks() {
        const response = await this.fetchImpl(this.csvUrl, {
            headers: {
                'User-Agent': 'OSM-POTA-Map/1.0 (+https://github.com/ea7klk/OSM-POTA-Map)',
                Accept: 'text/csv, application/csv;q=0.9, */*;q=0.8'
            },
            signal: AbortSignal.timeout(this.requestTimeoutMs)
        });
        if (!response.ok) throw new Error(`CSV request returned HTTP ${response.status}`);
        return parsePotaCsv(await response.text());
    }

    async fetchReferences() {
        const separator = this.overpassUrl.includes('?') ? '&' : '?';
        const url = `${this.overpassUrl}${separator}data=${encodeURIComponent(OSM_REFERENCE_QUERY)}`;
        const response = await this.fetchImpl(url, {
            headers: {
                'User-Agent': 'OSM-POTA-Map/1.0 (+https://github.com/ea7klk/OSM-POTA-Map)',
                Accept: 'application/json'
            },
            signal: AbortSignal.timeout(this.requestTimeoutMs)
        });
        if (!response.ok) throw new Error(`Overpass reference query returned HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.elements) || data.remark || data.error) {
            throw new Error('Overpass reference query returned an invalid response');
        }
        return collectPotaReferences(data.elements);
    }
}

module.exports = {
    POTA_REFERENCE_KEY,
    PotaCatalogueService,
    collectPotaReferences,
    isInsideBounds,
    normalizePotaReference,
    parsePotaActive,
    parseCsv,
    parsePotaCsv,
    splitPotaReferences,
    millisecondsUntilNextUtcHour
};
