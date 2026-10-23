import test from 'node:test';
import assert from 'node:assert/strict';

import {parseGeocodingResults} from '../geocoding.js';

test('converts geocoding matches into selectable city choices', () => {
    const choices = parseGeocodingResults({
        results: [{
            name: 'Paris',
            admin1: 'Ile-de-France',
            country: 'France',
            latitude: 48.8566,
            longitude: 2.3522,
            timezone: 'Europe/Paris',
        }],
    });

    assert.deepEqual(choices, [{
        name: 'Paris',
        weatherName: 'Paris, Ile-de-France, France',
        latitude: 48.8566,
        longitude: 2.3522,
        timeZone: 'Europe/Paris',
        label: 'Paris, Ile-de-France, France · Europe/Paris',
    }]);
});

test('ignores malformed geocoding results', () => {
    const choices = parseGeocodingResults({results: [
        {name: 'Invalid', latitude: 91, longitude: 0, timezone: 'Europe/Paris'},
        {name: 'Bad;Name', latitude: 48, longitude: 2, timezone: 'Europe/Paris'},
        {name: 'Colon', admin1: 'Ile:de-France', latitude: 48, longitude: 2, timezone: 'Europe/Paris'},
        {name: 'Paris', latitude: 48, longitude: 2, timezone: 'Invalid Zone'},
    ]});

    assert.deepEqual(choices, []);
});

test('returns no choices for an API error or empty result', () => {
    assert.deepEqual(parseGeocodingResults({error: true}), []);
    assert.deepEqual(parseGeocodingResults({results: []}), []);
});
