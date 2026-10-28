Local-first journal with AI built in: jot a line about today and AI reshapes it into a finished entry. No account, no cloud — every record stays on your device. AI runs on your own model and API key.

## What's new

- **Nine interface languages** — Simplified and Traditional Chinese, English, Japanese, Korean, German, French, Russian and Spanish, switchable under Me → Settings → Language; the change applies immediately and is remembered
- **Every string goes through the language keys** — AI errors, weather lookups, export titles and file names, backup file names and the window title all follow the current language
- **Fixed the meal review dialog** — after storing a new food and logging it, the item disappears from the pending list instead of staying marked as unhandled
- **Dialogs stay on screen** — long content scrolls inside the panel, and an error message that makes the panel grow no longer pushes it off the top
- **Export a single record** — diary slips, the stamp timeline and health intakes each have their own JSON export for one record; the batch export window now pages by category, one kind at a time
- **Health targets follow the profile** — today uses your current body profile, while past days keep the profile from the first intake of that day, so later weight edits cannot rewrite history

## Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.2.11-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.2.11.apk` (~16 MB, release-signed) |

Android is a sideload build — allow installs from unknown sources. If you had an earlier debug build installed, uninstall it first: this one uses the release key and will not upgrade over it. Storage follows the platform: SQLite on desktop, IndexedDB in the browser and WebView.

## Known limits

0.2.11 is an early build. Finance and Calendar are still placeholders in the app, and the data format may change between releases — export a backup before upgrading.

MIT licensed. Primary repository: https://gitee.com/Mr_brainleech/starburst_recorder
