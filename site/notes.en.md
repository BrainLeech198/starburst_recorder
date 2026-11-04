A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## 0.15.1 · 2026-11-04

### What's new

- **Acknowledge announcements** — tap “Acknowledge receipt” and this device remembers the notice, so it no longer pops up on later launches.
- **Closing only postpones it** — closing, pressing Esc or tapping the backdrop does not acknowledge the notice; it will appear again on the next launch, with urgent notices still shown first.
- **Receipt stays on this device** — acknowledgements are stored locally, not uploaded or included in backups. An unacknowledged notice appears again on another device.

**Urgent security notice:** Backups exported before 0.13.1 may contain model names and API keys in plain text. If you shared an old backup or stored it in cloud storage or email, revoke the old API keys in your model provider's dashboard and generate fresh ones. Updating the app does not change files you already exported.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.15.1-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.15.1.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.15.1 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; AI chats travel with the backup and get noticeably larger when they carry image attachments. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

**Important: backups exported before 0.13.1 may contain model names and API keys in plain text.** If an old backup was kept in cloud storage or email, or sent to someone, revoke every API key it may contain in your model provider's dashboard, generate fresh keys, and enter them under Settings → AI. Since 0.13.1 an export can encrypt the `apiKey` with a passphrase, but **that only protects files exported from now on** — old exports do not become safe on their own.

**About the key in your backup**: since 0.13.1 an export can encrypt the `apiKey` with a passphrase, while your diary, weight and ledger data stay plain text. Locking an entire file behind a passphrase to protect one regenerable field would risk the irreplaceable data if the passphrase were lost. Leaving the passphrase empty keeps the old plain-text export.

**About web reminders**: for a reminder to reach you while the app is closed, some server has to know *when* to remind you. What gets uploaded is the reminder slot (time and category), **never the content** — the server does not know you plan to weigh in at 8:00, and never sees schedule titles, training items, or diary entries.

**About subscribing**: email delivery is not enabled, so no subscription emails are sent. If enabled, Cloudflare will store the address and the email provider will process it for announcement mail; unsubscribing deletes the subscription record from the server.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
