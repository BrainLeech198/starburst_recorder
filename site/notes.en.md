A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **The assistant keeps several conversations**: no more one endless thread — start, switch and delete chats, each with its own context; the old single conversation becomes the first one
- **Images and files**: up to 3 attachments per message; pictures are compressed first, text files are read straight into the chat
- **Suggested follow-ups**: after each answer you get three tappable questions on the same topic
- **You always know it is working**: while it waits it shows “Processing · N sec” and which lookup is running
- **Context and tokens in sight**: above the input there is a context meter, this turn's tokens and “compacted N older messages”
- **Fewer lookups**: repeated lookups in the same answer reuse their result, each turn has a lookup cap, and it answers once it has enough
- **Two more charts in Finance**: this month's spending by category and a half-year income/expense trend
- **Import from your phone's health app on Android**: read-only weight and sleep from Health Connect; days you already logged are skipped

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.9.0-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.9.0.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.9.0 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
