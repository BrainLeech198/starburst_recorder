/**
 * 官网文案。和 App 的 shared/i18n/messages 保持同样的习惯：
 * 一份 key 对应两种语言，切换时整页替换。
 * 只带纯文本；需要属性的地方由 app.js 单独处理。
 */
window.SITE_I18N = {
  zh: {
    'meta.title': '星芒记录者 · 把零散的日子，攒成看得见的自己',
    'meta.description':
      '星芒记录者是一个本地优先的个人记录工具：日记、随记、健康、训练、收支与日历都在一处，内置 AI 助手帮忙整理和动手。无账号、无云端，Windows 与 Android 同源。',

    'a11y.skip': '跳到正文',

    'app.name': '星芒记录者',
    'app.nameEn': 'Starburst Recorder',
    'app.tagline': '把零散的日子，攒成看得见的自己。',

    'nav.features': '功能',
    'nav.ai': 'AI',
    'nav.shots': '截图',
    'nav.download': '下载',
    'nav.skills': '技能',
    'nav.label': '站点导航',
    'nav.menu': '打开导航菜单',
    'nav.close': '关闭导航菜单',

    'skillsPage.title': '星芒技能库',
    'skillsPage.lead':
      '技能包决定助手怎么想、按什么步骤做事。下载后装进 App，助手遇到合适的任务就会照这套步骤来。',
    'skillsPage.howTitle': '怎么装进 App',
    'skillsPage.how':
      '打开 App → 设置 → 助手 → 技能，点「查看官网技能」，选一个就能装上；也可以下载 JSON 再点「从文件导入」。',
    'skillsPage.builtinTitle': '内置技能',
    'skillsPage.builtinNote':
      '头脑风暴、周复盘、睡眠教练、收支复盘、日记润色已经内置，不用下载。',
    'skillsPage.trust':
      '技能只是提示词层面的方法包，不会获得你的记录，也不会多出任何数据权限；装之前可以先打开 JSON 看一眼。',
    'skillsPage.download': '下载技能文件',
    'skillsPage.version': '版本',
    'skillsPage.author': '作者',
    'skillsPage.empty': '技能目录没读出来，刷新页面再试一次。',
    'skillsPage.back': '返回首页',
    'skillsPage.meta': '星芒记录者的助手技能库：下载 JSON 技能包，装进 App 就能用。',

    'hero.eyebrow': '本地优先 · 内置 AI',
    'hero.sub':
      '随手记下今天，AI 帮你整理成完整的日记；也可以直接问助手，让它查记录、记账、写随记或记睡眠。AI 用的是你自己填的模型和 Key；其余数据只留在这台设备上。Windows 和 Android 用的是同一份代码。',
    'hero.cta': '打开网页版',
    'hero.download': '下载电脑版 / Android',
    'hero.source': '看源码',
    'hero.meta.local': '数据在本地',
    'hero.meta.noAccount': '不用注册',
    'hero.meta.bilingual': '九种语言',
    'hero.meta.platform': 'Windows / Android',
    'hero.slip1': '早上把阳台的花搬进来，晚上沿河跑了三公里，回来煮了碗面。',
    'hero.slip2': '没什么大事，把拖了很久的报销单交了。',
    'hero.slipAi': 'AI 已整理',

    'features.kicker': '功能',
    'features.title': '一张纸上的生活',
    'features.desc':
      '日记、随记、健康、训练、收支与日历都在一处，AI 助手能聊天也能动手；日程、周视图和月度回顾也接上了。',
    'features.diary': '日记',
    'features.diaryDesc':
      '随手记一句、按天翻看，也能导入手写照片让 AI 认成文字；标签与搜索能把旧日子翻出来。',
    'features.notes': '随记',
    'features.notesDesc':
      '一句话先扔进来，不用挑日子；能打标签、能搜索，也能按天回看，之后再慢慢整理。',
    'features.health': '健康',
    'features.healthDesc':
      '饮食、睡眠、体重与 TDEE 都在一页：食物库算热量与蛋白，称重推算每日消耗，小憩也能单独记。',
    'features.training': '训练',
    'features.trainingDesc':
      '力量、有氧、拉伸、球类分开记，动作库按肌群找；能复制上次、按周排计划，到点提醒。',
    'features.finance': '财务',
    'features.financeDesc':
      '每笔收支可带票据照片，按日 / 月 / 年翻账；分类占比与半年趋势画成图，删掉的还能从回收站捞回来。',
    'features.calendar': '日历',
    'features.calendarDesc':
      '月历混出日记、健康与收支的深浅；点进一天就是时间轴，日程可重复、能提醒，还有周视图与月度回顾。',
    'features.assistant': 'AI 助手',
    'features.assistantDesc':
      '查记录、记账、写随记、记睡眠都能交给它，写入前先给预览；多段对话、附件、长期记忆与技能包都在。',
    'features.appearance': '外观',
    'features.appearanceDesc':
      '六套主题模式配六种主题色，深浅冷暖都能调到顺眼；连纸上那支笔的颜色也跟着走。',
    'features.ready': '已可用',
    'features.wip': '建设中',

    'ai.kicker': 'AI 助手',
    'ai.title': '随手记一句，剩下的交给 AI',
    'ai.desc':
      '那天发生了什么、当时是什么心情——你不用写得完整，AI 会按你选的口气重组，确认之后才写进去。也可以直接问助手，让它查记录、记账、写随记或记睡眠；写操作先给预览，确认后才落库。',
    'ai.before': '你写的',
    'ai.raw': '10.24 阴 早上去医院拿报告，医生说没事，回来的路上买了个红薯。',
    'ai.arrow': 'AI 整理',
    'ai.after': 'AI 写的',
    'ai.polished':
      '今天去医院拿体检报告。医生翻了两页，说各项都正常，让我别老熬夜。出来的时候天阴着，风有点凉，在路口买了个烤红薯，捧在手里一路暖到家。',
    'ai.stepsTitle': '用之前先准备一个模型',
    'ai.step1':
      '在「设置 → 助手 → AI」里填服务地址和 Key：OpenAI、DeepSeek、通义，或者本机跑的 Ollama 都行，只要兼容 OpenAI 接口',
    'ai.step2': '回到日记，选一条记录点「AI 整理」，挑一种口气',
    'ai.step3': '看一眼结果，确认之后才写进正文',
    'ai.assistantNote':
      '助手不止整理日记：可以按本周或本月记录先起一份周报 / 月报；多段对话各自保留上下文，一条消息最多带三个图片或文本附件；常用做法还能装成技能包。',
    'ai.keyNote':
      '应用不附带 AI 额度和 Key：模型与费用都在你自己的账号下，Key 只存在本机设置里。',

    'shots.kicker': '截图',
    'shots.title': '长这样',
    'shots.desc': '没有花哨的仪表盘，一天就是一张纸，翻过去就是前一天。',
    'shots.diary': '日记：按天翻，纸条上只留摘要',
    'shots.health': '健康：今天的摄入与蛋白进度',
    'shots.edit': '编辑页：写在稿纸上',
    'shots.diaryAlt': '日记页：一天一张纸条，顶部有日期与星期',
    'shots.healthAlt': '健康页：今日摄入进度条与蛋白进度',
    'shots.editAlt': '编辑页：正文写在稿纸一样的横线上',

    'privacy.kicker': '隐私',
    'privacy.title': '你的日子，不离开这台机器',
    'privacy.noAccount': '不用注册',
    'privacy.noAccountDesc': '打开就能写。没有账号，也就没有找回密码那套流程。',
    'privacy.noCloud': '没有云端',
    'privacy.noCloudDesc': '我们不做服务器，也没有任何一条记录会被上传到我们这里。',
    'privacy.export': '导出即备份',
    'privacy.exportDesc': '一次导出 Markdown、纯文本或完整 JSON；桌面上数据就是一个能复制的文件。',
    'privacy.aiTitle': 'AI 只连你指定的服务',
    'privacy.aiDesc':
      '只有你点「AI 整理」或向助手提问时，需要用到的那部分记录才会发给你自己配置的模型服务；其余记录不出本机。',

    'open.kicker': '开源',
    'open.title': '源码一直是公开的',
    'open.desc':
      '从第一版起就在公开仓库里迭代：React 19 + Vite 写界面，桌面用 Electron 包了一层，存储桌面走 SQLite、浏览器与安卓走 IndexedDB。',
    'open.version': '版本 0.18.2',

    'download.kicker': '下载',
    'download.title': '拿一份回去用',
    'download.desc': '0.18.2 仍是早期版本，升级前请先导出备份。0.13.1 之前的备份可能含明文模型名称和 API Key；若旧备份曾外传或存到云端、邮件，请撤销旧 Key 并重新生成。',
    'download.web': '网页版',
    'download.webMeta': '浏览器直接使用 · 支持安装为 PWA',
    'download.webDesc': '无需下载安装，打开即可使用；也可以添加到主屏幕，像应用一样启动。',
    'download.webCta': '打开网页版',
    'download.windows': 'Windows 安装包',
    'download.windowsMeta': 'Windows 10/11 · 约 96 MB',
    'download.windowsDesc': '双击安装，开始菜单里就是它。桌面端数据存成 SQLite，可以直接复制走。',
    'download.android': 'Android APK',
    'download.androidMeta': 'Android 10 以上 · 约 62 MB',
    'download.androidDesc': '侧载安装，需要允许「安装未知来源应用」。手机上是同一套界面，数据留在本机。',
    'download.note': '当前版安装包优先由 Gitee 提供大陆下载，GitHub 保留完整版本历史并作备用；历史版本请从 GitHub 下载。',

    'whatsnew.title': '这一版有什么',
    'whatsnew.item1': '手动检查更新会重新读取发布源',
    'whatsnew.item2': '刷新结果会替换启动时缓存的信息',
    'whatsnew.item3': '没有新版时清除过期提示',
    'whatsnew.more': '完整更新日志',
    'whatsnew.moreHref': 'changelog.html',
    'changelog.kicker': '更新日志',
    'changelog.title': '每一版改了什么',
    'changelog.back': '← 回到下载',
    'download.historyLink': '历史版本与更新日志，每版都附下载 →',

    'footer.version': '版本 0.18.2',
    'footer.tagline': '数据只存在你的设备上',
    'footer.admin': '管理员入口',
  },

  en: {
    'meta.title': 'Starburst Recorder · Turn scattered days into a self you can see',
    'meta.description':
      'Starburst Recorder is a local-first personal recorder: diary, quick notes, health, training, spending and calendar in one place, with an AI assistant that can compose and act. No account, no cloud, same codebase on Windows and Android.',

    'a11y.skip': 'Skip to content',

    'app.name': 'Starburst Recorder',
    'app.nameEn': '星芒记录者',
    'app.tagline': 'Turn scattered days into a self you can see.',

    'nav.features': 'Features',
    'nav.ai': 'AI',
    'nav.shots': 'Screenshots',
    'nav.download': 'Download',
    'nav.skills': 'Skills',
    'nav.label': 'Site navigation',
    'nav.menu': 'Open navigation menu',
    'nav.close': 'Close navigation menu',

    'skillsPage.title': 'Starburst Skills',
    'skillsPage.lead':
      'Skill packs decide how the assistant thinks and what steps it follows. Install one in the app and it will use those steps whenever a task fits.',
    'skillsPage.howTitle': 'How to install',
    'skillsPage.how':
      'Open the app → Settings → Assistant → Skills, tap “Browse site skills”, and install one. You can also download the JSON and use “Import from file”.',
    'skillsPage.builtinTitle': 'Built-in skills',
    'skillsPage.builtinNote':
      'Brainstorm, weekly review, sleep coach, spending review and diary polish are built in — no download needed.',
    'skillsPage.trust':
      'A skill is only a prompt-level method pack. It never gets your records and grants no extra data access; open the JSON first if you want to check.',
    'skillsPage.download': 'Download skill file',
    'skillsPage.version': 'Version',
    'skillsPage.author': 'Author',
    'skillsPage.empty': 'Could not load the skill catalog. Refresh the page and try again.',
    'skillsPage.back': 'Back to home',
    'skillsPage.meta':
      'Assistant skills for Starburst Recorder: download JSON skill packs and use them in the app.',

    'hero.eyebrow': 'Local-first · AI inside',
    'hero.sub':
      'Jot down today and let AI shape it into a finished entry — or just ask the assistant to look things up, log spending, write a note or record your sleep. AI runs on your own model and API key; everything else stays on this device. Windows and Android run the same code.',
    'hero.cta': 'Open web app',
    'hero.download': 'Download for Windows / Android',
    'hero.source': 'View source',
    'hero.meta.local': 'Data on your device',
    'hero.meta.noAccount': 'No sign-up',
    'hero.meta.bilingual': 'Nine languages',
    'hero.meta.platform': 'Windows / Android',
    'hero.slip1': 'Moved the balcony plants inside this morning, ran three kilometres by the river, came home and made noodles.',
    'hero.slip2': 'Nothing big today — finally filed that expense report.',
    'hero.slipAi': 'AI reshaped',

    'features.kicker': 'Features',
    'features.title': 'A life kept on paper slips',
    'features.desc':
      'Diary, quick notes, health, training, spending and calendar live in one place, with an assistant that can chat and act — plus schedules, a week view and monthly reviews.',
    'features.diary': 'Diary',
    'features.diaryDesc':
      'Jot a line, flip back by day, or import handwritten pages and let AI read them; tags and search bring old days back.',
    'features.notes': 'Quick notes',
    'features.notesDesc':
      'Drop a line in first, no date-picking needed; tag it, search it, look back by day, and tidy it up later.',
    'features.health': 'Health',
    'features.healthDesc':
      'Food, sleep, weight and TDEE on one page: the food library counts calories and protein, weigh-ins estimate daily burn, and naps get their own record.',
    'features.training': 'Training',
    'features.trainingDesc':
      'Log strength, cardio, stretching and ball sports separately, with an exercise library by muscle group; repeat last time, plan the week and get reminders.',
    'features.finance': 'Finance',
    'features.financeDesc':
      'Attach receipt photos, switch between day, month and year; category share and a six-month trend are charted, and deleted entries wait in the recycle bin.',
    'features.calendar': 'Calendar',
    'features.calendarDesc':
      'The month grid blends diary, health and spending into one shade; open a day for its timeline, with recurring reminders, a week view and monthly reviews.',
    'features.assistant': 'AI assistant',
    'features.assistantDesc':
      'Ask it to look things up, log spending, write a note or record sleep — it previews every write before saving. Multiple chats, attachments, long-term memory and skills included.',
    'features.appearance': 'Appearance',
    'features.appearanceDesc':
      'Six theme modes with six accent colours — tune the light, the warmth and even the ink on the page.',
    'features.ready': 'Ready',
    'features.wip': 'In progress',

    'ai.kicker': 'AI assistant',
    'ai.title': 'One line in, a finished entry out',
    'ai.desc':
      'What happened, how it felt — you do not have to write it whole. AI reshapes it in the tone you pick, and only writes in after you confirm. You can also ask the assistant to look things up, log spending, write a note or record your sleep; every write shows a preview before it is saved.',
    'ai.before': 'You wrote',
    'ai.raw': '10.24 overcast Went to the hospital for the report, doctor said it is fine, bought a sweet potato on the way back.',
    'ai.arrow': 'AI reshapes',
    'ai.after': 'AI wrote',
    'ai.polished':
      'Picked up my health report at the hospital today. The doctor flipped two pages and said everything looked normal, and told me to stop staying up so late. It was overcast and windy when I came out; I bought a roasted sweet potato at the corner and carried its warmth all the way home.',
    'ai.stepsTitle': 'Bring your own model first',
    'ai.step1':
      'Open Settings → Assistant → AI and enter an endpoint and key: OpenAI, DeepSeek, Qwen, or a local Ollama — anything OpenAI-compatible',
    'ai.step2': 'Back in the diary, pick an entry and hit AI compose, then choose a tone',
    'ai.step3': 'Read the result; nothing is written until you confirm',
    'ai.assistantNote':
      'The assistant does more than polish: it can draft a weekly or monthly review from your records, keep separate chats with their own context, take up to three image or text attachments per message, and follow installable skill packs.',
    'ai.keyNote':
      'No AI credits or keys are bundled: the model and its cost stay in your own account, and the key lives only in this device’s settings.',

    'shots.kicker': 'Screenshots',
    'shots.title': 'What it looks like',
    'shots.desc': 'No dashboard theatrics. One day is one sheet; flip it and you are on the day before.',
    'shots.diary': 'Diary: flip by day, slips keep only a summary',
    'shots.health': 'Health: today’s intake and protein',
    'shots.edit': 'Editor: ruled like manuscript paper',
    'shots.diaryAlt': 'Diary page: one slip per day, with date and weekday on top',
    'shots.healthAlt': 'Health page: today’s calorie and protein bars',
    'shots.editAlt': 'Editor page: text written on ruled paper lines',

    'privacy.kicker': 'Privacy',
    'privacy.title': 'Your days never leave this machine',
    'privacy.noAccount': 'No sign-up',
    'privacy.noAccountDesc': 'Open it and write. No account means no password recovery loop either.',
    'privacy.noCloud': 'No cloud',
    'privacy.noCloudDesc': 'We run no server, and not one entry is uploaded to us.',
    'privacy.export': 'Export is backup',
    'privacy.exportDesc':
      'Export Markdown, plain text or full JSON in one go. On desktop your data is a file you can copy.',
    'privacy.aiTitle': 'AI talks only to the service you pick',
    'privacy.aiDesc':
      'Only when you tap AI compose or ask the assistant does the relevant part of your records go to the model service you configured. Nothing else leaves the device.',

    'open.kicker': 'Open source',
    'open.title': 'The source has always been public',
    'open.desc':
      'Built in the open since the first commit: React 19 + Vite for the interface, Electron for the desktop shell, SQLite on desktop and IndexedDB in the browser and on Android.',
    'open.version': 'Version 0.18.2',

    'download.kicker': 'Download',
    'download.title': 'Take a copy home',
    'download.desc':
      '0.18.2 is still an early build. Export a backup before upgrading. Backups exported before 0.13.1 may contain model names and API keys in plain text; if you shared one or stored it in cloud storage or email, revoke old keys and generate fresh ones.',
    'download.web': 'Web app',
    'download.webMeta': 'Use in your browser · Installable as a PWA',
    'download.webDesc': 'No download needed. Open it in your browser, or add it to your home screen like an app.',
    'download.webCta': 'Open the web app',
    'download.windows': 'Windows installer',
    'download.windowsMeta': 'Windows 10/11 · about 96 MB',
    'download.windowsDesc':
      'Double-click to install, then find it in the Start menu. Desktop data is a SQLite file you can copy anywhere.',
    'download.android': 'Android APK',
    'download.androidMeta': 'Android 10+ · about 62 MB',
    'download.androidDesc':
      'Sideload it — you will need to allow installs from unknown sources. Same interface, data stays on the phone.',
    'download.note': 'The current installers are available from Gitee for users in mainland China. GitHub keeps the full release history and serves as a fallback; download older versions from GitHub.',

    'whatsnew.title': "What's new in 0.18.2",
    'whatsnew.item1': 'Manual checks request release information again',
    'whatsnew.item2': 'Fresh results replace startup information',
    'whatsnew.item3': 'Clear stale prompts when no update is available',
    'whatsnew.more': 'Full release notes',
    'whatsnew.moreHref': 'changelog.html',
    'changelog.kicker': 'Changelog',
    'changelog.title': 'What changed in each version',
    'changelog.back': '← Back to downloads',
    'download.historyLink': 'Previous versions and changelog, each with downloads →',

    'footer.version': 'Version 0.18.2',
    'footer.tagline': 'Data stays on your device',
    'footer.admin': 'Admin',
  },
};
