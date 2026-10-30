A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Fixed importing backups on Windows desktop**: entries and notes with photos no longer fail on replace-import, and importing only notes no longer writes their photos wrong
- **Merge import now flags photo differences**: same text but different photos counts as a conflict, with both photo counts shown — a backup can no longer silently overwrite your local photos

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.5.1-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.5.1.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.5.1 is an early build. Finance and calendar are still placeholder pages, and the data format may change between versions — export a backup of anything you care about before upgrading.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
