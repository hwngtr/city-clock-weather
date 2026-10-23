#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
out_dir=${OUT_DIR:-"$root/dist"}
mkdir -p "$out_dir"

gnome-extensions pack \
    --force \
    --extra-source="$root/cities.js" \
    --extra-source="$root/weather.js" \
    --extra-source="$root/geocoding.js" \
    --schema="$root/schemas/org.gnome.shell.extensions.cityclockweather.gschema.xml" \
    --out-dir="$out_dir" \
    "$root"

test -s "$out_dir/city-clock-weather@hwngtr.github.io.shell-extension.zip"
