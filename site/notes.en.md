A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Foods and meals can be shared**: every row in the food library now has a Share action that shows a QR code the other person can scan; when the QR code cannot hold the photos and fine detail, copy the full share code or save a `.starburst-share` file instead — the receiver imports it exactly as it was, photos included
- **A "receive a share" entry**: the top-right corner of the food library opens the scanner or a paste box, shows what is inside before importing, reuses foods with the same name and numbers duplicate meal names, so nothing you already have gets overwritten
- **Action buttons now carry icons**: New, Import, Export, Delete, Edit, Scan and Share each have a small matching icon, so it is obvious at a glance which one to tap
- Everything from the previous release still applies: the training section, the finance trash page with per-entry conflict confirmation, multi-conversation assistant with attachments, and Android health import (experimental)

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.10.1-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.10.1.apk` (~21 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.10.1 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
