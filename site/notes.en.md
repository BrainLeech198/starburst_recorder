A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Photos in notes and diaries**: stamps can be photo-only (camera or gallery), up to 9 per entry; diary body embeds images with markers and renders mixed text and images; images are compressed and stored inline, and travel with backups
- **Slimmer health home**: the three cards are now metric cards; the ideal sleep schedule moved into the sleep card (a minimal profile is created automatically if you don't have one)
- **Record-level import for sleep / weights**: import single-record JSON files (same-day entries are overwritten), plus cross-day batch delete and export; the Data & Backup import recognizes these files too
- **Cleaner exports**: Markdown / plain-text export and AI polish automatically strip image markers
- **Dialogs no longer cut off on phones**: every dialog, the image viewer and the assistant sheet now render at the top layer, so the bottom navigation can't cover them and panels are never half-visible

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.4.0-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.4.0.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.4.0 is an early build. Finance and calendar are still placeholder pages, and the data format may change between versions — export a backup of anything you care about before upgrading.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
