# 星芒记录者 —— 项目交接与决策记录

> 这份文档的用途：把"只存在于对话里"的判断落成文字。
> 换机器、换会话、换工具之后，读这一份就能接手。
> 最近更新：2026-10-20
>
> **项目路径：`D:\File\idea\trae\starburst_recorder`**（2026-10-20 从 `D:\File\claude\` + 零宽字符 + `starburst_recorder` 搬过来，原因见 §9）

---

## 1. 这是什么

个人生活记录工具。**核心亮点是内置 AI**：随手记 → AI 自动整理分析出报告。
**本地优先**：无账号、无云端、数据全在自己机器上。

## 2. 技术底座（已定，勿轻易推翻）

| 项 | 选型 | 为什么这么选 |
|---|---|---|
| 框架 | React 19 + Vite 8 | 快速开发，热更新体验好 |
| 语言 | TypeScript **6.x** | **刻意锁在 6.x**，升到 7 会和 typescript-eslint 不兼容 |
| 路由 | react-router 8，**hash 路由** | 打包进桌面/手机壳后，hash 路由不需要服务端支持 |
| 样式 | Tailwind v4（**CSS-first**） | 用 `@theme` 定义令牌，**没有也不该有 tailwind.config.js** |
| 存储 | 桌面 **SQLite（`node:sqlite`）**；浏览器 / 安卓 Dexie 4 + IndexedDB | 桌面数据能自己复制一个文件备份；开发与手机仍是零原生依赖（详见 §4） |
| 桌面 | **Electron** | 本机不需要装 Rust/MSVC 就能出成品；以后想换 Tauri 也很便宜（包的是同一份 `dist/`） |
| 手机 | **Capacitor**（尚未开始） | 同一份 web 代码套壳 |
| 字体子集化 | Python fonttools | 一次性工具，产物已在仓库里 |

### AI 请求走哪条路（别改）

浏览器直连第三方 API 会被跨域策略拦掉（厂商配不配 CORS 头是碰运气的），所以：

- **桌面程序**：网页 → `window.desktop.chat` / `window.desktop.models`（`src/core/desktop.ts` 是唯一的能力契约）→ Electron 主进程 `net.fetch`。没有 CORS，key 也不进渲染进程的网络栈。用 `net.fetch` 而不是全局 fetch，是为了跟着**系统代理**走。
- **浏览器开发调试**：走 `vite.config.ts` 里的 `/__ai` 转发中间件，**目标地址放在请求头 `X-AI-Target`**，所以在设置页随便改服务地址都不用重启 dev server。对话是 `POST /__ai`，模型列表是 `GET /__ai/models`（长路径先注册，否则会被前缀吃掉）。这层只在开发时存在，打包产物里没有。
- **出口只有一个函数**：`src/features/ai/aiClient.ts` 的 `chat()` / `listModels()`。以后接手机端只在它里面加一支，别在页面里散着发请求。
- 两条路都回同一个「信封」`ChatTransportResult`，所以解析响应、把 401/404/429 翻译成人话的逻辑只写一份。
- **图片按 OpenAI 的 content parts 发**：`content` 允许写成 `[{type:'text'}, {type:'image_url', image_url:{url}}]`，url 是压缩后的 JPEG dataURL。图片是**一次性的输入，不落库、不进备份**。

### 明确不做的事

- **不发布 web 端**（但**开发调试仍然在浏览器跑 Vite**，这两件事是分开的）
- 不用 Python/pywebview 封装窗口（绕开既定路线、维护成本全在自己身上）
- 桌面存储已换 SQLite（2026-10-21）；**Android 暂不换**，等桌面这版跑稳再说（见 §10）

## 3. 打包（Windows 与手机 debug APK 都能出）

### 命令

```bash
npm run dev              # 浏览器开发调试（最快的迭代方式）
npm run desktop          # 构建 + 打开桌面窗口
npm run desktop:installer # 完整安装包流水线
```

### Android（Capacitor，出 debug APK）

```bash
npm run build && npx cap sync android    # 前端产物同步进 android 工程
```

然后在 `android/` 目录下（**系统默认 java 是 1.8，必须显式指定 21**）：

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
.\gradlew.bat assembleDebug --no-daemon
```

产物 `android/app/build/outputs/apk/debug/app-debug.apk`（约 10.7 MB），装机：

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

- `minSdk = 29`（Android 10），`targetSdk = 36`，见 `android/variables.gradle`
- `android/local.properties` 里写 `sdk.dir=D:\Android\Sdk`
- gradle wrapper 已锁 **8.14.4-bin**（本机已缓存，构建时不下载）
- 页面跑在 `https://localhost`（Capacitor 默认 `androidScheme`），IndexedDB 按常规工作

### Windows 安装包流程

```
package/
├─ icons/make-icons.ps1           一套画法出全端（Windows .ico + Android mipmap），透明底
└─ windows/
   ├─ starburst-recorder.iss      Inno 脚本（安装界面细节）
   ├─ build.ps1                   流水线：构建 → 免安装目录 → 安装程序
   ├─ icon.ico / icon.png         应用图标（透明底）
   └─ languages/ChineseSimplified.isl 简体中文语言包（官方包不带，随仓库走）
```

产物：`package/windows/dist/starburst-recorder-<版本>-setup.exe`（约 112 MB）。
`release/`（免安装目录）和 `package/windows/dist/`（安装包）都已进 `.gitignore`。

**版本号、应用名、exe 名统一从 `package.json` 读**，由 `build.ps1` 用 `/D` 传给 Inno，避免两处各写一份。

### 应用图标（2026-10-20 定稿）

设计：**星尘轨道 + 黑洞镂空 + 中心星芒**，青色 `#6ee7ff`，**不带方底**——方案 A：Windows 与 Android 都直接给带 alpha 的透明图。

```powershell
powershell -File package/icons/make-icons.ps1                                   # 出全端图标
powershell -File package/icons/make-icons.ps1 -PreviewDir .venv/icon-preview     # 另出验收对照图
```

- 产出：`package/windows/icon.ico`（16/32/48/64/128/256）+ `icon.png`（512 预览）+ Android `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` 与 `ic_launcher_round.png`（48/72/96/144/192）。实测**透明像素 85–87%、四角 alpha 全为 0**
- **每档单独渲染，不靠缩放**，且按尺寸降级细节：16/32 只画「环 + 核点」（细节在小尺寸必糊，实测过）；40–95 画环 + 星芒 + 轨道线；96 以上才加三颗星尘点与洞的暗填充（`-HoleAlpha 0` 即完全镂空）
- **Android 刻意不上自适应图标**：自适应图标的**背景层必须不透明**，现代启动器就会显示深色底而非透明剪影；想要"透明 + 不规则"只能走 legacy PNG（参考项目《氢风》，其 APK 的 `res/*.png` 透明像素 52–55%、四角 alpha 全 0）。所以 `mipmap-anydpi-v26/`、`ic_launcher_foreground`、`ic_launcher_background` **已删除——别加回来**。代价：部分国产启动器会给 legacy 图标自动加一层底，且放弃 Android 13 单色主题图标

### 桌面壳的关键决定

- **用自定义 `app://starburst` 协议加载页面，不用 `file://`**。原因：`file://` 的 origin 是 opaque，ES module / fetch / IndexedDB 都可能被拦；给一个标准 origin 之后这些都按常规工作。
- `electronDist` 指向 `node_modules/electron/dist`：**绕开 electron-builder"解压再重命名"那一步**，那一步在本机稳定报 `EPERM`（杀毒在扫描时锁住 `.tmp` 目录）。
- `contextIsolation: true` + `nodeIntegration: false`，preload 只暴露"窗口尺寸"一个能力。
- 窗口默认 1000×760，可自由缩放，最小 420×560，暂用系统原生标题栏。

### 自检（重要的验证手段）

```powershell
$env:STARBURST_SELFCHECK='1'; & "release\win-unpacked\星芒记录者.exe"
# 结果同时写到 %TEMP%\starburst-selfcheck.json
```

会探测：`origin`、手写体是否加载、IndexedDB 能否读写、页面是否渲染、**SQLite 通道能否调通（`sqlite: "ok:日记数/随记数"`）**。
**打包后必须跑一次**——asar 打包最容易出现"开发能跑、打包后白屏"。

## 4. 数据模型与"数据到底在哪"

**唯一真相源：`src/core/db/schema.ts`**（三张表 + 字段 + 索引见 `src/core/db/db.ts`）。

**存储抽象（2026-10-21）**：页面只 import `features/diary/diaryRepo.ts`，它由 `core/db/index.ts` 选中的 `DiaryStore` 实现提供；契约在 `core/db/store.ts`。**选择点按环境自动选**：桌面程序有 `window.desktop.db` → `sqliteStore`（主进程 `electron/database.cjs`，真库是 SQLite）；浏览器 / 安卓 → `dexieStore`。两种实现外面统一套 `withChangeBus`（`core/db/changes.ts`）：写方法成功后广播一次，`core/db/live.ts` 里**自实现的 `useLiveQuery`** 据此重查——不再依赖 dexie-react-hooks（它看不见主进程写的库）。契约要求：批量写返回受影响行数、导入三张表必须同一事务、任何实现都要能让页面收到变化通知。

**桌面 SQLite（2026-10-21 落地）**：用 Electron 44 内置的 `node:sqlite`（Node 24 自带），**不装原生模块、不用为 Electron 重编**；主进程 `electron/database.cjs` 建表 + WAL + 预编译语句，渲染进程只能通过 `db:call` 白名单调方法，拼不了任意 SQL。数据库文件：`%APPDATA%\starburst-recorder\starburst.db`。旧 IndexedDB 数据**不自动迁移**：设置页「数据与备份」里有「旧版数据」卡片（桌面端、检测到老库非空时才出现），用户点确认后把 IndexedDB 里的日记 / 随记 / 天气并进 SQLite，搬完写个 `sb_legacy_migrated` 标记不再提示。

| 表 | 一行是什么 | 主键 / 索引要点 |
|---|---|---|
| `diaryEntries` | 一条普通日记 | `id` 主键；另有 `code`（7 位短编号，用来拼 URL）、`dateKey`、`createdAt`、`deletedAt` |
| `diaryDays` | 某天的信息（**一天一行**） | `dateKey` 主键；存天气 |
| `diaryStamps` | 随记的一笔 | `id` 主键；`dateKey` + `time`（'HH:MM'）+ `content` + `deletedAt` |

### 四个关键设计决定

1. **随记的"每天一份"是视图，不是存储。** 存储上是一笔一行，界面按 `dateKey` 聚成一天一份。这样"按时间排序、单独改某一笔的时间、以后 AI 按时间线解析"都是白拿。
2. **删除一律软删除**：只把 `deletedAt` 写成时间戳，查询永远带 `deletedAt === null` 过滤。"撤销"和"回收站恢复"就是把 `deletedAt` 改回 `null`。
3. **天气按天存**，不挂在日记或随记上：同一天的多条日记、多笔随记**共享同一份天气**（所以随记页改了天气，日记页眉立刻跟着变）。
4. **天气链存成字符串 `'晴→雨→阴'`**，不存数组：老数据（单个 `"晴"`）用同一个解析函数照样读得出，**不需要数据迁移**。显示时再转成"晴转雨阴"和图标链（见 `src/features/diary/weather.ts`）。

### 数据实际存在哪（重要）

**不在项目文件夹里。** 三个容器各有各的存储，**互不相通**：

| 环境 | origin | 数据位置 |
|---|---|---|
| 浏览器开发 | `http://localhost:5173` | 浏览器自己的 profile（IndexedDB） |
| 桌面程序 | `app://starburst` | `%APPDATA%\starburst-recorder\starburst.db`（SQLite 文件，同目录还有 Chromium profile） |
| 手机 App（将来） | `https://localhost` | App 私有目录（IndexedDB） |

> 桌面端这个目录名来自 Electron 的 `app.getPath('userData')`，取的是 **package.json 的 `name`**（`starburst-recorder`），
> 跟 `build.productName`（星芒记录者）没关系——那个只决定打包出来的 exe 叫什么。
> 设置页「数据与备份 → 数据在哪」里同时显示这个目录和 `starburst.db` 的完整路径（由主进程报上来），所以界面上写的是真话。

所以：**浏览器里攒的日记，打出来的桌面程序里一条也看不到**，搬家只能靠「导出 → 导入」。
导出与导入都已做（都在设置页的「数据与备份」页里），数据闭环现在是通的。

## 5. 界面与设计约定（最容易丢的部分）

- **主题**：默认「深空」，可切「浅色」。导航背景、强调色、悬浮球颜色**全部由主题色 `--sb-accent` 用 `color-mix` 派生**。
- **纸**：米白偏黄 `#f7f2e8`、**直角**、靠柔和投影从桌面托起来。浅色模式下桌面加深、纸用纯白。
- **纸色与墨色刻意不跟主题色变**：换主题色时纸仍然是纸。主题色只当点缀（按钮、贴纸描边）。
- **手写体**：霞鹜文楷，子集化为 GB2312 全字库（约 1.5 MB，7068 字），放在 `src/assets/fonts/` **交给 Vite 处理**（放 `public/` 会在桌面壳里 404）。
- **横线不贯穿**：线只在版心内，左右留页边距。
- **段首两个方格**不是装饰：它同时就是"首行缩进两字"的载体，缩进和视觉是一体的。
- **随记时间轴**：轴线**贯穿整张纸**、节点用**空心环**、只记今天时插入「现在」标记（每分钟自动走）。
- **天气小贴纸**：斜贴、图标链 + 全文。
- **天气查询（2026-10-21）**：点天气贴纸 → 弹窗底部「查天气」，走 Open-Meteo（免费、无 key）。地点优先自动定位，定位被拒/超时就地展开「换地点」，按中文地名搜城市；地点存 `localStorage` 的 `sb_weather_place`。查到的结果**不自动落库**：弹窗里显示「查到：🌧️ 雨」，用户点「填上」才替换天气链，点「不用」什么都不动，最终仍要点「确认」才写库。一天只取一个主天气（预报接口回查 90 天内，更早走 archive 接口），不按小时拆变化链。Android 已声明定位权限，拒绝也能手搜城市。
- **按钮**：统一实心（主题色）+ 反色文字；**删除类一律用危险色红**，形状尺寸与主按钮一致。**「返回上一级」用实心危险色红 + 反色文字**（`buttonStyles.BACK_BUTTON`，2026-10-20 用户在预览页里对比四种形态后选定）：它和「删除」同色，所以两者同框时长得几乎一样（日记编辑页头部就是这样），这是知情的取舍，改口只动 `BACK_BUTTON` 一处。
- **页内栏目切换**：用 `shared/ui/Tab.tsx`，日记/随记/回收站三处共用。
- **删除保护**：任何删除都要二次确认，并在底部提示条给「撤销」。
- **批量多选**：日记列表、随记、回收站、AI 模型列表四处共用一套。顶部「批量」进入（进入后页面上的动作按钮收起）；选中态 = 描主题色 + 纸面/行染一点主题色 + 勾；操作在**底部悬浮工具条**（日记与随记：全选/反选/取消/删除/移动日期/导出/完成；回收站：全选/反选/取消/恢复/彻底删除/完成；AI 模型：全选/反选/取消/设为启用/删除/完成）。**状态与工具条已封装**：`shared/ui/useBatchSelect.ts` 管进入/退出/选中/全选/反选/清空，`shared/ui/BatchActions.tsx` 渲染固定的「全选/反选/取消 + 页面动作 + 完成」，页面只传 ids、量词和中间几个动作；底条外壳是 `shared/ui/BatchBar.tsx`，按钮样式在 `shared/ui/buttonStyles.ts`。
- **设置页是两级结构（2026-10-20 重整）**：入口在「我的」，按**主题域**分成两张菜单——`/me/settings`（应用级：主题 `/me/settings/theme`、数据与备份 `/me/settings/data`）与 `/me/agent`（助手相关：悬浮球 `/me/agent/ball`、AI 模型 `/me/agent/ai`）。菜单行用 `shared/ui/SettingRow.tsx`（emoji + 名称 + 一行小字 + **右侧「当前值」药丸** + ›）；二级页外壳是 `shared/ui/PageShell.tsx`（原 `SettingSubPage`：菜单页也在用它，"Sub/次级"名不副实，2026-10-20 改名；顶部「← 设置 / 助手」**实心红返回按钮**（`BACK_BUTTON`）+ 页面名 + 当前值药丸 + 一句说明）。**页内返回不能省**：桌面壳没有系统返回键、安卓的实体返回键也还没接（ROADMAP 第 7 项）。二级页"一页只剩一块"时 `SettingCard` 不写 `title`（页面名已经在上面了，避免同一个名字出现两遍），卡片里第一组用 `<SettingGroup first>` 去掉那条多余的分隔线；窗口尺寸并进「主题」页的第二张卡（`WindowCard`），只在桌面程序里出现。「点一下就选中」的格子统一用 `buttonStyles.choiceTile()`。目的：菜单一眼读到当前值，二级进去只改一件事。旧的 `/settings*` 地址留了一条跳转到 `/me/settings`。主题色色块**必须留描边**，否则浅色模式下色块跟卡片背景糊在一起。主题色带中文名（青 / 薄荷 / 藕荷 / 曙红 / 麦黄 / 雾蓝，见 `app/theme.ts` 的 `ACCENT_COLORS`），名字写在色块下面——色值没法念，名字才说得清"我用的是哪个"。厂商、悬浮球形象这类「点一下就选中」的格子，宽屏 4 列、窄屏自动收回 2 列（`sm:` 断点 640px）。
- **AI 配置（我的 → 助手 → AI 模型，2026-10-21 改为模型列表）**：存的是**模型列表 + 同时启用其中一条**，每条都是完整配置（厂商、地址、模型名、key），所以可以整条切换、各用各的 key；存 `localStorage` 的 `sb_ai_models`（列表）与 `sb_ai_active`（启用 id），老版本的单套 `sb_ai_config` 第一次读时自动搬成第一条并启用、搬完删掉老键。**列表空串与「没存过」是两回事**：删掉启用中的那条会存空串，表示「明确没有启用」，不要自动退回第一条。新增表单嵌在「＋ 新增模型」按钮下方，编辑走弹窗，同一个 `features/ai/ModelForm.tsx` 两处复用。每条显示厂商、模型名、地址 + 打码 key、看图能力、上次测试结果（通了 / 没通 + 毫秒 + 时间，存在条目 `lastTest` 里，换地址或模型名就作废）。顶部「测试联通」**一键顺序测全部**并写回结果。批量管理复用日记那套。**删的是正在启用的那条时先挡一道**：弹窗说清「AI 助手会用不了」，给「去启用别的」和「仍然删除」两个出口，硬删后留空不自动顶替。**模型名拉不到时不是死路**：表单里直接给出该厂商的模型列表/控制台网址（`AI_PROVIDERS[].modelListUrl`），自定义厂商回退到 `{baseUrl}/models`，并说明可以手填；模型名下拉用自绘 `shared/ui/ComboBox.tsx`（不用 `datalist`，它会按当前值过滤成只剩一条，看起来像「只拉到一个」）。厂商和模型两个下拉都支持「点开挑 + 直接手填」。每个字段都配一句人话说明（地址填到哪一层、模型名去哪抄、key 怎么拿）；key 带显示/隐藏；**改动自动保存**，不设保存按钮；「测一下」给**分步诊断**（① 填写 → ② 连接 → ③ 密钥 → ④ 模型 → ⑤ 看图），卡在哪一步就说清「是什么问题、下一步怎么办」，不把 `401 invalid_api_key` 原文丢给用户。
- **AI 整理成日记**：入口在**随记栏的按钮区**（这天一笔没记就不亮）；原料 = 当天随记 + 当天天气；口气可切（自然口语 / 小学生腔，**草稿没被手改过就自动按新口气重写**，改过就只切不覆盖）；草稿在弹窗里可编辑，点「写入日记」才往当天**新建一条**日记，**随记原文一条不动**。提示词里的规矩：只写记录里真有的东西、不许编造、不要小标题/序号/Markdown/第二人称、**没给的信息（比如没记天气）一个字都别提**。
- **数据与备份（我的 → 设置 → 单独一页 `/me/settings/data`）**：导出全部（一份 JSON，含日记 / 随记 / **天气** / 回收站里删掉的）；从备份恢复。备份文件带 `app` 标记和版本号，用来对用户说清「这不是星芒记录者导出的」。**导入语义 = 合并、同 id 以备份为准**（bulkPut 天然覆盖），三张表同一个事务。**校验刻意宽容**：坏条目单独剔掉并报数，而不是整份拒绝——不该因为一条脏数据让你丢掉整个备份；未知字段不落库。导入前必须先弹确认框写清「会新增几条、覆盖几条」，导入后给分项统计（新增 / 覆盖 / 跳过），而不是一句「导入成功」。`ConfirmDialog` 加了 `tone`：删除类红、导入这类主题色。

- **壳层滚动模型（2026-10-20 重整）**：壳层固定一屏高（`h-dvh` + `overflow-hidden`），**只有内容区 `main.sb-scroll` 自己滚**——原来是整页滚，桌面端侧栏会被内容顶出视口。手机端 `nav` 用 `order-last` 自然落在屏幕底部（不再是 fixed 浮层，所以内容区不用留 pb 去躲它）。弹窗打开时用 `shared/ui/useScrollLock` 锁住内容区，消掉"滚动穿透"。**弹窗外壳统一走 `shared/ui/Modal.tsx`**（遮罩 + 居中面板 + 点遮罩/Esc 关闭 + 自带锁滚动），5 个弹窗共用：ConfirmDialog / WeatherDialog / ExportDialog / DatePickerDialog / AiComposeDialog。滚动位置归内容区管：**换板块复位到顶，同一板块内进出（日记列表 ↔ 某一篇）保留位置**。

- **导航（2026-10-20 重整）**：四格——**首页 / 记录（可展开） / 日历 / 我的**。「记录」这一组里装着日记、健康、经济：**桌面侧栏**缩进挂在「记录」下面一列，**手机底栏没法竖着嵌**，所以那里点「记录」是在**底栏上方**展开一行（三个子项横排）。展开状态是**派生**的——默认跟着路由走（人在记录/健康/经济下就开着），用户手动拨过一次就以手动为准（别用 effect 里 setState 去同步，会被 `react-hooks/set-state-in-effect` 拦住）。底栏在流里（见上一条），所以展开只是把内容区顶上去一点，不会盖住内容。

- **导航展开态不用箭头（2026-10-21 改）**：「记录」那一格原来带 `▾`、展开时转 180°，现在**去掉箭头**，只靠颜色说——开着 = 文字走主题色 + 一层淡主题色底（`bg-brand/15`），收起 = 常态灰。理由：子项就在旁边/上方明摆着，"有下级"不需要再画一个箭头；而展开与选中本来就是同一个状态，用同一种颜色同时表达两件事更省。同一格既是"当前板块"（`inRecords`）又是"展开着"（`recordsOpen`），两者只要有一个成立就用高亮色——省得同格出现两套高亮，互相打架。

- **按钮行套一层底（2026-10-21 加）**：**整行都是按钮**的地方（日记页的「新增/图片导入/批量/回收站」、日记编辑页的「返回/删除/编辑」、回收站的「返回/批量/清空」）统一套 `shared/ui/ToolbarRow.tsx`：`rounded-xl border border-line bg-surface-2 p-2`，即比页面底色亮半档、与卡片同层。这样"这一条是动作区、下面那块是内容"一眼分得开，不然一串按钮浮在页面底色上，按钮与内容糊在同一层，没有结构感也看不出主次。**不要滥用**：页头那种只有返回按钮的行不套（返回按钮本身已够醒目，再套底反而重），日期行、标签页行这类混着文字的行也不套。

## 6. 目录结构

```
src/
├─ main.tsx / index.css        入口 / 设计令牌 + 纸·时间轴·横线格等 CSS 类
├─ app/                        路由（逐页懒加载 + 错误兜底）、主题、外壳、三个 Provider
├─ core/
│   ├─ db/                     数据库选择点、Dexie / SQLite 两套实现、变更总线
│   └─ utils/                  id.ts（ULID、短编号）、dateKey.ts（日期与格式化）
├─ platform/                   跨端能力：desktop.ts（Electron 桥）、saveFile.ts（导出落盘）
├─ shared/
│   ├─ i18n/                   语言上下文 + Provider + messages/zh.ts（先只出中文）
│   └─ ui/                     外壳与共用件：Modal、PageShell / Page / PageHeader、ToolbarRow、SettingCard/SettingRow、ConfirmDialog、Tab、BatchBar / BatchActions / useBatchSelect、ComboBox、buttonStyles、inputStyles、overlayStack(+useOverlayEntry)、useScrollLock
├─ features/                   业务模块（不反向依赖 app；core / shared / platform 不反向依赖 features）
│   ├─ ai/                      AI 网关：配置、客户端（唯一出口）、整理成日记
│   ├─ diary/                  日记 + 随记 + 回收站 + 导出（全部在这）
│   └─ home / health / finance / calendar / me / settings / assistant
electron/                      main.cjs（主进程）+ preload.cjs + database.cjs
package/windows/               Inno 打包相关
package/icons/                 全端透明图标生成脚本
.github/workflows/ci.yml       lint / typecheck / test / build
vitest.config.ts               单测配置：node 环境，只测纯逻辑
```

导入统一用 `@/...` 别名（`tsconfig.json` 的 `paths` + `vite.config.ts` 的 `alias`），不再写 `../../`；分层方向由 `eslint.config.js` 的 `no-restricted-imports` 兜住。

## 7. 已实现 / 未实现

**已实现**
- 普通日记：列表 / 编辑 / 自动保存（600ms 防抖）/ 锁定只读视图（按自然段渲染作文纸）/ 按天天气
- **随记**：一天一份的时间轴，时间可点改、按时间自动排序、"现在"标记
- **回收站**：日记与随记**分开**（页内切换、各自清空），支持恢复 / 彻底删除
- **批量多选**：三处都做了——日记列表与随记（全选/反选/取消、批量删除可撤销、移动日期、导出三格式）、回收站（批量恢复、批量彻底删除，彻底删除无撤销）
- **AI 网关最小闭环**：设置页里配厂商 / 服务地址 / 模型名 / API Key（7 家预设 + 自定义），「测试连接」给分步诊断。桌面端从主进程发请求、浏览器开发调试走 vite 转发（见 §2）
- **AI 设置页已改成表单**（2026-10-21）：左标签右控件四行；**服务商和模型都是下拉 + 可手填**；模型候选项从服务商 `GET /models` **实时拉取**（填完地址和 key 自动拉，也能点「刷新列表」）；自己填过的服务商会记在 `sb_ai_providers`，下次下拉里直接选
- **测试连接会多测一步「看图」**：文字通过后再发一张 64×64 的小图，判断这个模型收不收图片，结果存进配置的 `vision`（yes / no / unknown）。UI 上直接显示「✓ 支持识别图片 / ✗ 不支持识别图片 / 能力未测」
- **AI 整理成日记**：随记 → 一篇可编辑的日记草稿 → 确认后新建一条日记（随记不动），口气可切
- **图片导入（手写日记）**：日记页按钮 → 选一张手写照片 → 压缩到长边 1600 / JPEG 0.82 → 视觉模型转写（只转写、不润色，认不出的字用「□」）→ 新建当天日记并直接进编辑页。**图片不存**，日记仍是纯文本；模型没填 / 明确不支持看图时会在选图前就拦下来并给出去哪改的指引
- **数据与备份**：导出全部（含天气与回收站）、从备份恢复（合并、同 id 以备份为准、坏条目剔掉并报数）、桌面端可打开数据文件夹
- **导出**：Markdown / 纯文本 / JSON，浏览器直接下载
- **按天天气**（2026-10-21）：自由输入地点 → 先让已配置的 AI 联网查 → 未配置 / 超时 / 报错 / 回空时静默改用 Open-Meteo 直查（自动去「市 / 区 / 县」后缀）；结果在弹窗里标明「AI 联网」还是「程序兜底」
- **多语言框架**（2026-10-21）：扁平 key + `{name}` 插值，先只出中文；导航、「我的」、通用弹窗 / 页头、设置、AI、数据与备份、日记模块（含随记 / 天气 / 日期选择 / 导出 / 图片导入 / 回收站）、首页、通用组件（ComboBox）、健康 / 经济 / 日历 / 助手占位页与悬浮助手已收口；数据层显示名（主题风味、主题色、悬浮球形象、AI 服务商与备注）也已 key 化，剩下的只有存进数据库的天气状态值。下一步新建 `en.ts`
- **工程化**（2026-10-21）：`@` 路径别名、路由逐页懒加载 + 错误兜底、分层依赖约束、43 个纯逻辑单测、GitHub Actions 跑 lint / typecheck / test / build
- 主题（深空 / 浅色）+ 主题色色板
- 悬浮球（桌宠，会自动贴边半藏）
- **Windows 桌面程序**：能跑、能打包成中文向导的安装程序

**未实现**
- 健康 / 经济 / 日历三个占位模块
- 英文等其它语言的文案（框架已就位，缺译文）

## 8. 环境结论（当前这台机器）

| 项 | 状态 |
|---|---|
| Node / npm | v24.16.0 / 11.13.0 ✅ |
| Python | 3.13.10（装过 fonttools，用于字体子集化） |
| **Android Studio** | 已装，自带 **JBR 21** |
| **JDK** | **17 与 21 都已装**；⚠️ 但系统默认 `java` 是 **1.8**，构建 Android 时必须指到 17+ |
| Android SDK | `D:\Android\Sdk`，`adb` 1.0.41 可用 ✅ |
| Inno Setup 6 | 已装（`C:\Program Files (x86)\Inno Setup 6\ISCC.exe`）✅ |
| WebView2 | 已装（Win11 自带）✅ |
| Rust / cargo | ❌ 未装（只有要用 Tauri 才需要） |
| VS C++ 工具链 | ❌ 未勾（同上，`VC\Tools\MSVC` 为空） |
| winget | v1.29.380 可用 ✅ |
| 网络 | ⚠️ **GitHub 直连不通**；npm registry、jsdelivr、npmmirror、ghproxy.net 可用 |
| 磁盘 | C 约 49.6 GB 空闲 / D 约 70.3 GB 空闲 |

## 9. 踩过的坑与解法（照抄能省很多时间）

| 坑 | 现象 | 解法 |
|---|---|---|
| GitHub 直连装 Electron | `Electron failed to install correctly` / `fetch failed` | `.npmrc` 里配 `electron_mirror` 与 `electron_builder_binaries_mirror` 指向 npmmirror |
| electron-builder 打包 | `EPERM: rename win-unpacked.tmp -> win-unpacked` | 配 `electronDist` 直接复用 `node_modules/electron/dist`，不走解压重命名 |
| PowerShell 5.1 跑 .ps1 | 中文注释把引号搞乱、`ConvertFrom-Json` 报错 | **脚本必须存成 UTF-8 带 BOM**；读 json 要显式 `-Encoding UTF8` |
| 字体在桌面壳里 404 | 手写体不生效 | 字体从 `public/` 挪到 `src/assets/`，交 Vite 处理；Vite `base` 改 `'./'` |
| 开发能跑、打包白屏 | （被 `app://` 协议提前规避） | 不用 `file://`，注册自定义标准协议 |
| npm 11 警告 | `Unknown project config "electron_mirror"` | 忽略即可，功能正常；未来 npm 大版本可能不再支持这种写法 |
| React StrictMode | 开发时 `useEffect` 会跑两遍 → 弹窗一打开就发两次 AI 请求，白花 token | 用 `useRef` 挡第二次（`AiComposeDialog` 里就是这么干的） |
| 提示词把"缺失"当事实 | 随记没记天气时，提示词里写「天气：没记」，模型就真写了一句「今天也没记天气」 | **没给的信息不要出现在提示词里**，而不是给一个"没记"的占位值 |
| 想单独验一段 TS 逻辑 | 不想为一次验证装 esbuild | 现在有 vitest：纯逻辑写 `*.test.ts`，`npm test` 跑；一次性脚本仍可用 `node_modules/.bin/jiti <脚本.cjs> <某个.ts 的绝对路径>`（jiti 能直接 require TS 文件并解析无后缀的相对导入），跑完就删 |
| **目录名里的不可见字符卡死 Java** | 旧项目目录名第一个字符是 `U+200C`（零宽非连接符，肉眼看不见）。Java 把路径转成 `?` 后报 `Unable to access jarfile`，**Gradle / Android 构建全部失败** | **已治本**：2026-10-20 整个项目搬到 `D:\File\idea\trae\starburst_recorder`，新路径全 ASCII，`assembleDebug` 直接跑通（37 秒）。当初的临时办法是建目录联接 `New-Item -ItemType Junction -Path D:\sb_probe -Target <项目目录>` 再在联接里构建——**别再往带不可见字符的路径上放项目**，长教训 |
| 目录被占用导致改名失败 | `Rename-Item` 报 `The process cannot access the file because it is being used by another process`，命令行里查不到占用者 | 编辑器/终端把这个目录当工作区开着就会占住。**改名别硬来，直接复制到干净路径**（robocopy `/E /MT:16 /R:1 /W:1`，1.1 GB 约 3 分钟）更省事 |

## 10. 被否决的方案（别再走一遍）

| 方案 | 为什么否决 |
|---|---|
| 发布 web 端 | 明确只做 Windows + Android 两种程序 |
| Python + pywebview 封装 | 产物大小/内存不比 Electron 好，维护成本全落到自己身上 |
| Inno Setup 直接"把网页做成程序" | 它只是安装包生成器，必须已有 exe 才有意义 |
| `file://` 加载页面 | origin 是 opaque，存储/模块/网络都会出问题 |
| 全端一次性换 SQLite | 桌面端已于 2026-10-21 完成；Android 需要原生插件 + 真机验证，等桌面跑稳再单独做 |

### 换 SQLite 的进度

- ✅ **桌面端（2026-10-21）**：`node:sqlite` + 主进程 `electron/database.cjs` + `db:call` 白名单 + 渲染层 `sqliteStore`；`core/db/live.ts` 改为自实现 `useLiveQuery`，由 `withChangeBus` 在写成功后广播。老数据不自动迁移，靠设置页「旧版数据」卡片手动搬一次。
- ⏳ **Android**：还没做。要用 `@capacitor-community/sqlite`（原生插件 + 改安卓工程），得真机验证；**等桌面这版跑稳再动**。
- 当初的三个触发条件（担心丢数据 / 数据量大 / AI 扫历史）里，第一条已经成立——一个能自己复制走的 `starburst.db` 就是理由。
- 浏览器开发环境始终走 Dexie：`node:sqlite` 只存在于 Electron 主进程，页面不该假装自己有文件系统。

## 11. 下一步候选

1. **手机 APK 收尾**（✅ 2026-10-21 全部完成：图标、实体返回键、状态栏/安全区、WebView 导出，四项都端到端验过）
2. **AI 本周回顾（周报）**：拿一周的日记+随记合成一篇「这周发生了什么」，跟「整理成日记」共用同一套网关
3. **Android 换 SQLite**（`@capacitor-community/sqlite` + 真机验证；桌面的实现可当参照，范围见 §10）
4. **补英文**：新建 `en.ts`、在 `context.ts` 登记语言并在设置页加切换入口
5. **可选的小整改**：给 package.json 加顶层 `productName`，让桌面端的数据目录变成「星芒记录者」——代价是要迁移一次现有桌面数据，所以先不动

> **完整路线清单（19 项，含参考开源项目与许可红线）另见根目录 [ROADMAP.md](ROADMAP.md)。**

## 12. 协作约定

- **小步走**：一次只做一小步，做完实测给你看，别一次性铺开
- **未经许可不提交**；提交时 commit message 写清"为什么"
- 功能入口配 emoji / 图标
- 界面分隔线、行线长度**不写死**，按显示宽度自适应
- 删除操作：全局危险色 + 二次确认 + 撤销提示条
- 动手前先把设计讲清楚，等你拍板

## 13. 家庭系统与账户（方向已定，还没动手）

**点子**：把健康模块分享给父母亲友——他们连上我自己搭的服务器注册账户，做一个家庭系统，成员之间互相查看各自「开放」的那部分，好关注家人的饮食作息。

**已定的四条**（2026-10-20）：

1. **架构路线：本地优先 + 可选共享层。** 日常仍然离线可用、数据仍然在各自机器上；「共享」是一个**可选的**同步/聚合层，只上传成员自己勾选的那部分。这样保住「数据全在自己手里」这个身份——参考 SiYuan Sync / Obsidian Sync 的模式。
2. **家庭定位：互相开放，双向都能看。** 不是「我盯着家人」，是对称的——你也愿意他们看到你的。
3. **默认权限：全不共享，自己一项一项勾。** 加入家庭后什么都不开放。理由：默认开放最容易被反感，用两天就没人用了。
4. **顺序：先手机 APK → （以后）健康模块 → 再谈账户与共享。** 账户系统不是当前的前置；**健康模块才是家庭共享的前置**（它现在还是空壳）。

**抄作业清单（别自研）**：

- 同步层的形态抄 **SiYuan 思源笔记**（本地内核 + 可选端到端加密同步 + Docker + 桌面/手机），这是与目标最像的开源项目
- 健康/饮食的数据模型抄 **wger**（workout + 营养 + 体重，多用户，REST API）；食物库直接用 **Open Food Facts**
- 共享权限的交互抄 **Apple Health 共享**（自己勾要共享哪些数据类型、最多 5 人、随时可停）+ **Immich Partner Sharing**（整体或选定部分开放给指定用户）
- 账户后端优先考虑 **PocketBase**（单二进制、自带账号与权限、**备份=拷一个文件**）；Supabase 自托管要 12+ 个容器、Appwrite 约 15 个，家庭规模不值当

**没抄到的**：没有任何开源项目同时做「饮食作息 + 家庭共享」，这一层得自己造——但权限模型的形状照抄上面两家。

**伦理红线（写下来免得以后忘）**：「关注父母饮食」离「监控父母」只有一步。任何「我默认能看到他们什么」的设计都算越线。

## 14. 记忆库交接（2026-10-20 搬迁到 `D:\File\idea\trae\starburst_recorder`）

工具自带的记忆库是按**工作区路径**索引的（文件夹名 = 路径 + 路径哈希），换路径后就读不到旧的那一份。
原始记忆文件仍留在旧路径的记忆库里（没有删），但**从今往后只认这份文档**——所以把记忆里还没写进本文件的约定摘到下面。

**长期计划与方法论**

- 以后用 **GitHub Pages** 做项目官网
- **动手做新功能前，先去 GitHub 找同类开源项目**；有成熟实现就抄作业，不自研（清单见 §13）
- 项目数据存在浏览器/桌面/手机的各自配置目录里，**不在项目文件夹内**；跨机器搬迁只能靠「导出 → 导入」

**界面补充约定（§5 之外的）**

- 导航栏要有分隔线；**品牌标题区与首页入口之间那条分隔线单独处理**；品牌区背景比导航其他区域更深，且跟随主题色
- 日记列表条目与编辑页内容区是**四边封闭的完全矩形**，不是只用分割线
- 日记编辑页日期行三栏：**日期靠左、星期居中、天气按钮靠右**
- 日记模块功能按钮**两端对齐**：左侧「新增 / 图片导入 / 批量」，右侧「回收站」
- 日记锁定态靠**纸面压暗**区分，不加额外文字说明
- 日期选择器：选中日要有显眼的矩形底色；点年月可手动输入；底部要有「回到今日」
- 全局提示条是通用机制，各类操作结果提示都复用它

**原始记忆已落到本机、不进仓库（2026-10-20 追加）**

旧记忆库里的原始文件已**原样搬到 `.venv/ai-memory/`**（与源逐份哈希一致）：`project_memory.md`（硬约束 / 工程约定 / 教训）+ `2026-10-18`、`2026-10-19`、`2026-10-20` 三天的 `topics.md` 与 `session_memory_*.jsonl`。

**定位：AI 记忆属于本机环境资料，不是项目开发内容，所以不提交**（`.gitignore` 已忽略 `.venv/`）。好处是与 Trae 的路径索引解绑——**换路径照样能读**（代价是不随仓库分发，换机器要把这个文件夹一起带走）。习惯上仍以本文件为**人读版**依据，`.venv/ai-memory/` 是**原件存档**。

（另：Trae 的**会话正文**存在 `%APPDATA%\Trae CN\ModularData\ai-agent\database.db`，该库**已加密**，本地读不出也搬不了；会话快照按会话 id 存在 `snapshot\<sessionId>\v2\.git`，不受路径影响。）

## 15. 当前状态快照（2026-10-20 搬迁会话结束时）

**这一节的用途**：旧目录那条会话在搬迁后就被删掉了，所以把「此刻改动到哪、下一步干什么」定格在这里。

**工作区有一批未提交的改动**（上次提交是 `395bbc4` 数据与备份）：

| 改动 | 说明 |
|---|---|
| `capacitor.config.ts`（新） | 手机壳配置，`appId` 与桌面端共用 `com.starburst.recorder` |
| `android/`（新，未进仓库） | Capacitor 生成的 Android 工程；**要不要进仓库、`android/app/build` 与 `.gradle` 怎么忽略，还没定** |
| `src/core/db/live.ts`（新） | **数据层留口**：页面订阅数据一律从这里拿，以后换存储只改这个文件 + `db.ts` + `diaryRepo.ts` |
| 7 个页面文件 | import 从 `dexie-react-hooks` 改到 `live.ts`（纯改名，无行为变化） |
| `package.json` / `package-lock.json` | Capacitor 相关依赖 |
| `src/shared/ui/` 一批（新） | **壳与共用件的封装（2026-10-21）**：`Modal`（弹窗外壳，5 个弹窗改走它）、`PageShell`（原 `SettingSubPage` 改名）/ `Page` / `PageHeader`（容器与页头拆开）、`inputStyles`（输入框外观）、`overlayStack` + `useOverlayEntry`（覆盖层登记簿，供返回键用） |
| `src/app/androidBack.ts`（新） | 安卓实体返回键的口径与接线（纯函数 + hook，见下方「手机端」那条） |
| 各页面的返回入口 | 统一换成实心红 `BACK_BUTTON`（PageShell / 日记编辑页 / 回收站三处），`SOLID_BUTTON` 只留给「新增 / 记一笔 / 保存」这类主操作 |

**手机端（Capacitor）已验证到哪**：

- 已能构建并装机跑通：`assembleDebug` 成功后 `adb install` 到雷电模拟器（`emulator-5554`，Android 14 / API 34），启动正常、界面完整、中文正常
- **从新路径可以「直接」构建，不再需要 `D:\sb_probe` 那条联接**（37 秒，123 个任务）

**手机端剩余待做**（按优先顺序）：

1. ✅ **应用图标（2026-10-20 完成）**——设计定为「星尘轨道 + 黑洞镂空 + 中心星芒」，脚本换成 `package/icons/make-icons.ps1`（一套画法出全端、透明底、每档单独渲染）。Windows `.ico` 六档 + Android legacy PNG 五档都已生成并实测：从新 APK 里抠出来的图标 **192×192、透明 86.9%、四角 alpha 全 0**。**Android 的自适应图标是刻意不上**（背景层必须不透明，就失去透明剪影），详见 §3「应用图标」
2. ✅ **实体返回键接到路由（2026-10-21 完成）**——口径：**先关弹窗 → 再回上一级 → 到了首页再按一次退出**（弹窗与助手的抽屉都登记进 `shared/ui/overlayStack.ts` 这份覆盖层登记簿；退出只认 2 秒窗口，提示复用全局提示条）。代码在 `src/app/androidBack.ts`：`createBackHandler` 是不碰 React / Capacitor 的**纯函数**，所以口径能在 dev 控制台里直接跑。**已验**：8 项断言全过（弹窗优先、关不掉的层会挡住返回键、无历史时回首页兜底、两次按退出的窗口与过期重算）。**未验**：无。真机（雷电模拟器 Android 14 / API 34）已按四条口径全验：首页按一次只提示不退出、子页按一次回上一级、弹窗开着时只关弹窗、首页 2 秒内连按两次退出到桌面（2026-10-21 验完）
3. ✅ **状态栏 / 刘海安全区（2026-10-21 完成）**——关键发现：**Capacitor 8 自带 `SystemBars` 插件**（logcat 里能看到 `Registering plugin instance: SystemBars`），不需要再装 `@capacitor/status-bar`。它的 `style` 默认是 `DEFAULT`＝跟着**系统**深浅模式走，我们的应用固定深色主题，于是系统浅色时就成了「浅灰条 + 深色图标」——那条突兀的灰条是这么来的，不是我们的 CSS。修法三处：① `capacitor.config.ts` 的 `plugins.SystemBars.style = 'dark'`（深底浅图标）+ `initialViewportFitValueHint: 'cover'`（一上来就按 viewport-fit=cover 处理，省一次重排）；② `styles.xml` 的 `windowBackground` 也给 `#0a0d12`（窗口底色露出来时不是浅灰）；③ 页面侧 `AppShell` 加 `pt/pl/pr-[env(safe-area-inset-*)]`，配合已有的 `viewport-fit=cover`，Android 15 强制边到边时由它把内容让开（底部仍归 nav 的 `pb`）。另加 `windowLayoutInDisplayCutoutMode=shortEdges`，横屏可画进刘海、靠左右 inset 让位。**已知取舍**：状态栏颜色是钉死的深色，应用切到浅色主题时状态栏仍是深的（图标浅色，读得清）；要跟着主题变，就得从 JS 调 `SystemBars.setStyle`。
4. ✅ **导出在 WebView 里可用（2026-10-21 完成）**——**发现真 bug**：原来全站导出都用 `<a download>` + blob，安卓 WebView **根本不处理**（blob 生成了、`a.click()` 也执行了，`/sdcard/Download` 里什么都没有），而提示条照样说"已导出"——等于骗用户。修法：给安卓写了一个小型原生插件 `SaveFilePlugin`（`android/app/src/main/java/com/starburst/recorder/`），走系统自带的 **SAF 保存对话框**（`ACTION_CREATE_DOCUMENT`）：用户在系统里挑位置、我们只负责写字节，**不需要任何存储权限、也不依赖装了哪些 App**。
   - 为什么不用分享面板（`@capacitor/share`）：实测这台机器上没有任何应用能接收 `application/json`，面板直接提示「没有应用可执行此操作」——备份能不能存下来居然取决于装了啥。已把 share / filesystem 依赖卸掉，只留这个自写插件。
   - 为什么不用 Filesystem 写公共目录：Android 11 起分区存储，公共 Documents/Downloads 不给写（要么 `MANAGE_EXTERNAL_STORAGE`，Play 会拒）。
   - **已验（真机/模拟器端到端）**：点「导出全部数据」→ 弹系统保存框（默认目录「下载」、文件名带时间戳）→ 点保存 → 文件真的落到 `/sdcard/Download/星芒记录者-备份-*.json`（内容为合法 UTF-8 JSON）→ 返回应用、路由不丢 → 提示条「**已保存** 全部数据：…」；在保存框里按返回 → 提示条「**没有保存**：你在保存对话框里取消了…」。浏览器 / Windows 桌面壳仍走原来的 `<a download>`。
   - 文案也跟着改准了：不再说"文件会直接下载下来"，改成"手机上弹系统保存框、电脑上直接下载"。
5. ✅ **手机端收尾全部做完（2026-10-21）**——图标、实体返回键、状态栏/安全区、导出可用，四项都已在本机模拟器上端到端验过。

- **性能：别凭感觉调，先量（2026-10-21）**。手机壳开了 WebView 远程调试（`webContentsDebuggingEnabled: true`），于是可以直接用 DevTools 协议量真实帧间隔：
  ```
  $p = (adb shell pidof com.starburst.recorder).Trim()
  adb forward tcp:9222 localabstract:webview_devtools_remote_$p
  # 然后 node 脚本连 ws://127.0.0.1:9222/json/list 里的 webSocketDebuggerUrl
  ```
  批量测出来的事实：静止 / 路由切换 / 30 与 200 张纸条滚动 / 4x CPU 降速，**全部 8.3ms 满帧、零掉帧**；冷启动首绘 108ms、无长任务。**逐项交互（点「日记」日期开弹窗、关弹窗、切随记/日记标签、进主题页、返回上一级、进设置菜单）点完到画出下一帧都是 15～17ms，即恰好 2 帧（1 帧处理 + 1 帧绘制），全程零长任务**——这已经是 120Hz 下 React 应用的地板，没有可再压的余量。**唯一的真问题是两处**，都已修：
  1. **`.ruled` 的 `background-attachment: local`**：横线区不自己滚动（是外层 `.sb-scroll` 在滚），`local` 只会让外层每滚一帧重绘整块横线 → 实测滚动时掉一帧（33ms）。删掉后 196 帧零掉帧，视觉完全一样。
  2. **日记编辑器的 `textarea` 自己内部滚动**（`rows={16}`，可视 512px、内容 1856px）：三个后果——横线格与文字对不上、手机上在框内拖动滚的是输入框（"卡住"的感觉）、长日记变两层滚动。加 `field-sizing-content` 让输入框随内容长高、整页滚，`rows={16}` 留给不支持的引擎兜底。修完横线对齐、长文滚动零掉帧。
  > 结论口径：**体感卡 ≠ 应用掉帧**。雷电把虚拟屏幕报成 120Hz（每帧 8.3ms 预算），而宿主窗口若只有 60Hz，就会看到"隔帧"的顿感；SurfaceFlinger 采样确认应用确实以 8.3ms 稳定出帧。要判断是不是应用的问题，先跑上面这套量法，别看模拟器窗口的感受。

**环境快照**：dev server 在 5173 常驻（用户要求别停）；模拟器 `emulator-5554`（横屏 1280×720，可 `settings put system user_rotation 3` 转竖屏验手机布局）；`JAVA_HOME` 必须显式指到 `C:\Program Files\Java\jdk-21`（系统默认是 1.8）；`adb` 在 `D:\Android\Sdk\platform-tools`；雷电装在 `C:\leidian\LDPlayer14`（启停用 `ldconsole.exe launch/kill --index 0`）；**改完 web 代码要 `npm run build` → `npx cap copy android` → `gradlew assembleDebug` → `adb install -r` 才进得去手机**。

- **悬浮球默认隐藏（2026-10-21 改）**：它现在是**占位**（点开只会说"AI 还没接入"），摆在右下角既是误导、又容易被当成多出来的鼠标指针（它带 `cursor-grab`，悬停时鼠标变抓取手型），所以平时不渲染。想看它：地址加参数 `?ball=1`（如 `http://localhost:5173/?ball=1#/diary`），或控制台 `localStorage.setItem('starburst.debug.ball','1')` 后刷新；关掉就 `removeItem`。开关都在 `src/app/debugFlags.ts`，**默认全关**——以后再加调试开关往这里放，别散在页面里。

**可以清理但先别急**：旧目录 `D:\File\claude\` + 零宽字符 + `starburst_recorder`、以及临时联接 `D:\sb_probe`——等新路径这套全部收尾、你确认没问题之后再删。


