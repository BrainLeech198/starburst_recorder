## 0.3.1 · 2026-10-29

### What's new

- **Ask AI before you log it** — while adding a food, pick the dish and grams and ask right away whether this portion works; AI sees this portion's macros, what you have eaten today and what is left. Once an item is in the intake list, it is no longer offered for questions
- **Window resets after the keyboard closes** — on Android the interface no longer stays pushed up after typing and dismissing the keyboard; the fix lives in the app shell and covers every input

### Downloads

- Windows 10/11: `starburst-recorder-0.3.1-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.3.1.apk` (~16 MB, release-signed)

## 0.3.0 · 2026-10-29

### What's new

- **The AI assistant can look things up** — besides chatting, it browses your diary, notes, finance and health records by date or keyword and tells you what it checked; the page and the floating bubble share one conversation UI
- **Health records get their own pages** — intake (`/health/intakes`), sleep (`/health/sleeps`) and weight (`/health/weights`) each have a detail page with the same day navigation as the journal; the three home cards keep a summary, a quick-add action and a View records link
- **Weight trend line** — the weigh-in card draws a line, switchable between 3 / 5 / 7 / 30 days; too few points shows a hint instead of a misleading line
- **Sleep bar** — midnight sits in the centre, the solid block is the night you actually slept and the pale block is your ideal schedule; ideal bedtime and wake time are set on the sleep page
- **Preset-library notes** — the intake, weight and sleep cards add a one-line comment from your preset library
- **Photos in the food library** — attach a square thumbnail (512 px long edge) to common foods, visible in the list and detail views and carried with backups
- **Weight in record export** — weight is now the fifth record kind you can tick; the weight and sleep pages also export a single record as JSON
- **Desktop updates install themselves** — after the download finishes the installer launches and the old app quits 1.2 seconds later, no manual double-click needed
- **Care mode text size fixed** — text size only applies while the master switch is on; turning it off restores the standard size and keeps your chosen level
- **Desktop SQLite profile completed** — ideal schedule, weigh-in history, reminder settings and food photos are now real columns, with automatic migration for existing databases

### Downloads

- Windows 10/11: `starburst-recorder-0.3.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.3.0.apk` (~16 MB, release-signed)

## 0.2.13 · 2026-10-29

### What's new

- **Care mode for elders** — a dedicated page under Me → Care with four text sizes (standard / large / extra large / huge = 100 / 115 / 130 / 150%) scaling the whole interface; larger tap targets, higher contrast and reduced motion; destructive actions need a second tap
- **Sleep log** — record bedtime, wake time, quality and notes on the Health page, with computed duration; soft delete with undo and a separate trash page; sleep is included in backups, imports, single-record export and AI drafting material
- **Weekly fasting weigh-in and derived TDEE** — the profile TDEE is now labelled Reference TDEE; set a weekly weigh-in day and reminder time in the weigh-in card, with an in-app banner plus a system notification (local notifications on Android); after logging weight, the intake bar gains a Derived TDEE line based on the last 14 days of real intake and weight change, hidden until there is enough data
- **Ask AI** — sitting right below Add intake: five preset questions plus free follow-ups, with today's intake, profile, all three calorie lines and the conversation history as context
- **Choose your download source** — pick Gitee or GitHub on the Version page; the chosen one is tried first and falls back to the other
- **Sleep in single-record export** — tick Sleep together with diary, notes, intake and finance in one file

### Downloads

- Windows 10/11: `starburst-recorder-0.2.13-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.13.apk` (~16 MB, release-signed)

## 0.2.12 · 2026-10-28

### What's new

- **Intake list buttons unified** — Batch and Trash are now small solid buttons matching the rest of the app
- **Android batch fixed** — Back now exits batch mode instead of leaving the page; changing the date exits batch mode so you can't delete records you can't see; tapping the selection circle works
- **Dialogs stay on screen** — panel height accounts for the notch and gesture bar, and long content scrolls inside; the viewport shrinks with the keyboard so inputs aren't pushed away
- **Desktop windows fit the screen** — size presets and restored positions are clamped to the current work area

### Downloads

- Windows 10/11: `starburst-recorder-0.2.12-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.12.apk` (~16 MB, release-signed)

## 0.2.11 · 2026-10-28

### What's new

- **Nine interface languages** — Simplified and Traditional Chinese, English, Japanese, Korean, German, French, Russian and Spanish, switchable under Me → Settings → Language; the change applies immediately and is remembered
- **Every string goes through the language keys** — AI errors, weather lookups, export titles and file names, backup file names and the window title all follow the current language
- **Fixed the meal review dialog** — after storing a new food and logging it, the item disappears from the pending list instead of staying marked as unhandled
- **Dialogs stay on screen** — long content scrolls inside the panel, and an error message that makes the panel grow no longer pushes it off the top
- **Export a single record** — diary slips, the stamp timeline and health intakes each have their own JSON export for one record; the batch export window now pages by category, one kind at a time
- **Health targets follow the profile** — today uses your current body profile, while past days keep the profile from the first intake of that day, so later weight edits cannot rewrite history

### Downloads

- Windows 10/11: `starburst-recorder-0.2.11-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.11.apk` (~16 MB, release-signed)

## 0.2.10 · 2026-10-26

### What's new

- **Export only the records you pick** — mix diary entries, quick notes, health intake and finance records in one file for AI or someone else, without exporting the whole library
- **Three formats** — Markdown grouped by date and type, clean plain text, or JSON with every field kept
- **Two entry points** — Data & backup in Settings, and the batch bar in the intake list

### Downloads

- Windows 10/11: `starburst-recorder-0.2.10-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.10.apk` (~16 MB, release-signed)

## 0.2.9 · 2026-10-26

### What's new

- **Home sits in the middle again** — the mark and title no longer hug the top edge on phones, and the whole block is centred in the viewport
- **Long dialogs stay on screen** — content scrolls inside the panel, so buttons and fields are always reachable
- **Top-bar menus stay on screen** — on narrow phones the Insert / File / Tools menus open against the nearest edge instead of off the left side

### Downloads

- Windows 10/11: `starburst-recorder-0.2.9-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.9.apk` (~16 MB, release-signed)

## 0.2.8 · 2026-10-26

### What's new

- **Stamps get short IDs** — every stamp carries a 7-character code like diary entries do, and existing records are filled in automatically
- **Keep refining after AI compose** — ask for changes in plain words and get a whole new draft each round; hand edits are carried along
- **AI polish is a conversation too** — keep asking for tweaks until it reads right, then apply it to the diary
- **Steadier Android updates** — Gitee and GitHub are each tried once, so the download no longer hangs on GitHub in China
- **Clear cache in Settings** — one tap removes temporary files and downloaded installers; diary, stamps, health, finance and AI settings stay untouched

### Downloads

- Windows 10/11: `starburst-recorder-0.2.8-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.8.apk` (~16 MB, release-signed)

## 0.2.7 · 2026-10-26

### What's new

- **Downloads show real progress** — tapping download opens a progress panel with bytes received and total size; it can't be dismissed by accident, and the system installer opens when it finishes
- **Three new themes** — Forest, Tide and Blossom join the existing six for 9 palettes in total, each with a slow-drifting ambient glow
- **A livelier interface** — pages, modals and toasts enter with short motions; nav icons lift on hover and glow on the current page; buttons press in
- **Theme changes no longer snap** — background, text and borders ease into the new palette together
- **The intake list collapses fully** — the health page shows just the heading, count and "Show all N" until you open it, leaving the first screen for what comes next

### Downloads

- Windows 10/11: `starburst-recorder-0.2.7-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.7.apk` (~16 MB, release-signed)

## 0.2.6 · 2026-10-26

### What's new

- **AI compose picks its own material** — toggle stamps, health intake and finances; if nothing is picked it says so instead of calling the model
- **It also reads back** — the last 14 days by default, or two days, today only or a custom range; a reversed range is blocked; older records only echo, never pass as today
- **Export has range and content controls** — selection, one day or a custom span, with diary and stamps toggled separately, weather and timestamps optional; JSON remains a full backup
- **The health page breathes** — the intake list starts collapsed to leave room for upcoming cards
- **Fixed in-app updates** — Android reports success only after the download finishes, failures are explicit, and the progress bar no longer vanishes early
- **Dates survive narrow screens** — the diary and health headers show the full date and wrap the actions below; timestamps carry the year
- **The site's "What's new" panel is readable again** — text no longer blends into the dark background

### Downloads

- Windows 10/11: `starburst-recorder-0.2.6-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.6.apk` (~16 MB, release-signed)

## 0.2.5 · 2026-10-26

### What's new

- **Hardened the data format** — row-level validation keeps broken records out, and impossible dates no longer slip into the database
- **Backups carry version numbers** — file version and data version are both recorded, so future upgrades won't strand old records
- **Fixed empty weather values** — days without weather survive an export/import round trip without sprouting blank strings

### Downloads

- Windows 10/11: `starburst-recorder-0.2.5-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.5.apk` (~16 MB, release-signed)

## 0.2.4 · 2026-10-26

### What's new

- **Every record shows timestamps** — "Created …", plus "Edited …" only when it really was, kept out of the way

### Downloads

- Windows 10/11: `starburst-recorder-0.2.4-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.4.apk` (~16 MB, release-signed)

## 0.2.3 · 2026-10-26

### What's new

- **Six theme modes** — Deep space / Dusk / Night / Clear day / Paper / Mist, each pairing with six accent colours
- **AI compose respects moments** — a quick note's time stays bound to its event; the AI no longer splits, merges or reorders
- **Download progress bar** — in-app upgrades show how much has arrived
- **Fixed the Android backup export crash** — backups are written in chunks, so large ones can't overwhelm the app
- Unified buttons, empty states and checkboxes; keyboard focus rings added

### Downloads

- Windows 10/11: `starburst-recorder-0.2.3-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.3.apk` (~16 MB, release-signed)

## 0.2.2 · 2026-10-25

### What's new

- **Preset library moved to the top-right** — open it any time from diary or quick notes; quick notes can insert presets now
- Fixed the preset library's doubled back arrow

### Downloads

- Windows 10/11: `starburst-recorder-0.2.2-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.2.apk` (~16 MB, release-signed)

## 0.2.1 · 2026-10-25

### What's new

- **Food library polished** — sorted by name, row actions tucked into a menu, tap a row for a read-only detail
- **Smarter one-line intake logging** — checked against your food library first, with unmatched items decided one by one
- Website gains a previous-versions entry

### Downloads

- Windows 10/11: `starburst-recorder-0.2.1-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.1.apk` (~16 MB, release-signed)

## 0.2.0 · 2026-10-25

### What's new

- **Version page** — check for updates and open the website from Me → Version
- **In-app updates** — a quiet check on startup, then download and launch the installer without leaving the app
- Chinese UI now reads Chinese release notes; Windows installer slimmed to ~95 MB

### Downloads

- Windows 10/11: `starburst-recorder-0.2.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.2.0.apk` (~16 MB, release-signed)

## 0.1.0 · 2026-10-25

### What's new

- **First release** — one slip per day for diary, quick notes on a timeline, read-only paper view, trash and batch actions
- **AI compose** — three tones, nothing written until you confirm; works with any OpenAI-compatible endpoint, including a local model
- **Image import** — photograph a handwritten page and let a vision model read it into the editor
- **Weather** — one lookup per day via Open-Meteo, applied only when you accept it
- **Health** — body profile, TDEE, food library and meals, daily calorie and protein progress
- **Backup** — export Markdown, plain text or full JSON; import merges and walks you through conflicts
- Bilingual UI (Chinese/English), light and dark themes

### Downloads

- Windows 10/11: `starburst-recorder-0.1.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.1.0.apk` (~16 MB, release-signed)
