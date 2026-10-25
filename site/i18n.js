/**
 * 官网文案。和 App 的 shared/i18n/messages 保持同样的习惯：
 * 一份 key 对应两种语言，切换时整页替换。
 * 只带纯文本；需要属性的地方由 app.js 单独处理。
 */
window.SITE_I18N = {
  zh: {
    'meta.title': '星芒记录者 · 把零散的日子，攒成看得见的自己',
    'meta.description':
      '星芒记录者是一个本地优先的个人记录工具：随手记下今天，AI 帮你整理成完整的日记。无账号、无云端，Windows 与 Android 同源。',

    'a11y.skip': '跳到正文',

    'app.name': '星芒记录者',
    'app.nameEn': 'Starburst Recorder',
    'app.tagline': '把零散的日子，攒成看得见的自己。',

    'nav.features': '功能',
    'nav.ai': 'AI',
    'nav.shots': '截图',
    'nav.download': '下载',

    'hero.eyebrow': '本地优先 · 内置 AI',
    'hero.sub':
      '随手记下今天，AI 帮你整理成完整的日记。AI 用的是你自己填的模型和 Key；其余数据只留在这台设备上。Windows 和 Android 用的是同一份代码。',
    'hero.cta': '下载 0.2.0',
    'hero.source': '看源码',
    'hero.meta.local': '数据在本地',
    'hero.meta.noAccount': '不用注册',
    'hero.meta.bilingual': '中英双语',
    'hero.meta.platform': 'Windows / Android',
    'hero.slip1': '早上把阳台的花搬进来，晚上沿河跑了三公里，回来煮了碗面。',
    'hero.slip2': '没什么大事，把拖了很久的报销单交了。',
    'hero.slipAi': 'AI 已整理',

    'features.kicker': '功能',
    'features.title': '一张纸上的生活',
    'features.desc': '日记和健康已经能天天用，财务和日历还在路上——没做完的功能，我们不会说它做完了。',
    'features.diary': '日记',
    'features.diaryDesc': '随手记一句、按天翻看，也能一次导入整页手写照片，让 AI 认成文字。',
    'features.health': '健康',
    'features.healthDesc': 'TDEE、身体档案、食物库和每日摄入，热量与蛋白都算得清清楚楚。',
    'features.finance': '财务',
    'features.financeDesc': '每一笔收支，都记在同一本本子上。',
    'features.calendar': '日历',
    'features.calendarDesc': '把日子摊开看：哪几天写了，哪几天空着。',
    'features.ready': '已可用',
    'features.wip': '建设中',

    'ai.kicker': 'AI 整理',
    'ai.title': '随手记一句，剩下的交给 AI',
    'ai.desc':
      '那天发生了什么、当时是什么心情——你不用写得完整，AI 会按你选的口气重组，确认之后才写进去。',
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
      '只有你点「AI 整理」时，那一天的正文才会发给你自己配置的模型服务；其余记录不出本机。',

    'open.kicker': '开源',
    'open.title': '源码一直是公开的',
    'open.desc':
      '从第一版起就在公开仓库里迭代：React 19 + Vite 写界面，桌面用 Electron 包了一层，存储桌面走 SQLite、浏览器走 IndexedDB。',
    'open.version': '版本 0.2.0',

    'download.kicker': '下载',
    'download.title': '拿一份回去用',
    'download.desc': '0.2.0 是早期版本，功能还在长，数据格式也可能变——重要内容记得先导出备份。',
    'download.windows': 'Windows 安装包',
    'download.windowsMeta': 'Windows 10/11 · 约 95 MB',
    'download.windowsDesc': '双击安装，开始菜单里就是它。桌面端数据存成 SQLite，可以直接复制走。',
    'download.android': 'Android APK',
    'download.androidMeta': 'Android 10 以上 · 约 16 MB',
    'download.androidDesc': '侧载安装，需要允许「安装未知来源应用」。手机上是同一套界面，数据留在本机。',
    'download.note': '两个仓库放的是同一份安装包，哪个快就用哪个。',
    'download.history': '历史版本',
    'download.current': '当前',

    'footer.version': '版本 0.2.0',
    'footer.tagline': '数据只存在你的设备上',
  },

  en: {
    'meta.title': 'Starburst Recorder · Turn scattered days into a self you can see',
    'meta.description':
      'Starburst Recorder is a local-first journal: jot a line about today, let AI turn it into a finished entry. No account, no cloud, same codebase on Windows and Android.',

    'a11y.skip': 'Skip to content',

    'app.name': 'Starburst Recorder',
    'app.nameEn': '星芒记录者',
    'app.tagline': 'Turn scattered days into a self you can see.',

    'nav.features': 'Features',
    'nav.ai': 'AI',
    'nav.shots': 'Screenshots',
    'nav.download': 'Download',

    'hero.eyebrow': 'Local-first · AI inside',
    'hero.sub':
      'Jot down today and let AI shape it into a finished entry. AI runs on your own model and API key; everything else stays on this device. Windows and Android run the same code.',
    'hero.cta': 'Download 0.2.0',
    'hero.source': 'View source',
    'hero.meta.local': 'Data on your device',
    'hero.meta.noAccount': 'No sign-up',
    'hero.meta.bilingual': 'English & Chinese',
    'hero.meta.platform': 'Windows / Android',
    'hero.slip1': 'Moved the balcony plants inside this morning, ran three kilometres by the river, came home and made noodles.',
    'hero.slip2': 'Nothing big today — finally filed that expense report.',
    'hero.slipAi': 'AI reshaped',

    'features.kicker': 'Features',
    'features.title': 'A life kept on paper slips',
    'features.desc':
      'Diary and health are ready for daily use; finance and calendar are still on the way. We will not call a feature finished before it is.',
    'features.diary': 'Diary',
    'features.diaryDesc':
      'Jot a line, flip back by day, or import a photo of a handwritten page and let AI read it.',
    'features.health': 'Health',
    'features.healthDesc':
      'TDEE, body profile, a food library and daily intake — calories and protein add up clearly.',
    'features.finance': 'Finance',
    'features.financeDesc': 'Every cent in and out, in the same notebook.',
    'features.calendar': 'Calendar',
    'features.calendarDesc': 'Lay the days out flat: which ones have entries, which are blank.',
    'features.ready': 'Ready',
    'features.wip': 'In progress',

    'ai.kicker': 'AI compose',
    'ai.title': 'One line in, a finished entry out',
    'ai.desc':
      'What happened, how it felt — you do not have to write it whole. AI reshapes it in the tone you pick, and only writes in after you confirm.',
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
      'Only when you tap AI compose does that day’s text go to the model service you configured. Nothing else leaves the device.',

    'open.kicker': 'Open source',
    'open.title': 'The source has always been public',
    'open.desc':
      'Built in the open since the first commit: React 19 + Vite for the interface, Electron for the desktop shell, SQLite on desktop and IndexedDB in the browser.',
    'open.version': 'Version 0.2.0',

    'download.kicker': 'Download',
    'download.title': 'Take a copy home',
    'download.desc':
      '0.2.0 is an early build: features are still growing and the data format may change. Export a backup of anything you care about.',
    'download.windows': 'Windows installer',
    'download.windowsMeta': 'Windows 10/11 · about 95 MB',
    'download.windowsDesc':
      'Double-click to install, then find it in the Start menu. Desktop data is a SQLite file you can copy anywhere.',
    'download.android': 'Android APK',
    'download.androidMeta': 'Android 10+ · about 16 MB',
    'download.androidDesc':
      'Sideload it — you will need to allow installs from unknown sources. Same interface, data stays on the phone.',
    'download.note': 'Both hosts carry the same builds. Use whichever is faster for you.',
    'download.history': 'Previous versions',
    'download.current': 'Current',

    'footer.version': 'Version 0.2.0',
    'footer.tagline': 'Data stays on your device',
  },
};
