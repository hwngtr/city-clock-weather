import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {cityDefinitionKey, formatCityEntry, isValidCityList, migrateCityList, parseCityList, updateCityOption} from './cities.js';
import {parseGeocodingResults} from './geocoding.js';

export default class CityClockWeatherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: _('Cities'), icon_name: 'weather-clear-symbolic'});
        window.add(page);

        const searchGroup = new Adw.PreferencesGroup({
            title: _('Find a city'),
            description: _('Search Open-Meteo for a place. Select a result to fill its coordinates and time zone.'),
        });
        page.add(searchGroup);

        const searchEntry = new Adw.EntryRow({title: _('City or place name')});
        searchGroup.add(searchEntry);
        const searchButton = new Gtk.Button({label: _('Search'), valign: Gtk.Align.CENTER});
        searchEntry.add_suffix(searchButton);

        const resultsModel = new Gtk.StringList();
        const resultsRow = new Adw.ComboRow({
            title: _('Search results'),
            model: resultsModel,
            visible: false,
        });
        searchGroup.add(resultsRow);

        const displayNameRow = new Adw.EntryRow({title: _('Display name'), visible: false});
        searchGroup.add(displayNameRow);
        const addCityButton = new Gtk.Button({label: _('Add city'), valign: Gtk.Align.CENTER, sensitive: false});
        displayNameRow.add_suffix(addCityButton);

        const searchStatus = new Adw.ActionRow({title: _('City search')});
        searchGroup.add(searchStatus);
        const searchSession = new Soup.Session({timeout: 15});
        let searchResults = [];
        let searchInProgress = false;
        let preferencesClosed = false;

        window.connect('close-request', () => {
            preferencesClosed = true;
            searchSession.abort();
            return false;
        });

        resultsRow.connect('notify::selected', () => {
            const selected = searchResults[resultsRow.selected];
            displayNameRow.text = selected?.name ?? '';
            addCityButton.sensitive = Boolean(selected);
        });

        searchButton.connect('clicked', () => {
            const query = searchEntry.text.trim();
            if (query.length < 2) {
                searchStatus.subtitle = _('Enter at least two characters to search.');
                return;
            }
            if (searchInProgress || preferencesClosed)
                return;

            const url = 'https://geocoding-api.open-meteo.com/v1/search' +
                `?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;
            const message = Soup.Message.new('GET', url);
            if (!message) {
                searchStatus.subtitle = _('Could not create the city search request.');
                return;
            }

            searchInProgress = true;
            searchButton.sensitive = false;
            searchButton.label = _('Searching…');
            searchStatus.subtitle = _('Searching Open-Meteo…');
            searchResults = [];
            resultsRow.visible = false;
            displayNameRow.visible = false;
            addCityButton.sensitive = false;

            searchSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (message.get_status() < 200 || message.get_status() >= 300)
                        throw new Error(`Geocoding returned HTTP ${message.get_status()}.`);
                    const payload = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                    if (preferencesClosed)
                        return;

                    searchResults = parseGeocodingResults(payload);
                    if (searchResults.length === 0) {
                        resultsModel.splice(0, resultsModel.get_n_items(), []);
                        searchStatus.subtitle = _('No matching cities found. Try a nearby city or a longer search.');
                        return;
                    }

                    resultsModel.splice(0, resultsModel.get_n_items(), searchResults.map(city => city.label));
                    resultsRow.selected = 0;
                    resultsRow.visible = true;
                    displayNameRow.text = searchResults[0].name;
                    displayNameRow.visible = true;
                    addCityButton.sensitive = true;
                    searchStatus.subtitle = _(`${searchResults.length} matching places found.`);
                } catch (error) {
                    if (!preferencesClosed)
                        searchStatus.subtitle = _('City search failed. Check your internet connection and try again.');
                    console.warn(`[city-clock-weather] city search failed: ${error}`);
                } finally {
                    searchInProgress = false;
                    if (!preferencesClosed) {
                        searchButton.label = _('Search');
                        searchButton.sensitive = true;
                    }
                }
            });
        });

        addCityButton.connect('clicked', () => {
            const selected = searchResults[resultsRow.selected];
            const displayName = displayNameRow.text.trim();
            if (!selected || !displayName || /[:;]/.test(displayName)) {
                searchStatus.subtitle = _('Enter a display name without colons or semicolons.');
                return;
            }

            if (cityEntry.text !== settings.get_string('cities')) {
                searchStatus.subtitle = _('Apply the manual city-list edits before adding a search result.');
                return;
            }

            const current = migrateCityList(settings.get_string('cities'));
            if (!isValidCityList(current)) {
                searchStatus.subtitle = _('Fix or apply the manual city list before adding a search result.');
                return;
            }

            const serializedCityEntry = formatCityEntry({
                ...selected,
                displayName,
                showClock: true,
                showWeather: true,
                showName: true,
            });
            const parsed = parseCityList(current);
            if (parsed.some(city => city.key === `${selected.latitude},${selected.longitude}`)) {
                searchStatus.subtitle = _('That location is already in the city list.');
                return;
            }

            settings.set_string('cities', current ? `${current};${serializedCityEntry}` : serializedCityEntry);
            searchStatus.subtitle = _(`${displayName} was added to the city list.`);
            addCityButton.sensitive = false;
        });

        const cityGroup = new Adw.PreferencesGroup({
            title: _('City list'),
            description: _('Edit the encoded city list directly if you need to change coordinates or flags.'),
        });
        page.add(cityGroup);

        const cityEntry = new Adw.EntryRow({title: _('Cities'), text: migrateCityList(settings.get_string('cities'))});
        cityEntry.set_tooltip_text(_('Per city: Display name:weather location:latitude:longitude:time zone:show clock:show weather:show name. Flags use 1 or 0.'));
        cityGroup.add(cityEntry);
        const apply = new Gtk.Button({label: _('Apply'), valign: Gtk.Align.CENTER});
        cityEntry.add_suffix(apply);
        apply.connect('clicked', () => {
            if (isValidCityList(cityEntry.text))
                settings.set_string('cities', cityEntry.text);
            else
                cityEntry.add_css_class('error');
        });
        cityEntry.connect('changed', () => {
            cityEntry.remove_css_class('error');
            apply.sensitive = cityEntry.text !== settings.get_string('cities');
        });
        settings.connect('changed::cities', () => {
            if (cityEntry.text !== settings.get_string('cities'))
                cityEntry.text = settings.get_string('cities');
            apply.sensitive = false;
        });

        const cityHelp = new Adw.ActionRow({
            title: _('Example and display options'),
            subtitle: 'Home:London:51.5072:-0.1276:Europe/London:1:1:1;Office:Tokyo:35.6762:139.6503:Asia/Tokyo:0:1:0',
        });
        cityGroup.add(cityHelp);
        cityGroup.add(new Adw.ActionRow({
            title: _('City definition format'),
            subtitle: _('The final three values set the defaults for clock, weather and name. Use the switches below for easy per-city changes.'),
        }));

        const panelGroup = new Adw.PreferencesGroup({title: _('Panel position')});
        page.add(panelGroup);
        const boxNames = ['left', 'center', 'right'];
        const boxModel = new Gtk.StringList();
        [_('Left'), _('Center'), _('Right')].forEach(value => boxModel.append(value));
        const boxRow = new Adw.ComboRow({
            title: _('Panel section'), model: boxModel,
            selected: Math.max(0, boxNames.indexOf(settings.get_string('box'))),
        });
        panelGroup.add(boxRow);
        boxRow.connect('notify::selected', row => settings.set_string('box', boxNames[row.selected] ?? 'right'));
        settings.connect('changed::box', () => {
            const index = boxNames.indexOf(settings.get_string('box'));
            if (index >= 0 && boxRow.selected !== index)
                boxRow.selected = index;
        });

        const position = this._spinRow(_('Position within section'), _('Zero is the outermost slot'), 0, 20, settings.get_int('position-index'));
        panelGroup.add(position.row);
        position.connectValue(value => settings.set_int('position-index', value));
        settings.connect('changed::position-index', () => position.setValue(settings.get_int('position-index')));

        let cityControls = this._buildCityControls(page, settings, settings.get_string('cities'));
        let definitionKey = cityDefinitionKey(settings.get_string('cities'));

        const displayGroup = new Adw.PreferencesGroup({title: _('Display')});
        page.add(displayGroup);

        this._addSwitch(displayGroup, settings, 'show-city-labels', _('Show display names'), _('Show the custom name for each city in the panel'));
        this._addSwitch(displayGroup, settings, 'show-icon', _('Show weather icons'), _('Show a symbol for current conditions'));
        this._addSwitch(displayGroup, settings, 'fahrenheit', _('Use Fahrenheit'), _('Also show wind speed in miles per hour'));
        this._addSwitch(displayGroup, settings, 'follow-accent', _('Follow system accent color'), _('Use the GNOME accent color for weather icons'));

        const colorRow = new Adw.EntryRow({title: _('Custom icon color (hex)'), text: settings.get_string('custom-color')});
        displayGroup.add(colorRow);
        const colorApply = new Gtk.Button({label: _('Apply'), valign: Gtk.Align.CENTER});
        colorRow.add_suffix(colorApply);
        colorApply.connect('clicked', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(colorRow.text)) {
                settings.set_string('custom-color', colorRow.text);
                colorRow.remove_css_class('error');
            } else {
                colorRow.add_css_class('error');
            }
        });
        settings.connect('changed::custom-color', () => {
            colorRow.text = settings.get_string('custom-color');
        });

        const timeGroup = new Adw.PreferencesGroup({title: _('Time and appearance')});
        page.add(timeGroup);
        const formatModel = new Gtk.StringList();
        [_('Follow system'), _('12-hour'), _('24-hour')].forEach(value => formatModel.append(value));
        const formatRow = new Adw.ComboRow({title: _('Clock format'), model: formatModel, selected: settings.get_enum('clock-format')});
        timeGroup.add(formatRow);
        formatRow.connect('notify::selected', row => settings.set_enum('clock-format', row.selected));
        settings.connect('changed::clock-format', () => formatRow.selected = settings.get_enum('clock-format'));

        const opacity = this._spinRow(_('Indicator opacity'), _('0 is transparent; 100 is fully opaque'), 0, 100, settings.get_int('opacity'));
        timeGroup.add(opacity.row);
        opacity.connectValue(value => settings.set_int('opacity', value));
        settings.connect('changed::opacity', () => opacity.setValue(settings.get_int('opacity')));

        const refreshGroup = new Adw.PreferencesGroup({title: _('Weather updates')});
        page.add(refreshGroup);
        const refresh = this._spinRow(_('Refresh interval (minutes)'), _('Choose a value from 5 to 240 minutes'), 5, 240, settings.get_int('refresh-minutes'));
        refreshGroup.add(refresh.row);
        refresh.connectValue(value => settings.set_int('refresh-minutes', value));
        settings.connect('changed::refresh-minutes', () => refresh.setValue(settings.get_int('refresh-minutes')));

        settings.connect('changed::cities', () => {
            const raw = settings.get_string('cities');
            if (cityEntry.text !== raw)
                cityEntry.text = raw;
            apply.sensitive = false;

            const nextDefinitionKey = cityDefinitionKey(raw);
            if (nextDefinitionKey !== definitionKey) {
                const groupsAfterCities = [displayGroup, timeGroup, refreshGroup];
                cityControls.groups.forEach(group => page.remove(group));
                groupsAfterCities.forEach(group => page.remove(group));
                cityControls = this._buildCityControls(page, settings, raw);
                groupsAfterCities.forEach(group => page.add(group));
                definitionKey = nextDefinitionKey;
            } else {
                cityControls.sync(raw);
            }
        });
    }

    _buildCityControls(page, settings, raw) {
        const groups = [];
        const switches = [];
        parseCityList(raw).forEach(city => {
            const cityGroup = new Adw.PreferencesGroup({
                title: city.displayName,
                description: `${city.weatherName} · ${city.timeZone}`,
            });
            page.add(cityGroup);
            groups.push(cityGroup);

            [
                ['clock', _('Show local clock'), _('Show this city’s local time in the panel')],
                ['weather', _('Show weather'), _('Show temperature and condition icon in the panel')],
                ['name', _('Show display name'), _('Show the custom city name in the panel')],
            ].forEach(([option, title, subtitle]) => {
                const active = {clock: city.showClock, weather: city.showWeather, name: city.showName}[option];
                const row = new Adw.SwitchRow({title, subtitle, active});
                cityGroup.add(row);
                switches.push({index: city.index, option, row});
                row.connect('notify::active', widget => {
                    const current = settings.get_string('cities');
                    const updated = updateCityOption(current, city.index, option, widget.active);
                    if (updated !== current)
                        settings.set_string('cities', updated);
                });
            });
        });

        return {
            groups,
            sync: currentRaw => {
                const cities = parseCityList(currentRaw);
                switches.forEach(({index, option, row}) => {
                    const city = cities.find(candidate => candidate.index === index);
                    if (!city)
                        return;
                    const active = {clock: city.showClock, weather: city.showWeather, name: city.showName}[option];
                    if (row.active !== active)
                        row.active = active;
                });
            },
        };
    }

    _addSwitch(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _spinRow(title, subtitle, minimum, maximum, value) {
        const adjustment = new Gtk.Adjustment({lower: minimum, upper: maximum, step_increment: 1, page_increment: 5, value});
        const row = new Adw.ActionRow({title, subtitle});
        const spin = new Gtk.SpinButton({adjustment, numeric: true, valign: Gtk.Align.CENTER, width_chars: 4});
        row.add_suffix(spin);
        row.activatable_widget = spin;
        return {
            row,
            connectValue: callback => spin.connect('value-changed', widget => callback(widget.get_value_as_int())),
            setValue: next => { if (spin.get_value_as_int() !== next) spin.value = next; },
        };
    }
}
