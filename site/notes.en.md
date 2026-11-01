A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Daytime naps**: log several naps per day with their own start and end times; naps stay out of your nightly sleep total and show up separately on the sleep page
- **The assistant can edit and delete**: change diary entries, notes and finance records, and delete finance, notes, intakes and sleep entries. Deletions always ask first, go to the recycle bin and can be undone
- **Three edit permissions**: read only, ask before changing, or change directly. Under "change directly" additions and edits save at once; deletions still need confirmation
- **A Claude Code-style conversation**: every lookup, its result summary and the elapsed time can be expanded, keeping process and answer apart
- **Skills and multiple choice**: the assistant can ask you a multiple-choice question; skills published on the site can be installed from settings, and the site now has a skill download page
- **Deep thinking switch**: available in settings and above the chat input; providers that support reasoning flags get them, so the assistant works out what to look up before answering

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.8.1-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.8.1.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.8.1 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Sleep records gained a "daytime naps" field, and older backups still import fine. Assistant memories and conversations stay on this device and are not part of backups.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
