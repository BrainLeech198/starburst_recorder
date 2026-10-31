A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Draw your own illustrations in diaries and notes**: the image source adds "Draw it yourself", with pen, eraser, colour, brush size, undo and clear; the drawing is inserted as an image
- **Food library entries can be picked for export and import**: record export gains a food category that mixes with diary, notes and health records in one file; import reads the same file with photos carried in JSON (readable formats note that photos are JSON-only)
- **Lighter food-photo processing**: the decoded original bitmap is released and the canvas recycled right after compression, so saving on low-memory phones is less likely to be killed

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.6.0-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.6.0.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.6.0 is an early build. Finance and calendar are still placeholder pages, and the data format may change between versions — export a backup of anything you care about before upgrading.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
