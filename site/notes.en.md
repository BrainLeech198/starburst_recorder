A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Elder-care high contrast is fixed**: it only worked in the default dark theme before — switch to light, paper, mist or any other palette and the toggle did nothing. Secondary text and dividers now get clearly stronger in every theme
- The food and meal QR sharing from the previous release still applies: Share in the row menu shows a QR code the other person can scan, and when photos and detail do not fit, copy the share code or save a file and it imports with photos intact

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.10.2-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.10.2.apk` (~61 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.10.2 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
