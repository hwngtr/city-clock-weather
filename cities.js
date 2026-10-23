export const DEFAULT_CITIES = 'London:London:51.5072:-0.1276:Europe/London:1:1:1';

const FLAG_INDEX = {clock: 5, weather: 6, name: 7};
const VALID_TIME_ZONE = /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/;

export function isValidTimeZone(timeZone) {
    return typeof timeZone === 'string' && VALID_TIME_ZONE.test(timeZone);
}

function normalizeFields(raw) {
    const fields = raw.trim().split(':');

    if (fields.length === 4)
        return [fields[0], fields[0], fields[1], fields[2], fields[3], '1', '1', '1'];
    if (fields.length === 5)
        return [...fields, '1', '1', '1'];
    if (fields.length === 8)
        return fields;
    return null;
}

export function parseCityEntry(raw, index = 0) {
    if (typeof raw !== 'string')
        return null;
    const fields = normalizeFields(raw);
    if (!fields)
        return null;

    const [displayName, weatherName, rawLatitude, rawLongitude, timeZone, clock, weather, name] = fields;
    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);
    if (!displayName.trim() || !weatherName.trim() || !rawLatitude.trim() || !rawLongitude.trim() ||
        !isValidTimeZone(timeZone) ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !['0', '1'].includes(clock) || !['0', '1'].includes(weather) || !['0', '1'].includes(name))
        return null;

    return {
        index,
        displayName: displayName.trim(),
        weatherName: weatherName.trim(),
        latitude,
        longitude,
        key: `${latitude},${longitude}`,
        timeZone,
        showClock: clock === '1',
        showWeather: weather === '1',
        showName: name === '1',
    };
}

export function formatCityEntry(city) {
    if (typeof city.displayName !== 'string' || typeof city.weatherName !== 'string' ||
        !city.displayName.trim() || !city.weatherName.trim() ||
        /[:;]/.test(city.displayName) || /[:;]/.test(city.weatherName) ||
        !Number.isFinite(city.latitude) || city.latitude < -90 || city.latitude > 90 ||
        !Number.isFinite(city.longitude) || city.longitude < -180 || city.longitude > 180 ||
        !isValidTimeZone(city.timeZone) ||
        typeof city.showClock !== 'boolean' || typeof city.showWeather !== 'boolean' || typeof city.showName !== 'boolean')
        throw new Error('City needs a display name, location, valid coordinates, and time zone.');

    return [
        city.displayName.trim(), city.weatherName.trim(), city.latitude, city.longitude,
        city.timeZone, city.showClock ? '1' : '0', city.showWeather ? '1' : '0', city.showName ? '1' : '0',
    ].join(':');
}

export function parseCityList(raw) {
    if (typeof raw !== 'string')
        return [];
    return raw.split(';').map(parseCityEntry).filter(city => city !== null);
}

export function isValidCityList(raw) {
    if (typeof raw !== 'string')
        return false;
    if (raw.trim() === '')
        return true;
    const entries = raw.split(';');
    return entries.every((entry, index) => entry.trim() && parseCityEntry(entry, index) !== null);
}

export function migrateCityList(raw) {
    if (typeof raw !== 'string')
        return '';
    return raw.split(';').map(entry => {
        const fields = normalizeFields(entry);
        return fields ? fields.join(':') : entry;
    }).join(';');
}

export function cityDefinitionKey(raw) {
    return parseCityList(migrateCityList(raw))
        .map(({displayName, weatherName, latitude, longitude, timeZone}) =>
            [displayName, weatherName, latitude, longitude, timeZone].join(':'))
        .join(';');
}

export function updateCityOption(raw, index, option, enabled) {
    const flagIndex = FLAG_INDEX[option];
    if (flagIndex === undefined || typeof enabled !== 'boolean')
        return raw;

    const entries = migrateCityList(raw).split(';');
    const fields = entries[index]?.split(':');
    if (!fields || fields.length !== 8 || !parseCityEntry(entries[index], index))
        return raw;

    fields[flagIndex] = enabled ? '1' : '0';
    entries[index] = fields.join(':');
    return entries.join(';');
}
