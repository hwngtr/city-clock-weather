# Weather refresh and cache

## Sub-features

- Fetch current weather for all cities in one Open-Meteo request.
- Refresh on the configured timer or through **Refresh now**.
- Keep the last successful reading in the extension cache.

## How to get to it (user POV)

Open the indicator menu to view conditions and the last successful update time. Select **Refresh now** to request new readings. Set the refresh interval in **City Clock & Weather settings…**.

## Driving it with the panel indicator menu

With at least one city configured to show weather, open the menu and select **Refresh now**. Confirm that the update time changes after a successful response. Check `journalctl --user -b` for `[city-clock-weather]` errors if the data does not update.

## Gotchas

- Weather requests send configured coordinates, time zones, units, and requested fields to `api.open-meteo.com`.
- The automated headless verification disables weather for its test city and does not contact Open-Meteo.
- Network failures keep the last cached reading and log an error.
