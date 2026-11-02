A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **The assistant now sees what happened to its cards**: confirm, reject, undo or a failed write is fed back on the next turn. Rejected cards are not proposed again, and failures explain the reason before you decide whether to retry.
- **Backups cover your preferences**: appearance, language, care mode, assistant memory and skills, AI models, image quality, weather location and update channel now travel with the backup. If the file contains an API key, the export warns you not to share it.
- **AI chats are part of the backup**: a new "AI chats" section can be exported on its own; merging matches by chat id, replacing restores the whole set, and empty chats are left out.
- **All records gained filters**: All / Diary / Notes, each with its own count. Filter and page live in the URL, so opening an entry and coming back lands you exactly where you were; the trash sits in the header.
- **Back is a real stack now**: entries opened from search, the calendar or a list return to where they came from, and the page's own parent is only the fallback. Leaving an edited entry with unsaved changes no longer pushes an extra history entry either.
- **The training card no longer sends both buttons to the same place**: "Log one" opens the form in place, and "View records" goes to the training page.
- **All four reports live in Review**: daily, weekly, monthly and yearly reports moved into the Review tab; the week view no longer carries its own weekly-report button.
- **Reports follow a more detailed multi-dimensional format**: conclusion, comparison with the previous period, the three calorie lines, protein sources, macro split, meal timing and eating window, calorie sources, training recovery, weight and body signals, within-week or month-by-month patterns, risks and next steps. If the data has no exercise burn or sodium / processing labels, the report does not guess.
- **Small UI fixes**: spillover days in the month grid show their date instead of being blank clickable cells; delete-card titles now use the same list as the permission layer.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.12.1-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.12.1.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.12.1 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; AI chats now travel with the backup and get noticeably larger when they carry image attachments. Preferences are in the backup too — do not share a backup that contains your API key. Assistant chats stay on this device but are included in the "AI chats" backup section. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
