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
