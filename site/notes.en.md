A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Every answer is actionable now**: copy it, regenerate it, or delete from that message onward. Regenerating keeps the old answer — flip back with "Version 1/2" and compare.
- **Edit one line, branch from there**: editing a sent message saves it into a new branch while the original chat stays untouched; branches in the same group switch straight from the chat list.
- **Multi-select and export**: select or select-all messages, then copy, export or delete in bulk. Export as Markdown, TXT, JSON or a long image, with optional tool traces and action cards; desktop saves straight to Downloads and Android opens the system picker.
- **Answers render Markdown**: headings, lists, code blocks, quotes, tables and links all display properly. No innerHTML, and links are limited to http(s) and mailto.
- **Stop, steer, queue**: stop generation at any time without leaving a half-written answer; a requirement added mid-reply is carried into the next step; messages sent while it is working queue up and go one by one.
- **Plan mode**: the assistant first gives a 2–5 step plan, without acting or showing confirmation cards; turn plan mode off after confirming and it executes. The switch travels with your preferences in backups.
- **@ references**: reference today / yesterday / the last 7 days, or a diary entry, note, transaction, food item or meal template, so the request is precise.
- **/ shortcuts**: type / to bring up common questions and fill them straight into the input.
- **Undo this turn's writes**: completed actions from one reply can be rolled back in one tap, and anything that failed is called out.
- **The date bar no longer truncates dates**: relative day and weekday step aside based on the actual width of that row; thresholds scale with text size so the date always stays whole.
- **Touch targets and alignment**: assistant card cancel / undo, options and message actions are now 44px tall; the schedule header buttons align right.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.13.0-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.13.0.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.13.0 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; AI chats now travel with the backup and get noticeably larger when they carry image attachments. Preferences are in the backup too — do not share a backup that contains your API key. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
