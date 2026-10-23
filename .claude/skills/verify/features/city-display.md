# City list and per-city display

## Sub-features

- Add a city with its display name, weather location, coordinates, and IANA time zone.
- Search for a city and select a geocoding result to fill in its location fields.
- Independently show or hide that city's clock, weather, and display name.
- Remove a city and its per-city settings.
- Clear the list and add a new city through search.

## How to get to it (user POV)

Open the panel indicator menu and select **City clock & weather settings…**. Search for a city, choose a result, edit its display name, and click **Add city**. Use the switches in **Per-city display** to set what appears for each city. You can also edit the city list directly.

## Driving it with the GNOME Shell preferences window

In a GNOME 51 session, install and enable the packaged extension. Open its settings, search for a city, and add a result. Confirm that the city appears once and its panel content updates. Toggle one city option. Remove all cities and apply the empty list. Confirm that city controls disappear and the panel shows **Add a city**. Search again and add another city.

## Gotchas

- The city entry uses colon-separated fields and semicolon-separated entries. Those separator characters cannot appear in names.
- City search sends the query text to Open-Meteo's geocoding API.
- Use `1` or `0` for the final clock, weather, and name flags.
- Use coordinates within latitude -90 to 90 and longitude -180 to 180.
