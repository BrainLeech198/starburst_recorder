Local-first journal with AI built in: jot a line about today and AI reshapes it into a finished entry. No account, no cloud — every record stays on your device. AI runs on your own model and API key.

## What's inside

- **The AI assistant can look things up** — besides chatting, it can browse your diary, notes, finance and health records by date or keyword, and tells you what it checked; the page and the floating bubble share one conversation UI
- **Health records get their own pages** — intake, sleep and weight each have a detail page with the same day navigation as the journal; the three home cards keep a summary and a View records link
- **Weight trend line** — the weigh-in card draws a line, switchable between 3 / 5 / 7 / 30 days
- **Sleep bar** — midnight sits in the centre, the solid block is the night you actually slept and the pale block is your ideal schedule; set ideal bedtime and wake time on the sleep page
- **Preset-library notes** — the intake, weight and sleep cards add a one-line comment from your preset library
- **Photos in the food library** — attach a thumbnail to common foods, shown in the list and detail views
- **Weight in record export** — weight is now the fifth record kind you can tick; the weight and sleep pages also export a single record as JSON
- **Desktop updates install themselves** — after the download finishes the installer is launched and the old app quits, no manual double-click needed
- **Care mode text size fixed** — text size only applies while the master switch is on; turning it off restores the standard size and keeps your chosen level

## Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.3.0-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.3.0.apk` (~16 MB, release-signed) |

Android is a sideload build — allow installs from unknown sources. If you had an earlier debug build installed, uninstall it first: this one uses the release key and will not upgrade over it. Storage follows the platform: SQLite on desktop, IndexedDB in the browser and WebView.

## Known limits

0.3.0 is an early build. Finance and Calendar are still placeholders in the app, and the data format may change between releases — export a backup before upgrading.

MIT licensed. Primary repository: https://gitee.com/Mr_brainleech/starburst_recorder
