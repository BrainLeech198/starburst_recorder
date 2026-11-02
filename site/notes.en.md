A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **The AI assistant can now act**: it can search all fourteen record types, read charts and old photos, and add, edit or delete schedules, diary entries, notes, spending, food, sleep, training, weigh-ins and the health profile. Every write shows a preview card first; deletes always ask for confirmation, and completed writes can be undone.
- **Auto-save is for creates only**: the "save new entries automatically" permission is now an allow-list. Edits and deletes can no longer be written straight from a sentence.
- **Nutrition estimates can use reference photos**: food and meal AI chats take up to three images (a nutrition label or the dish itself), and only the latest user message carries them, so context is not eaten up.
- **Meals have their own cover**: upload or take a cover photo; without one it still falls back to the first component photo. Share codes and backups carry it.
- **All diary entries and notes in one list**: 20 per page, newest date first; a diary row opens its editor, a note row jumps to that day.
- **Calendar and week views swipe**: swipe the month grid to change months and the week view to change weeks, using the same date logic as the paging buttons.
- **TDEE no longer counts today**: today's unfinished weigh-ins and intake are excluded from the estimate, and the health page and trend page share the same calculation.
- **Use your own floating-ball image**: pick and compress an image in settings, preview it on the ball and restore the default at any time; when peeking it keeps at least 44px on screen for easier tapping.
- **Search and the ledger**: global search covers ten record types with exact tag matching; the finance page supports batch selection, swiping between periods, undoable deletes, and red / green income and expense colours.
- **Stability and safety**: desktop AI requests and update downloads gained timeouts and path guards; purging from the trash now refreshes the list immediately; schedule and training backups are split into finer sections.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.12.0-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.12.0.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.12.0 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; the meal cover is optional and falls back to a component photo when absent. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
