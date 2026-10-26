Local-first journal with AI built in: jot a line about today and AI reshapes it into a finished entry. No account, no cloud — every record stays on your device. AI runs on your own model and API key.

## What's new

- **Stamps get short IDs** — every stamp carries a 7-character code like diary entries do, and existing records are filled in automatically
- **Keep refining after AI compose** — ask for changes in plain words and get a whole new draft each round; hand edits are carried along
- **AI polish is a conversation too** — keep asking for tweaks until it reads right, then apply it to the diary
- **Steadier Android updates** — Gitee and GitHub are each tried once, so the download no longer hangs on GitHub in China
- **Clear cache in Settings** — one tap removes temporary files and downloaded installers; diary, stamps, health, finance and AI settings stay untouched

## Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.2.8-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.2.8.apk` (~16 MB, release-signed) |

Android is a sideload build — allow installs from unknown sources. If you had an earlier debug build installed, uninstall it first: this one uses the release key and will not upgrade over it. Storage follows the platform: SQLite on desktop, IndexedDB in the browser and WebView.

## Known limits

0.2.8 is an early build. Finance and Calendar are still placeholders in the app, and the data format may change between releases — export a backup before upgrading.

MIT licensed. Primary repository: https://gitee.com/Mr_brainleech/starburst_recorder
