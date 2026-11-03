A local-first personal recorder with built-in AI: jot down today and AI turns it into a full diary entry. No sign-up, no cloud — everything stays on your device. AI runs on your own model and key.

## What's new

- **Edit a card before you confirm it** — name, grams, calories, amount, weight, bedtime and wake time, and body text are all editable on the pending card. Numbers must be above 0 and required fields cannot be blank, so a mistyped figure no longer needs a write followed by a model-driven update round.
- **One batch, one round** — several foods from one meal, several transactions from one ledger entry, or several exercises from one session now all produce cards in the same round. The cap went from 3 to 8, so nothing is left over for you to remember.
- **Cards that fail now say why** — when a card cannot be built or is deferred past the cap, the reply states which one and why; the "N cards waiting for confirmation" line is counted by the interface itself instead of trusting the model's "your cards are ready".
- **A tighter floating assistant panel** — message actions are icons, plan mode and deep thinking share one row of chips, clear / export moved into "⋯", context usage collapsed to a thin line, and the panel can now grow to 88% of the screen instead of 75%. Focus is trapped inside the panel, a link that changes the page closes it, and dragging on the backdrop no longer scrolls the page behind.
- **The week view shares the calendar palette** — diary orange, health green, finance blue; each day card is tinted by how many records it holds, and count chips now carry a colour dot that matches the legend.
- **"That day's records" opens the day page** — the entries in the finance day view and the list both go to the one-day page, where diary, notes, intake, sleep, training, money and schedule line up in one timeline.

## Download

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.13.1-setup.exe` (~96 MB) |
| Android 10+ | `starburst-recorder-0.13.1.apk` (~62 MB, release-signed) |

Android is sideloaded: allow "install unknown apps". If you previously installed a debug build, uninstall it first (different signature — the upgrade install will fail).
Storage follows the platform: SQLite on desktop, IndexedDB in browsers and WebViews.

## Known limitations

0.13.1 is still an early build, and the data format may change between versions — export a backup of anything you care about before upgrading. Older backups still import; AI chats travel with the backup and get noticeably larger when they carry image attachments. Preferences are in the backup too — do not share a backup that contains your API key. Health Connect import on Android is experimental and not yet verified on a real device; tell us if it cannot read anything.

MIT licensed. Mirror: https://github.com/BrainLeech198/starburst_recorder
