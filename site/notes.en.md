A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Update installers are no longer downloaded twice**: previously, if you closed the installer by accident after a download, tapping update again started the whole download over. Now the app first looks for a complete installer already on disk and opens it directly — on desktop and Android alike
- Downloads are written to a temporary file and renamed only when finished, so an interrupted download can no longer pass as a complete installer
- The elder-care high-contrast fix and food / meal QR sharing from the previous release still apply

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.10.3-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.10.3.apk` (~61 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.10.3 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
