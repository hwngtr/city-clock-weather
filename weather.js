/**
 * Parse one or more Open-Meteo current-weather responses.
 * @param {unknown} payload The decoded JSON response.
 * @param {Array<{displayName: string}>} cities The requested cities in request order.
 * @returns {Array<{temp: number, feels: number, humidity: number, wind: number, code: number, localTime: string}>}
 */
export function parseWeatherResults(payload, cities) {
    const results = Array.isArray(payload) ? payload : [payload];
    if (results.length !== cities.length)
        throw new Error(`Expected ${cities.length} weather results. Received ${results.length}.`);

    return results.map((result, index) => {
        if (typeof result !== 'object' || result === null || !('current' in result))
            throw new Error(`Weather response for ${cities[index].displayName} has no current conditions.`);

        const current = result.current;
        if (typeof current !== 'object' || current === null)
            throw new Error(`Weather response for ${cities[index].displayName} has invalid current conditions.`);

        const {temperature_2m: temp, apparent_temperature: feels,
            relative_humidity_2m: humidity, wind_speed_10m: wind,
            weather_code: code, time: localTime} = current;
        if (![temp, feels, humidity, wind].every(Number.isFinite) ||
            !Number.isInteger(code) || typeof localTime !== 'string')
            throw new Error(`Weather response for ${cities[index].displayName} contains invalid values.`);

        return {temp, feels, humidity, wind, code, localTime};
    });
}
