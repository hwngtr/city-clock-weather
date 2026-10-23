---
name: verify
description: Verify the City Clock & Weather GNOME Shell extension before changing code or packaging a release.
---

# Verify City Clock & Weather

## Launch

Install and enable the bundle in a GNOME Shell 51 test account. The extension needs a real user-mode Shell session. Then run `make verify` from the repository root.

Expected output:

```text
city-clock-weather@hwngtr.github.io is ACTIVE. GNOME Shell reports no extension errors.
```

The check reads the installed extension state. It does not change settings or make weather requests.

## Doctor

Run these read-only checks before investigating a failure:

```sh
gnome-shell --version
node --version
command -v gnome-extensions glib-compile-schemas gdbus node
```

The project metadata declares GNOME Shell 51. The check needs the extension installed in the current GNOME user session.

## Drive

Run the installed-extension check:

```sh
make verify
```

Drive the graphical settings manually in a GNOME 51 session:

1. Run `make package`.
2. Install `dist/city-clock-weather@hwngtr.github.io.shell-extension.zip` with `gnome-extensions install --force`.
3. Enable the extension and open **City Clock & Weather settings** from the panel menu.
4. Toggle one city's clock, weather, or display-name switch. Confirm that the panel changes and the city remains listed once.
5. Remove that city from the city list, click **Apply**, and confirm its per-city switches disappear.

## Evidence

The check records the active state and error list. To keep a transcript, run:

```sh
mkdir -p .verify
make verify 2>&1 | tee .verify/runtime.log
```

For the graphical checks, capture a screenshot that shows the settings action and the changed panel label. Check the persisted city setting with `gsettings get org.gnome.shell.extensions.cityclockweather cities`. Do not include real city names or coordinates in public test artifacts.

## Cleanup

The command only reads extension state. It does not stop GNOME Shell or change settings. If you installed a test bundle, disable and uninstall it after the test. Keep screenshots and transcripts until you no longer need the evidence.

## Helpers

- `make check` runs JavaScript syntax checks, strict schema validation, and the pure city/weather parser tests.
- `make verify` checks the installed extension in the current GNOME session.
- `make package` checks the project and creates the GNOME extension bundle.
