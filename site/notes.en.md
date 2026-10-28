Local-first journal with AI built in: jot a line about today and AI reshapes it into a finished entry. No account, no cloud — every record stays on your device. AI runs on your own model and API key.

## What's inside

- **Intake list buttons unified** — Batch and Trash are now small solid buttons matching the rest of the app
- **Android batch fixed** — Back exits batch mode instead of leaving the page; changing the date exits batch mode; tapping the selection circle works
- **Dialogs stay on screen** — panel height accounts for the notch and gesture bar, long content scrolls inside, and the viewport shrinks with the keyboard
- **Desktop windows fit the screen** — size presets and restored positions are clamped to the current work area

## Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.2.12-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.2.12.apk` (~16 MB, release-signed) |

Android is a sideload build — allow installs from unknown sources. If you had an earlier debug build installed, uninstall it first: this one uses the release key and will not upgrade over it. Storage follows the platform: SQLite on desktop, IndexedDB in the browser and WebView.

## Known limits

0.2.12 is an early build. Finance and Calendar are still placeholders in the app, and the data format may change between releases — export a backup before upgrading.

MIT licensed. Primary repository: https://gitee.com/Mr_brainleech/starburst_recorder
