import {isValidTimeZone} from './cities.js';

const SEPARATOR = /[:;]/;

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parse city search results from the Open-Meteo Geocoding API.
 * @param {unknown} payload The decoded JSON response.
 * @returns {Array<{name: string, weatherName: string, latitude: number, longitude: number, timeZone: string, label: string}>}
 */
export function parseGeocodingResults(payload) {
    if (typeof payload !== 'object' || payload === null || !('results' in payload) || !Array.isArray(payload.results))
        return [];

    return payload.results.flatMap(result => {
        if (typeof result !== 'object' || result === null)
            return [];

        const {name, admin1, country, latitude, longitude, timezone: timeZone} = result;
        if (!nonEmptyString(name) || SEPARATOR.test(name) ||
            (typeof admin1 === 'string' && SEPARATOR.test(admin1)) ||
            (typeof country === 'string' && SEPARATOR.test(country)) ||
            !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
            !isValidTimeZone(timeZone))
            return [];

        const region = [admin1, country].filter(nonEmptyString);
        const weatherName = [name.trim(), ...region.map(value => value.trim())].join(', ');
        return [{
            name: name.trim(),
            weatherName,
            latitude,
            longitude,
            timeZone,
            label: `${weatherName} · ${timeZone}`,
        }];
    });
}
