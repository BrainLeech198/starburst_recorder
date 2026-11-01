A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **A training section is here**: log strength, cardio, mobility and ball sports, browse an exercise library by muscle group, set a weekly plan with reminders, and copy your last session; the health home shows this week’s sessions and volume
- **Finance is now complete**: attach a receipt photo, keep time to the second, and turn one sentence into an entry with AI. Export or import a single entry, recover deleted ones from a trash page, and resolve conflicts one by one when merging a backup instead of silently overwriting
- **The assistant can handle training**: read stats, log a session, edit or delete one; recording food can also add a meal expense in the same step
- **Food photos no longer trigger repeated questions**: AI estimates calories and macros directly, and decides whether to save a food or a meal
- Everything from the previous release still applies: multiple conversations, image and text attachments, suggested questions, the deep-thinking switch, the two Finance charts, and Android health import (experimental)

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.10.0-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.10.0.apk` (~21 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.10.0 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
