A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Announcements now live in the app** — a banner at the top plus a full list under Me → Announcements. Anything official shows up there. Urgent notices are marked in red; tap the title to expand the body.
- **Urgent notices keep reminding you** — something like "please delete the API keys you used before" needs you to actually act on it, so it stays visible until you deal with it rather than being swept away after one look.
- **Subscribe to the official channel by email** — enter an address under Settings and important notices land in your inbox. Unsubscribe any time; unsubscribing deletes the address from the server rather than just flagging it.
- **Send feedback to the author** — write a paragraph under Settings. Problems, ideas, anything that feels awkward to use. No sign-up, no ticket number.
- **All three platforms get it** — web, web installed to the home screen, Android, and the Windows build all use the same interface. **Web push only exists in the browser, so announcements travel a different route** — they do not depend on push, and Android and Windows users receive them too.
- **Share diary entries, notes, intakes and individual finance entries by QR** — save a code as an image, or scan one from an image on the home page; imports show a preview first.
- **Clear all data from Settings → Data** — includes records, assistant chats and preferences such as model/API keys, memories and skills; the confirmation lists the scope.
- **The assistant slash menu now selects skills** — type `/` to search enabled skills, choose one, then add the task.
- **Web exports are more reliable** — downloads start directly in the browser; unsupported image input gets a clear explanation.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.14.0-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.14.0.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.14.0 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; AI chats travel with the backup and get noticeably larger when they carry image attachments. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

**Important: backups exported before 0.13.1 keep your API key in plain text.** If you ever exported a backup and kept it in cloud storage, in email, or sent it to someone, go to your model provider's dashboard, delete (revoke) the API keys you had used, then enter fresh ones under Settings → AI. Since 0.13.1 an export can encrypt the `apiKey` with a passphrase, but **that only protects files exported from now on** — old exports do not become safe on their own.

**About the key in your backup**: since 0.13.1 an export can encrypt the `apiKey` with a passphrase, while your diary, weight and ledger data stay plain text. Locking an entire file behind a passphrase to protect one regenerable field would risk the irreplaceable data if the passphrase were lost. Leaving the passphrase empty keeps the old plain-text export.

**About web reminders**: for a reminder to reach you while the app is closed, some server has to know *when* to remind you. What gets uploaded is the reminder slot (time and category), **never the content** — the server does not know you plan to weigh in at 8:00, and never sees schedule titles, training items, or diary entries.

**About subscribing**: the address is used to send notices and nothing else. It is never shared with anyone else, and unsubscribing deletes it from the server.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
