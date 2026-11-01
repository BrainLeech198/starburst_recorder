## 0.10.3 · 2026-11-01

### What's new

- **Update installers are no longer downloaded twice**: after a download, if you close the installer by accident, tapping update again now looks for a complete installer on disk and opens it directly — on desktop and Android alike
- Downloads are written to a temporary file and renamed only when finished, so an interrupted download cannot pass as a complete installer
- The elder-care high-contrast fix and food / meal QR sharing from the previous release are unchanged

### Downloads

- Windows 10/11: `starburst-recorder-0.10.3-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.10.3.apk` (~61 MB, release-signed)

## 0.10.2 · 2026-11-01

### What's new

- **Elder-care high contrast is fixed**: it used to work only in the default dark theme, and did nothing after switching to light, paper, mist or any other explicit palette; secondary text and dividers now get stronger in every theme
- The food and meal QR sharing from the previous release is unchanged

### Downloads

- Windows 10/11: `starburst-recorder-0.10.2-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.10.2.apk` (~61 MB, release-signed)

## 0.10.1 · 2026-11-01

### What's new

- **Share foods and meals**: the row menu in the food library gains Share, showing a QR code the other person can scan; photos do not fit in a QR code, so the full configuration can be copied as a share code or saved as a `.starburst-share` file, and the receiver imports it with photos intact
- **A "receive a share" entry**: the top-right corner of the food library scans or pastes a share code and previews what is inside before importing; foods with the same name are reused and duplicate meal names get a suffix
- **The share format is extensible**: documents carry a `kind` field, so later share types such as diary presets or training plans only need one adapter
- **Action buttons carry icons**: New, Import, Export, Delete, Edit, Scan and Share each have a matching icon

### Downloads

- Windows 10/11: `starburst-recorder-0.10.1-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.10.1.apk` (~61 MB, release-signed)

## 0.10.0 · 2026-11-01

### What's new

- **Training**: log strength, cardio, mobility and ball sports, with an exercise library grouped by muscle; copy your last session, set a weekly plan with reminders, and see today's volume and this week's progress on the health home; the training page has a trash bin plus single-entry export and record-level import
- **The assistant can manage training**: four new tools to read stats, log a session, edit and delete — one sentence is enough
- **Finance is complete**: attach a receipt photo, keep time to the second, turn one sentence into an entry with AI, and add a meal expense while logging food; export a single entry as JSON, import at record level, or pick entries for this month; a new trash page; finance conflicts are listed one by one when merging a backup instead of silently overwriting
- **Food-photo estimates are fixed**: calories, protein, carbs and fat all get values instead of calories only; AI estimates directly without repeated questions and decides whether to save a food or a meal
- **Training reminders on the health home**: both the plan reminder and the inactivity nudge are checked there, without opening the training page first
- Everything from the previous release still applies: multiple conversations, image and text attachments, suggested questions, the deep-thinking switch, the two Finance charts, and Android health import (experimental)

### Download

- Windows 10/11: `starburst-recorder-0.10.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.10.0.apk` (~21 MB, release-signed)

## 0.9.1 · 2026-11-01

### What's new

- **A new layout for the assistant panel**: starting a chat is a round accent button, the chat list is plain text with a count badge, suggested questions fold into one full-width strip, deep thinking is a switch with a knob, and attachments are icon buttons — no more a screen full of identical pale pills
- **Suggestions are built from your actual situation**: expanding “Let AI suggest what to say next” sends today's intake and protein, last night's sleep and quality, the past seven days of entries, notes and money, plus your profile and latest weigh-in; the prompt forbids inventing numbers that are not there
- **Chats are easier to manage**: rename any chat (leave it empty to go back to the automatic title), see the message count and last-used time per row, and delete in two steps so a stray tap cannot lose a conversation; the dialog header keeps a single close button
- **Retry is now underlined text** instead of a button lookalike, and the memory and skills links collapsed into a quiet “text · text” row

## 0.9.0 · 2026-11-01

### What's new

- **Multiple conversations**: start, switch and delete chats, each with its own context; the old single thread migrates into the first one
- **Image and text attachments**: up to 3 per message; images are scaled to 1280 px and text files keep their first 6000 characters
- **Suggested follow-ups**: three tappable questions picked from the last answer, with no extra tokens spent
- **Working indicator**: “Processing · N sec” and “Looking up {tool}”, plus how many lookups ran and how long they took
- **Context and tokens**: real usage from the provider, a context percentage, this turn's tokens and how many messages were compacted
- **Tighter lookups**: six rounds per turn, ten real lookups at most, cached repeats, and prompts that ask for one complete query
- **Two charts in Finance**: this month's spending by category and a half-year trend
- **Health import on Android (experimental)**: read-only weight and sleep from Health Connect, skipping days already logged
- **Copy fixes**: the floating ball description now says it is always shown, and stale “assistant not connected” text is gone

### Download

- Windows 10/11: `starburst-recorder-0.9.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.9.0.apk` (~16 MB, release-signed)

## 0.8.1 · 2026-11-01

### What's new

- **Daytime naps**: log several naps per day with their own start and end times; naps stay out of the nightly total and show up separately on the sleep page
- **The assistant can edit and delete**: change diary entries, notes and finance records, and delete finance, notes, intakes and sleep entries. Deletions always ask first, go to the recycle bin and can be undone
- **Three edit permissions**: read only, ask before changing, or change directly; additions and edits save at once under "change directly", while deletions still need confirmation
- **A Claude Code-style conversation**: every lookup, its result summary and the elapsed time can be expanded, keeping process and answer apart
- **Skills and multiple choice**: the assistant can ask you a multiple-choice question; skills published on the site can be installed from settings, and the site has a skill download page
- **Deep thinking switch**: available in settings and above the chat input; providers that support reasoning flags get them

### Download

- Windows 10/11: `starburst-recorder-0.8.1-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.8.1.apk` (~16 MB, release-signed)

## 0.8.0 · 2026-11-01

### What's new

- **The assistant can act**: log spending, write a note or diary entry, record sleep, weigh in or log food; every write is previewed, applied only after confirmation, and can be undone
- **Long-term memory and saved conversations**: maintain preferences, goals, habits and facts under Assistant → Memory; the floating ball and the full page share one thread
- **Finance is ready**: log income and spending, pick categories, edit or delete, see daily totals and a monthly balance; the month bar shows this/last month and a date range
- **One date bar everywhere**: diary, health and finance share the same rounded date control
- **Stable and beta channels**: switch under Settings → Version; betas ship on GitHub only

### Download

- Windows 10/11: `starburst-recorder-0.8.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.8.0.apk` (~16 MB, release-signed)

## 0.7.0 · 2026-10-31

### What's new

- **The weight trend gets its own page**: open it from the chart on the health home, switch between 7 / 30 / 90 days, and tap a point or a record to inspect a day
- **More health metrics**: average intake, average sleep, protein-goal days and estimated TDEE for the range; the selected day adds energy gap, protein progress, the difference from ideal sleep and BMI
- **Two ways to edit an intake**: choose "Edit this entry only" or "Edit and update food library"; the latter converts the edited values back to per 100 g
- **Meal thumbnails**: the meal form shows a cover and component thumbnails; the selected list in "Log an intake" now sits on its own layer, clearly apart from the entries above
- **Unified buttons**: "Add a food" and "From one sentence" now match Confirm as solid primary buttons

### Download

- Windows 10/11: `starburst-recorder-0.7.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.7.0.apk` (~16 MB, release-signed)

## 0.6.3 · 2026-10-31

### What's new

- **Meals open a detail view**: components, grams, total calories and protein, plus any deleted components are listed
- **Meals can be duplicated**: copy one from the menu with the same components and grams, and the name gets a copy suffix
- **Meals now match single foods**: detail, edit, copy and delete all live in the same row menu

### Download

- Windows 10/11: `starburst-recorder-0.6.3-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.6.3.apk` (~16 MB, release-signed)

## 0.6.2 · 2026-10-31

### What's new

- **Intake entries can be edited again**: tap ✎ in the list or edit from the detail view; regular foods let you change name, time, portion and nutrition, while meals recalculate proportionally from component grams
- **Day switching now has motion**: the five date pages slide in by direction; elder-care reduced motion or the system setting turns it off
- **Easier back navigation**: the back buttons on the intake, sleep and weight pages moved to the left; the finance data foundation is in place, with the monthly ledger UI coming next

### Download

- Windows 10/11: `starburst-recorder-0.6.2-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.6.2.apk` (~16 MB, release-signed)

## 0.6.1 · 2026-10-31

### What's new

- **Swipe anywhere to change the day**: diary, health home, intake, weight and sleep pages all switch with a left or right swipe; inputs and horizontally scrollable areas are left alone
- **Night wakes carry exact times**: log each wake with a time and minutes awake, and the count and total awake time add up automatically; older records keep showing their count and minutes until you add times
- **The new field travels with backups**: wake times are exported, imported and compared for conflicts, and older backups still load

### Download

- Windows 10/11: `starburst-recorder-0.6.1-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.6.1.apk` (~16 MB, release-signed)

## 0.6.0 · 2026-10-31

### What's new

- **Draw your own illustrations in diaries and notes**: the image source adds "Draw it yourself", with pen, eraser, colour, brush size, undo and clear; the drawing is inserted as an image
- **Food library entries can be picked for export and import**: record export gains a food category that mixes with diary, notes and health records in one file; import reads the same file with photos carried in JSON (readable formats note that photos are JSON-only)
- **Lighter food-photo processing**: the decoded original bitmap is released and the canvas recycled right after compression, so saving on low-memory phones is less likely to be killed

### Download

- Windows 10/11: `starburst-recorder-0.6.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.6.0.apk` (~16 MB, release-signed)

## 0.5.2 · 2026-10-31

### What's new

- **Sticky header**: the date bar and entry points stay pinned on diary, health, and the intake / weight / sleep sub-pages as lists scroll
- **Sleep tracks night waking**: record how many times you woke and the total minutes awake, shown right on the sleep card and detail
- **Health is easier to use**: food thumbnails in the intake list, a permanent food-library entry on the intake page, a fixed mobile layout for the weight card, and a bold red back button on sub-pages
- **Safer import/export**: merge import now compares weigh-ins, ideal sleep schedule and weigh-in setting, so these profile differences are no longer silently overwritten

### Download

- Windows 10/11: `starburst-recorder-0.5.2-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.5.2.apk` (~16 MB, release-signed)

## 0.5.1 · 2026-10-30

### What's new

- **Fixed importing backups on Windows desktop**: entries and notes with photos no longer fail on replace-import, and importing only notes no longer writes their photos wrong
- **Merge import now flags photo differences**: same text but different photos counts as a conflict, with both photo counts shown — a backup can no longer silently overwrite your local photos

### Download

- Windows 10/11: `starburst-recorder-0.5.1-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.5.1.apk` (~16 MB, release-signed)

## 0.5.0 · 2026-10-30

### What's new

- **Food photos while logging intake**: photos from the food library now show up in the picker of "Log intake"; tap a thumbnail to view it full screen and swipe through the batch, with thumbnails also in the portion and meal-component steps
- **A clearer word on health numbers**: TDEE, estimated TDEE and every food's calories are estimates — the health page explains this once on first visit, and a small note stays beside the intake card, weigh-in card, body profile and AI answers; tap it for the full explanation. Your real metabolism is a matter for a check-up and your doctor
- **The three health sub-pages now match the diary / notes toolbar**: intake, sleep and weight actions are equal-width filled buttons in two columns; when the count is odd the trash link spans the full row, so narrow phones no longer show ragged rows with an empty slot

### Download

- Windows 10/11: `starburst-recorder-0.5.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.5.0.apk` (~16 MB, release-signed)

## 0.4.0 · 2026-10-30

### What's new

- **Photos in notes and diaries**: stamps can be photo-only (camera or gallery), up to 9 per entry; diary body embeds images with markers and renders mixed text and images; images are compressed and stored inline, and travel with backups
- **Slimmer health home**: the three cards are now metric cards; the ideal sleep schedule moved into the sleep card (a minimal profile is created automatically if you don't have one)
- **Record-level import for sleep / weights**: import single-record JSON files (same-day entries are overwritten), plus cross-day batch delete and export; the Data & Backup import recognizes these files too
- **Cleaner exports**: Markdown / plain-text export and AI polish automatically strip image markers
- **Dialogs no longer cut off on phones**: every dialog, the image viewer and the assistant sheet now render at the top layer, so the bottom navigation can't cover them and panels are never half-visible

### Download

- Windows 10/11: `starburst-recorder-0.4.0-setup.exe` (~95 MB)
- Android 10+: `starburst-recorder-0.4.0.apk` (~16 MB, release-signed)

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
