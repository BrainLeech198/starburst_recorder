A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **The assistant panel has a new layout**: a round primary button starts a chat, suggested questions fold into one narrow expandable strip, and deep thinking is a real switch — no more a whole screen of identical pale buttons
- **“Let AI suggest what to say next” reads your actual situation**: today's intake, last night's sleep, the past week's income and spending, and your profile — then offers three lines you can tap, instead of a generic template
- **Chats now read like a proper list**: every row shows its message count and last-used time, the active one is marked in the accent colour, and you can rename a chat; deleting takes two steps
- **Suggestions still start collapsed**: if you never expand them, no extra tokens are spent
- Everything from the previous release still applies: multiple conversations, image and text attachments, the working indicator, context and token usage, tighter lookups, the two Finance charts, and Android health import (experimental)

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.9.1-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.9.1.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.9.1 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
