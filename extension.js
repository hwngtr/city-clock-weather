import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {parseCityList} from './cities.js';
import {parseWeatherResults} from './weather.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// WMO weather interpretation codes returned by Open-Meteo
const CONDITIONS = {
    0: ['Clear', 'weather-clear-symbolic'],
    1: ['Mainly clear', 'weather-few-clouds-symbolic'],
    2: ['Partly cloudy', 'weather-few-clouds-symbolic'],
    3: ['Overcast', 'weather-overcast-symbolic'],
    45: ['Fog', 'weather-fog-symbolic'],
    48: ['Freezing fog', 'weather-fog-symbolic'],
    51: ['Light drizzle', 'weather-showers-scattered-symbolic'],
    53: ['Drizzle', 'weather-showers-scattered-symbolic'],
    55: ['Heavy drizzle', 'weather-showers-symbolic'],
    56: ['Freezing drizzle', 'weather-showers-symbolic'],
    57: ['Freezing drizzle', 'weather-showers-symbolic'],
    61: ['Light rain', 'weather-showers-scattered-symbolic'],
    63: ['Rain', 'weather-showers-symbolic'],
    65: ['Heavy rain', 'weather-showers-symbolic'],
    66: ['Freezing rain', 'weather-showers-symbolic'],
    67: ['Freezing rain', 'weather-showers-symbolic'],
    71: ['Light snow', 'weather-snow-symbolic'],
    73: ['Snow', 'weather-snow-symbolic'],
    75: ['Heavy snow', 'weather-snow-symbolic'],
    77: ['Snow grains', 'weather-snow-symbolic'],
    80: ['Light showers', 'weather-showers-scattered-symbolic'],
    81: ['Showers', 'weather-showers-symbolic'],
    82: ['Violent showers', 'weather-showers-symbolic'],
    85: ['Snow showers', 'weather-snow-symbolic'],
    86: ['Heavy snow showers', 'weather-snow-symbolic'],
    95: ['Thunderstorm', 'weather-storm-symbolic'],
    96: ['Storm with hail', 'weather-storm-symbolic'],
    99: ['Storm with heavy hail', 'weather-storm-symbolic'],
};

const API_BASE = 'https://api.open-meteo.com/v1/forecast';
const ACCENT_COLORS = {
    blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800',
    orange: '#ed5b00', red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

function describe(code) {
    return CONDITIONS[code] ?? ['Unknown', 'weather-severe-alert-symbolic'];
}

function bytesToText(bytes) {
    let array;
    if (typeof bytes.get_data === 'function')
        array = bytes.get_data();
    else
        array = bytes.toArray();
    return new TextDecoder().decode(array);
}

export default class CityClockWeatherExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._cities = [];
        this._rows = [];
        this._data = {};
        this._lastFetched = 0;
        this._timeoutId = 0;
        this._clockTimeoutId = 0;
        this._httpSession = null;
        this._fetchInFlight = false;
        this._refreshAfterFetch = false;
        this._indicator = null;
        this._panelBox = null;
        this._cityWidgets = [];
        this._citySeparators = [];
        this._emptyLabel = null;
        this._footer = null;
        this._settingsId = 0;
        this._desktopSettings = null;
        this._accentId = 0;
        this._desktopClockId = 0;
    }

    enable() {
        this._settings = this.getSettings();
        this._cities = this._readCities();
        this._cacheFile = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_cache_dir(), this.uuid, 'weather.json']));
        this._loadCache();
        this._desktopSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._httpSession = new Soup.Session({timeout: 15});
        this._accentId = this._desktopSettings.connect('changed::accent-color', () => this._applyStyle());
        this._desktopClockId = this._desktopSettings.connect('changed::clock-format', () => this._render());

        this._buildIndicator();
        this._render();
        this._applyStyle();
        this._fetchAll();
        this._startTimer();
        this._clockTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._render();
            return GLib.SOURCE_CONTINUE;
        });

        this._settingsId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'box' || key === 'position-index')
                this._rebuildPanel();
            else if (key === 'refresh-minutes')
                this._startTimer();
            else if (key === 'cities')
                this._rebuildData(true);
            else if (key === 'fahrenheit') {
                this._fetchAll();
                this._render();
            } else if (key === 'clock-format' || key === 'show-icon' || key === 'show-city-labels') {
                this._render();
            } else if (key === 'follow-accent' || key === 'custom-color' || key === 'opacity') {
                this._applyStyle();
            } else {
                this._render();
            }
        });
    }

    disable() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._clockTimeoutId) {
            GLib.Source.remove(this._clockTimeoutId);
            this._clockTimeoutId = 0;
        }
        this._httpSession?.abort();
        this._httpSession = null;
        this._fetchInFlight = false;
        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }
        if (this._desktopSettings && this._accentId)
            this._desktopSettings.disconnect(this._accentId);
        if (this._desktopSettings && this._desktopClockId)
            this._desktopSettings.disconnect(this._desktopClockId);
        this._accentId = 0;
        this._desktopClockId = 0;
        this._desktopSettings = null;
        this._destroyIndicator();
        this._settings = null;
        this._rows = [];
        this._data = {};
    }

    _readCities() {
        const raw = this._settings.get_string('cities');
        const cities = parseCityList(raw);
        const entries = raw.split(';').filter(entry => entry.trim());
        if (cities.length !== entries.length)
            console.warn('[city-clock-weather] Ignored malformed city settings. Check the city list in preferences.');
        return cities;
    }

    _startTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        const minutes = Math.max(5, this._settings.get_int('refresh-minutes'));
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, minutes * 60, () => {
                this._fetchAll();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _buildIndicator() {
        this._destroyIndicator();

        const indicator = new PanelMenu.Button(0.25, _('City Clock & Weather'), false);
        this._panelBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        indicator.add_child(this._panelBox);
        this._indicator = indicator;
        this._buildPanelCities();

        this._buildMenu();

        const boxName = this._settings.get_string('box');
        const index = this._settings.get_int('position-index');
        Main.panel.addToStatusArea(this.uuid, indicator, index, boxName);
    }

    _destroyIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
            this._panelBox = null;
            this._cityWidgets = [];
            this._citySeparators = [];
            this._emptyLabel = null;
            this._footer = null;
        }
    }

    /**
     * Drop the old indicator and build a new one. Required because
     * Main.panel.addToStatusArea refuses a role that is already taken.
     */
    _rebuildPanel() {
        this._buildIndicator();
        this._render();
    }

    /** Refresh the city list, optionally refetching everything. */
    _rebuildData(refetch) {
        this._cities = this._readCities();
        const cityKeys = new Set(this._cities.map(city => city.key));
        this._data = Object.fromEntries(
            Object.entries(this._data).filter(([key]) => cityKeys.has(key)));
        this._lastFetched = Object.values(this._data)
            .filter(value => Number.isFinite(value?.fetched))
            .reduce((latest, value) => Math.max(latest, value.fetched), 0);
        if (this._indicator) {
            this._buildPanelCities();
            this._buildMenu();
        }
        if (refetch)
            this._fetchAll();
        this._render();
        this._applyStyle();
    }

    _applyStyle() {
        if (!this._panelBox || !this._settings)
            return;
        const accent = this._desktopSettings?.get_string('accent-color') ?? 'blue';
        const color = this._settings.get_boolean('follow-accent')
            ? ACCENT_COLORS[accent] ?? ACCENT_COLORS.blue
            : (/^#[\da-f]{6}$/i.test(this._settings.get_string('custom-color'))
                ? this._settings.get_string('custom-color')
                : ACCENT_COLORS.blue);
        const opacity = Math.max(0, Math.min(100, this._settings.get_int('opacity')));
        if (this._emptyLabel)
            this._emptyLabel.opacity = Math.round(opacity * 2.55);
        this._cityWidgets.forEach(({box, identity, weather, icon}) => {
            box.opacity = Math.round(opacity * 2.55);
            identity.set_style(`margin-right: ${weather.visible && !icon.visible ? 6 : 0}px;`);
            weather.set_style(`margin-left: ${icon.visible || identity.visible ? 6 : 0}px;`);
            icon.set_style(`color: ${color}; margin-left: ${identity.visible ? 6 : 0}px;`);
        });
    }

    _buildPanelCities() {
        if (!this._panelBox)
            return;
        this._panelBox.get_children().forEach(child => child.destroy());
        this._cityWidgets = [];
        this._citySeparators = [];
        this._emptyLabel = null;
        if (this._cities.length === 0) {
            this._emptyLabel = new St.Label({
                text: _('Add a city'),
                y_align: Clutter.ActorAlign.CENTER,
                y_expand: true,
            });
            this._panelBox.add_child(this._emptyLabel);
            return;
        }
        this._cities.forEach((city, index) => {
            if (index > 0) {
                const separator = new St.Label({
                    text: '\u2502',
                    y_align: Clutter.ActorAlign.CENTER,
                    y_expand: true,
                    style: 'margin: 0 9px; opacity: 0.7; font-weight: bold;',
                });
                this._panelBox.add_child(separator);
                this._citySeparators.push({index, actor: separator});
            }

            const box = new St.BoxLayout({
                y_align: Clutter.ActorAlign.CENTER,
                y_expand: true,
            });
            const makeLabel = () => {
                const label = new St.Label({
                    text: '',
                    y_align: Clutter.ActorAlign.CENTER,
                    y_expand: true,
                });
                box.add_child(label);
                return label;
            };
            const identity = makeLabel();
            const icon = new St.Icon({
                icon_name: 'weather-severe-alert-symbolic',
                icon_size: 16,
                y_align: Clutter.ActorAlign.CENTER,
                y_expand: true,
                visible: false,
            });
            const weather = makeLabel();
            box.insert_child_at_index(icon, 1);
            this._panelBox.add_child(box);
            this._cityWidgets.push({city, box, identity, weather, icon});
        });
    }

    _buildMenu() {
        const menu = this._indicator.menu;
        menu.removeAll();
        this._rows = [];
        this._footer = null;
        this._footerLabel = null;

        this._cities.forEach(city => {
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            const label = new St.Label({text: `${city.displayName}: \u2026`});
            label.clutter_text.line_wrap = true;
            item.add_child(label);
            menu.addMenuItem(item);
            this._rows.push({city, label});
        });

        if (this._cities.length > 0) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._footer = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            this._footerLabel = new St.Label({text: '', style_class: 'popup-inactive-menu-item'});
            this._footer.add_child(this._footerLabel);
            menu.addMenuItem(this._footer);

            const refreshItem = new PopupMenu.PopupMenuItem(_('Refresh now'));
            refreshItem.connect('activate', () => this._fetchAll());
            menu.addMenuItem(refreshItem);

            const appItem = new PopupMenu.PopupMenuItem(_('Open GNOME Weather'));
            appItem.connect('activate', () => this._launchWeatherApp());
            menu.addMenuItem(appItem);
        } else {
            const emptyItem = new PopupMenu.PopupMenuItem(_('Add a city in settings…'));
            emptyItem.connect('activate', () => this.openPreferences());
            menu.addMenuItem(emptyItem);
        }

        const settingsItem = new PopupMenu.PopupMenuItem(_('City clock & weather settings…'));
        settingsItem.connect('activate', () => this.openPreferences());
        menu.addMenuItem(settingsItem);

    }

    _fetchAll() {
        const weatherCities = this._cities.filter(city => city.showWeather);
        if (!weatherCities.length || !this._httpSession)
            return;
        if (this._fetchInFlight) {
            this._refreshAfterFetch = true;
            return;
        }
        this._fetchInFlight = true;
        const imperial = this._settings.get_boolean('fahrenheit');
        const params = {
            latitude: weatherCities.map(city => city.latitude).join(','),
            longitude: weatherCities.map(city => city.longitude).join(','),
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
            temperature_unit: imperial ? 'fahrenheit' : 'celsius',
            wind_speed_unit: imperial ? 'mph' : 'kmh',
        };
        params.timezone = weatherCities.map(city => city.timeZone).join(',');

        const query = Object.entries(params)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        const url = `${API_BASE}?${query}`;

        const message = Soup.Message.new('GET', url);
        if (!message) {
            this._fetchInFlight = false;
            console.warn('[city-clock-weather] failed to build weather request');
            return;
        }

        this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (src, result) => {
            try {
                const bytes = src.send_and_read_finish(result);
                if (message.get_status() < 200 || message.get_status() >= 300)
                    throw new Error(`Open-Meteo returned HTTP ${message.get_status()}`);
                const payload = JSON.parse(bytesToText(bytes));
                const results = parseWeatherResults(payload, weatherCities);
                results.forEach((weather, index) => {
                    const city = weatherCities[index];
                    const fetched = Date.now();
                    this._data[city.key] = {...weather, fetched};
                    this._lastFetched = Math.max(this._lastFetched, fetched);
                });
                this._render();
                this._saveCache();
            } catch (e) {
                console.warn(`[city-clock-weather] request failed: ${e}`);
            } finally {
                this._fetchInFlight = false;
                if (this._refreshAfterFetch) {
                    this._refreshAfterFetch = false;
                    this._fetchAll();
                }
            }
        });
    }

    _launchWeatherApp() {
        try {
            const app = Gio.DesktopAppInfo.new('org.gnome.Weather.desktop');
            if (app)
                app.launch([], null);
        } catch (e) {
            console.warn(`[city-clock-weather] cannot launch GNOME Weather: ${e}`);
        }
    }

    _unit() {
        return this._settings.get_boolean('fahrenheit') ? '\u00B0F' : '\u00B0C';
    }

    _render() {
        if (!this._panelBox)
            return;

        const showIcon = this._settings.get_boolean('show-icon');
        const showCity = this._settings.get_boolean('show-city-labels');
        const unit = this._unit();
        this._cityWidgets.forEach(({city, box, identity, weather, icon}) => {
            const entry = this._data[city.key];
            const identityParts = [];
            if (city.showClock)
                identityParts.push(this._formatCityTime(city));
            if (showCity && city.showName)
                identityParts.push(city.displayName);
            identity.text = identityParts.join(' ');
            identity.visible = identityParts.length > 0;
            icon.visible = city.showWeather && showIcon && Boolean(entry);
            weather.visible = city.showWeather;
            box.visible = identity.visible || city.showWeather;
            if (city.showWeather)
                weather.text = entry ? `${Math.round(entry.temp)}${unit}` : '\u2013';
            if (entry)
                icon.icon_name = describe(entry.code)[1];
        });
        this._citySeparators.forEach(({index, actor}) => {
            actor.visible = this._cityWidgets[index].box.visible &&
                this._cityWidgets.slice(0, index).some(widget => widget.box.visible);
        });
        this._applyStyle();

        this._rows.forEach(({city, label}) => {
            const entry = this._data[city.key];
            if (!entry) {
                label.text = `${city.displayName} \u00b7 ${this._formatCityTime(city)} \u00b7 weather unavailable`;
                return;
            }
            const [text] = describe(entry.code);
            label.text =
                `${city.displayName} \u00b7 ${this._formatCityTime(city)}  ${Math.round(entry.temp)}${unit}  ${text}\n` +
                `Feels ${Math.round(entry.feels)}${unit} \u00B7 humidity ${entry.humidity}% \u00B7 wind ${Math.round(entry.wind)} ${this._settings.get_boolean('fahrenheit') ? 'mph' : 'km/h'}`;
        });

        if (this._footerLabel) {
            const stamp = this._lastFetched
                ? GLib.DateTime.new_from_unix_local(Math.floor(this._lastFetched / 1000)).format('%H:%M')
                : null;
            this._footerLabel.text = stamp
                ? `Last weather update ${stamp} \u00B7 source open-meteo.com`
                : 'No weather data yet \u00B7 source open-meteo.com';
        }
    }

    _formatCityTime(city) {
        try {
            const zone = GLib.TimeZone.new_identifier(city.timeZone);
            if (!zone)
                return '--:--';
            const date = GLib.DateTime.new_now(zone);
            const format = this._settings.get_enum('clock-format');
            const use12h = format === 1 || (format === 0 && this._desktopSettings.get_string('clock-format') === '12h');
            return date.format(use12h ? '%I:%M %p' : '%H:%M');
        } catch (e) {
            console.warn(`[city-clock-weather] invalid timezone for ${city.displayName}: ${e}`);
            return '--:--';
        }
    }

    _loadCache() {
        try {
            const [, contents] = this._cacheFile.load_contents(null);
            this._data = JSON.parse(bytesToText(contents));
            this._lastFetched = Object.values(this._data)
                .filter(value => Number.isFinite(value?.fetched))
                .reduce((latest, value) => Math.max(latest, value.fetched), 0);
        } catch (e) {
            this._data = {};
            this._lastFetched = 0;
        }
    }

    _saveCache() {
        try {
            const parent = this._cacheFile.get_parent();
            if (parent && !parent.query_exists(null))
                parent.make_directory_with_parents(null);
            this._cacheFile.replace_contents(
                JSON.stringify(this._data), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.warn(`[city-clock-weather] cache write failed: ${e}`);
        }
    }
}
