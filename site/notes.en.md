Local-first journal with AI built in: jot a line about today and AI reshapes it into a finished entry. No account, no cloud — every record stays on your device. AI runs on your own model and API key.

## What's new

- **AI compose picks its own material** — toggle stamps, health intake and finances; if nothing is picked it says so instead of calling the model
- **It also reads back** — the last 14 days by default, or two days, today only or a custom range; a reversed range is blocked; older records only echo, never pass as today
- **Export has range and content controls** — selection, one day or a custom span, with diary and stamps toggled separately, weather and timestamps optional; JSON remains a full backup
- **The health page breathes** — the intake list starts collapsed to leave room for upcoming cards
- **Fixed in-app updates** — Android reports success only after the download finishes, failures are explicit, and the progress bar no longer vanishes early
- **Dates survive narrow screens** — the diary and health headers show the full date and wrap the actions below; timestamps carry the year
- **The site's "What's new" panel is readable again** — text no longer blends into the dark background

## Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.2.6-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.2.6.apk` (~16 MB, release-signed) |

Android is a sideload build — allow installs from unknown sources. If you had an earlier debug build installed, uninstall it first: this one uses the release key and will not upgrade over it. Storage follows the platform: SQLite on desktop, IndexedDB in the browser and WebView.

## Known limits

0.2.6 is an early build. Finance and Calendar are still placeholders in the app, and the data format may change between releases — export a backup before upgrading.

MIT licensed. Primary repository: https://gitee.com/Mr_brainleech/starburst_recorder
