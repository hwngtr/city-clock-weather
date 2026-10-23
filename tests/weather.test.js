import test from 'node:test';
import assert from 'node:assert/strict';

import {parseWeatherResults} from '../weather.js';

const cities = [{displayName: 'London'}, {displayName: 'Tokyo'}];

function response(time, temperature) {
    return {
        current: {
            time,
            temperature_2m: temperature,
            apparent_temperature: temperature - 1,
            relative_humidity_2m: 60,
            wind_speed_10m: 5,
            weather_code: 2,
        },
    };
}

test("parses each city's current weather in request order", () => {
    const parsed = parseWeatherResults([
        response('2026-10-23T07:00', 18),
        response('2026-10-23T15:00', 21),
    ], cities);

    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].temp, 18);
    assert.equal(parsed[1].localTime, '2026-10-23T15:00');
});

test('rejects a result count that differs from the requested city count', () => {
    assert.throws(() => parseWeatherResults(response('2026-10-23T07:00', 18), cities), /Expected 2 weather results/);
});

test('rejects malformed numeric fields from the network boundary', () => {
    const malformed = response('2026-10-23T07:00', 18);
    malformed.current.temperature_2m = '18';
    assert.throws(() => parseWeatherResults([malformed, response('2026-10-23T15:00', 21)], cities), /invalid values/);
});
