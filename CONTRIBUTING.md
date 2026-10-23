# Contributing

## Check a change

Install Node.js 20 or newer and GLib schema tools. Run:

```sh
make check
```

The check validates JavaScript syntax, compiles the GSettings schema in strict dry-run mode, and runs the pure city and weather parser tests.

To build the GNOME extension bundle, install `gnome-extensions` and run:

```sh
make package
```

To check an installed extension in a GNOME Shell 51 session, install and enable the bundle, then run:

```sh
make verify
```

## Prepare a release

1. Update the integer `version` in `metadata.json`.
2. Run `make check` and `make package`.
3. Commit the version change.
4. Create a matching `vN` tag, such as `v1` for metadata version `1`.
5. Push the tag. The release workflow creates a GitHub release with the extension bundle.

The `shell-version` list currently declares GNOME Shell 51. Update it only after checking the extension on the new Shell release.
