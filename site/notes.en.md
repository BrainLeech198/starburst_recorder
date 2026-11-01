A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **The share QR code now appears**: opening a share used to leave an empty QR area forever, because the compressed payload was written without anyone reading the output and the write deadlocked; the reader is now attached first, so the QR code renders and Copy share code works. Decoding incoming shares was fixed the same way
- **Every food and meal row has a share button**: sharing used to be buried in the row's "⋯" menu; each row now shows a share icon that opens the QR dialog directly
- **The batch action bar no longer disappears**: the floating bar is now attached to the page root, so it cannot be trapped by the content area's stacking context or hidden behind the Android bottom navigation. This applies to diary, notes, trash, food library and every other batch page
- **The sleep bar spans 24 hours on each side**: sleep from the previous morning to the next evening now draws in full, naps during the day are no longer clipped, and midnight stays in the middle
- **Secondary buttons gained icons**: emoji on the version page became the shared icon set, and the batch bar's select all / invert / done, the row menu's edit / copy / share / merge / delete, plus save, log and import/export actions across health, training, settings and finance now carry matching icons
- The update-installer reuse, elder-care high-contrast fix and food / meal QR sharing from earlier releases are unchanged

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.10.4-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.10.4.apk` (~61 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.10.4 is an early build. Calendar is still a placeholder, and the data format may change between versions — export a backup of anything you care about before upgrading. Assistant conversations and memories stay on this device and are not part of backups. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
