Local-first journal with AI built in: jot a line about today and AI reshapes it into a finished entry. No account, no cloud — every record stays on your device. AI runs on your own model and API key.

## What's inside

- **Care mode for elders** — under Me → Care: four text sizes (standard / large / extra large / huge) scale the whole interface, plus larger tap targets, higher contrast and reduced motion; destructive actions need a second tap
- **Sleep log** — record bedtime, wake time and quality on the Health page; duration is computed for you; deletions can be undone and there is a separate trash; sleep travels with backups, imports and single-record export
- **Weekly fasting weigh-in and derived TDEE** — the profile TDEE is now labelled Reference TDEE; set a weekly weigh-in day and reminder time, get a notification when it is time; after logging weight, a Derived TDEE line appears on the intake bar based on your real intake and weight, and stays hidden until there is enough data
- **Ask AI** — right below Add intake: five preset questions, then keep asking; the AI reads today's intake, your profile and all three calorie lines
- **Choose your download source** — pick Gitee or GitHub on the Version page; the chosen one is tried first and falls back to the other

## Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.2.13-setup.exe` (~95 MB) |
| Android 10+ | `starburst-recorder-0.2.13.apk` (~16 MB, release-signed) |

Android is a sideload build — allow installs from unknown sources. If you had an earlier debug build installed, uninstall it first: this one uses the release key and will not upgrade over it. Storage follows the platform: SQLite on desktop, IndexedDB in the browser and WebView.

## Known limits

0.2.13 is an early build. Finance and Calendar are still placeholders in the app, and the data format may change between releases — export a backup before upgrading.

MIT licensed. Primary repository: https://gitee.com/Mr_brainleech/starburst_recorder
