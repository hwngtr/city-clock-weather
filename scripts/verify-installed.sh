#!/usr/bin/env bash
set -euo pipefail

uuid=city-clock-weather@hwngtr.github.io

if ! command -v gnome-extensions >/dev/null || ! command -v gdbus >/dev/null; then
    echo 'Install GNOME Shell tools before checking the extension.' >&2
    exit 1
fi

info=$(gnome-extensions info "$uuid") || {
    echo "Install $uuid before running this check." >&2
    exit 1
}
grep -Eq '^[[:space:]]*Enabled: Yes$' <<<"$info" || {
    echo "$uuid is not enabled. Enable it, then run the check again." >&2
    exit 1
}
grep -Eq '^[[:space:]]*State: ACTIVE$' <<<"$info" || {
    echo "$uuid is not active in this GNOME Shell session." >&2
    exit 1
}

errors=$(gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionErrors "$uuid")
if [[ "$errors" != '(@as [],)' ]]; then
    printf 'GNOME Shell reported extension errors: %s\n' "$errors" >&2
    exit 1
fi

printf '%s is ACTIVE. GNOME Shell reports no extension errors.\n' "$uuid"
