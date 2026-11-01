A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **The assistant can act**: ask it to log spending, write a note or diary entry, record sleep, weigh in or log food. Every write is previewed first, applied only after you confirm, and can be undone right after
- **The assistant keeps long-term memories**: preferences, goals, habits and facts live on this device under Settings → Assistant → Memory and are carried into every conversation
- **Conversations are saved**: the floating ball and the full assistant page share one thread, so you can switch between them without losing context; the floating ball is shown by default again
- **Finance is ready**: log income and spending, pick categories, edit or delete, see daily totals and a monthly balance; the month bar adds this/last month markers and a date range
- **One date bar everywhere**: diary, health and finance now share the same rounded date control
- **Update channels**: switch between stable and beta under Settings → Version. Betas ship on GitHub only, so stable users never receive them

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.8.0-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.8.0.apk` (~16 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.8.0 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant memories and conversations stay on this device and are not part of backups.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
