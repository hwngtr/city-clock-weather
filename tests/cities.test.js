import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_CITIES,
    cityDefinitionKey,
    formatCityEntry,
    isValidCityList,
    migrateCityList,
    parseCityList,
    updateCityOption,
} from '../cities.js';

test('parses the default city into typed fields', () => {
    assert.deepEqual(parseCityList(DEFAULT_CITIES), [{
        index: 0,
        displayName: 'London',
        weatherName: 'London',
        latitude: 51.5072,
        longitude: -0.1276,
        key: '51.5072,-0.1276',
        timeZone: 'Europe/London',
        showClock: true,
        showWeather: true,
        showName: true,
    }]);
});

test('accepts an empty list as the zero-city state', () => {
    assert.equal(isValidCityList(''), true);
    assert.deepEqual(parseCityList(''), []);
    assert.equal(isValidCityList(';'), false);
});

test('migrates the four-field and five-field formats', () => {
    assert.equal(
        migrateCityList('Paris:48.8566:2.3522:Europe/Paris;Tokyo:Tokyo:35.6762:139.6503:Asia/Tokyo'),
        'Paris:Paris:48.8566:2.3522:Europe/Paris:1:1:1;Tokyo:Tokyo:35.6762:139.6503:Asia/Tokyo:1:1:1',
    );
});

test('rejects malformed fields, flags, coordinates, and time zones', () => {
    for (const raw of [
        'Paris:Paris:91:2:Europe/Paris:1:1:1',
        'Paris:Paris:48:181:Europe/Paris:1:1:1',
        'Rome:Rome:41:12:Invalid Zone:1:1:1',
        'Paris:Paris:48:2:Europe/Paris:true:1:1',
        'Paris:Paris:48:2:Europe/Paris:1:1',
        'Paris:Paris::2:Europe/Paris:1:1:1',
    ])
        assert.equal(isValidCityList(raw), false, raw);
});

test('updates a city display flag without adding another city', () => {
    const twoCities = `${DEFAULT_CITIES};Tokyo:Tokyo:35.6762:139.6503:Asia/Tokyo:0:1:0`;
    const updated = updateCityOption(twoCities, 1, 'clock', true);
    const cities = parseCityList(updated);

    assert.equal(cities.length, 2);
    assert.equal(cities[1].showClock, true);
    assert.equal(cities[1].showWeather, true);
    assert.equal(cities[1].showName, false);
});

test('serializes a selected location with safe display flags', () => {
    assert.equal(formatCityEntry({
        displayName: 'Paris home',
        weatherName: 'Paris, France',
        latitude: 48.8566,
        longitude: 2.3522,
        timeZone: 'Europe/Paris',
        showClock: true,
        showWeather: false,
        showName: true,
    }), 'Paris home:Paris, France:48.8566:2.3522:Europe/Paris:1:0:1');
});

test('city definition key ignores display switches but tracks city removal', () => {
    const cities = `${DEFAULT_CITIES};Tokyo:Tokyo:35.6762:139.6503:Asia/Tokyo:0:1:0`;
    const toggled = updateCityOption(cities, 1, 'weather', false);

    assert.equal(cityDefinitionKey(cities), cityDefinitionKey(toggled));
    assert.notEqual(cityDefinitionKey(cities), cityDefinitionKey(DEFAULT_CITIES));
});
