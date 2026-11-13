A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## 0.19.0 · 2026-11-13

Adds waist measurements and trends, AI health report previews, and improvements to training navigation and meal intake records.

## 0.18.2 · 2026-11-13

Manual update checks now refresh release information and replace stale results.

### What's new

- **Update checks refresh their result** — even after startup found an update, a manual check requests the release source again; if no update exists, the stale prompt is cleared.

### Downloads

- Windows 10/11: [`starburst-recorder-0.18.2-setup.exe`](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.18.2/starburst-recorder-0.18.2-setup.exe) (~96 MB) · [GitHub fallback](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.2/starburst-recorder-0.18.2-setup.exe)
- Android 10+: [`starburst-recorder-0.18.2.apk`](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.18.2/starburst-recorder-0.18.2.apk) (~62 MB, release-signed) · [GitHub fallback](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.2/starburst-recorder-0.18.2.apk)

## 0.18.1 · 2026-11-13

Intake progress segments now use macro grams; empty photo thumbnails are hidden.

### What's new

- **Intake progress uses gram shares** — the full bar still represents calories, while its colors show the gram proportions of protein, carbs, and fat.
- **No empty photo thumbnails** — food and meal rows no longer reserve blank image space when no photo is available.

### Downloads

- Windows 10/11: [`starburst-recorder-0.18.1-setup.exe`](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.1/starburst-recorder-0.18.1-setup.exe) (~96 MB)
- Android 10+: [`starburst-recorder-0.18.1.apk`](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.1/starburst-recorder-0.18.1.apk) (~62 MB, release-signed)

## 0.18.0 · 2026-11-13

Assistant runs continue across page and conversation switches, with changes to review; finance and health records are clearer too.

### What's new

- **Assistant runs are queued per conversation and continue when you switch pages** — up to 10 queued messages per conversation; action cards show before and after values and can be edited before execution. Runs do not resume after closing the app or refreshing the web app.
- **Long conversations fit the model context window better** — older messages are trimmed first, keeping recent context.
- **Intake supports serving counts** — enter portions for foods with a saved serving size; linked expenses multiply the unit price by portions. Macro charts use each nutrient's share of macro energy.
- **Sleep timelines align overnight sleep with the wake date** — colors provide a visual cue based on personal targets and recorded metrics.
- **Finance trends are easier to compare** — shorter date labels, compressed scale for extreme values, and a separately scrollable entry form on small screens.

### Downloads

- Windows 10/11: [`starburst-recorder-0.18.0-setup.exe`](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0-setup.exe) (~96 MB) · [GitHub fallback](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0-setup.exe)
- Android 10+: [`starburst-recorder-0.18.0.apk`](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0.apk) (~62 MB, release-signed) · [GitHub fallback](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0.apk)

## 0.17.4 · 2026-11-11

### What's new

- **Calendar AI reviews cover complete months and years** — fixes end-of-period comparisons and uses days with intake records for annual average calories.
- **AI models are a separate backup section** — choose model settings independently for export or restore; older backups migrate automatically, and passphrases are requested only for selected model sections containing keys.
- **Weekly and monthly finance trends use two line series** — compare income and expenses on the same timeline.
- **The website now opens the web app directly and adds mobile navigation** — the download entry remains on the home screen.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.17.4-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.17.4.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.17.4 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; AI chats travel with the backup and get noticeably larger when they carry image attachments. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

**Important: backups exported before 0.13.1 may contain model names and API keys in plain text.** If an old backup was kept in cloud storage or email, or sent to someone, revoke every API key it may contain in your model provider's dashboard, generate fresh keys, and enter them under Settings → AI. Since 0.13.1 an export can encrypt the `apiKey` with a passphrase, but **that only protects files exported from now on** — old exports do not become safe on their own.

**About web reminders**: for a reminder to reach you while the app is closed, some server has to know *when* to remind you. What gets uploaded is the reminder slot (time and category), **never the content** — the server does not know you plan to weigh in at 8:00, and never sees schedule titles, training items, or diary entries.

**About subscribing**: email delivery is not enabled, so no subscription emails are sent. If enabled, Cloudflare will store the address and the email provider will process it for announcement mail; unsubscribing deletes the subscription record from the server.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder

## 0.17.2 · 2026-11-11

### What's new

- **Neat thumbnails for records without photos** — finance entries, intake history, and food or meal lists now show matching illustrated placeholders when no photo is set. Real photos still load on demand and remain previewable.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.17.2-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.17.2.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## 0.17.1 · 2026-11-09

### What's new

- **Easier food browsing and intake picking** — the food library supports name search and tag filters; intake food and meal pickers sort by name or date added in either direction. Lists load in batches, with thumbnails fetched on demand.
- **Lighter diary, note and finance browsing** — date changes, archives, search and week/month reviews read summaries first; photos load only when shown or opened.
- **Fewer whole-library image reads** — AI reports, references, confirmed assistant actions, sleep batch lists and record imports read only the needed summaries or records. Explicit photo viewing and full backups still include the originals.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.17.1-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.17.1.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.
## 0.19.1 · 2026-11-13

Sleep charts now span 48 hours and reflect recorded sleep factors. Body measurements support multiple dimensions and trends. Training adds a dedicated progress area, weekly reviews, templates, user-set goals, and user-triggered AI feedback.
