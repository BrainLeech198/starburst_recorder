# 星芒记录者 —— 项目交接与决策记录

> 这份文档的用途：把"只存在于对话里"的判断落成文字。
> 换机器、换会话、换工具之后，读这一份就能接手。
> 最近更新：2026-10-19

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
| 存储 | Dexie 4 + IndexedDB | 纯本地、零原生依赖、三种容器同一套代码（详见 §4） |
| 桌面 | **Electron** | 本机不需要装 Rust/MSVC 就能出成品；以后想换 Tauri 也很便宜（包的是同一份 `dist/`） |
| 手机 | **Capacitor**（尚未开始） | 同一份 web 代码套壳 |
| 字体子集化 | Python fonttools | 一次性工具，产物已在仓库里 |

### 明确不做的事

- **不发布 web 端**（但**开发调试仍然在浏览器跑 Vite**，这两件事是分开的）
- 不用 Python/pywebview 封装窗口（绕开既定路线、维护成本全在自己身上）
- 暂不换 SQLite（触发条件见 §10）

## 3. 打包（Windows 已完成，手机未开始）

### 命令

```bash
npm run dev              # 浏览器开发调试（最快的迭代方式）
npm run desktop          # 构建 + 打开桌面窗口
npm run desktop:installer # 完整安装包流水线
```

### Windows 安装包流程

```
package/windows/
├─ starburst-recorder.iss         Inno 脚本（安装界面细节）
├─ build.ps1                      流水线：构建 → 免安装目录 → 安装程序
├─ make-icon.ps1                  方图 → 六档尺寸 .ico
├─ icon.jpg / icon.ico            应用图标（四角星芒）
└─ languages/ChineseSimplified.isl 简体中文语言包（官方包不带，随仓库走）
```

产物：`package/windows/dist/starburst-recorder-<版本>-setup.exe`（约 112 MB）。
`release/`（免安装目录）和 `package/windows/dist/`（安装包）都已进 `.gitignore`。

**版本号、应用名、exe 名统一从 `package.json` 读**，由 `build.ps1` 用 `/D` 传给 Inno，避免两处各写一份。

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

会探测：`origin`、手写体是否加载、IndexedDB 能否读写、页面是否渲染。
**打包后必须跑一次**——asar 打包最容易出现"开发能跑、打包后白屏"。

## 4. 数据模型与"数据到底在哪"

**唯一真相源：`src/core/db/schema.ts`**（三张表 + 字段 + 索引见 `src/core/db/db.ts`）。

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
| 浏览器开发 | `http://localhost:5173` | 浏览器自己的 profile |
| 桌面程序 | `app://starburst` | `%APPDATA%\星芒记录者\`（Chromium profile） |
| 手机 App（将来） | `https://localhost` | App 私有目录 |

所以：**浏览器里攒的日记，打出来的桌面程序里一条也看不到**，搬家只能靠"导出 → 导入"。导出已做（Markdown / 纯文本 / JSON），**导入还没做**——这是当前数据闭环缺的那一半。

## 5. 界面与设计约定（最容易丢的部分）

- **主题**：默认「深空」，可切「浅色」。导航背景、强调色、悬浮球颜色**全部由主题色 `--sb-accent` 用 `color-mix` 派生**。
- **纸**：米白偏黄 `#f7f2e8`、**直角**、靠柔和投影从桌面托起来。浅色模式下桌面加深、纸用纯白。
- **纸色与墨色刻意不跟主题色变**：换主题色时纸仍然是纸。主题色只当点缀（按钮、贴纸描边）。
- **手写体**：霞鹜文楷，子集化为 GB2312 全字库（约 1.5 MB，7068 字），放在 `src/assets/fonts/` **交给 Vite 处理**（放 `public/` 会在桌面壳里 404）。
- **横线不贯穿**：线只在版心内，左右留页边距。
- **段首两个方格**不是装饰：它同时就是"首行缩进两字"的载体，缩进和视觉是一体的。
- **随记时间轴**：轴线**贯穿整张纸**、节点用**空心环**、只记今天时插入「现在」标记（每分钟自动走）。
- **天气小贴纸**：斜贴、图标链 + 全文。
- **按钮**：统一实心（主题色）+ 反色文字；**删除类一律用危险色红**，形状尺寸与主按钮一致。
- **页内栏目切换**：用 `shared/ui/Tab.tsx`，日记/随记/回收站三处共用。
- **删除保护**：任何删除都要二次确认，并在底部提示条给「撤销」。
- **批量多选**：顶部「批量」进入；选中态 = 描主题色 + 纸面染一点主题色 + 勾；操作在**底部悬浮工具条**（全选/反选/取消/删除/移动日期/导出/完成）。

## 6. 目录结构

```
src/
├─ main.tsx / index.css        入口 / 设计令牌 + 纸·时间轴·横线格等 CSS 类
├─ app/                        路由、主题、外壳、三个 Provider
├─ core/
│   ├─ db/                     db.ts（版本与索引）+ schema.ts（三张表类型）
│   └─ utils/                  id.ts（ULID、短编号）、dateKey.ts（日期与格式化）
├─ features/
│   ├─ diary/                  日记 + 随记 + 回收站 + 导出（全部在这）
│   └─ home / health / finance / calendar / me / settings / assistant
└─ shared/ui/                  ConfirmDialog、Tab、buttonStyles
electron/                      main.cjs（主进程）+ preload.cjs
package/windows/               Inno 打包相关
```

## 7. 已实现 / 未实现

**已实现**
- 普通日记：列表 / 编辑 / 自动保存（600ms 防抖）/ 锁定只读视图（按自然段渲染作文纸）/ 按天天气
- **随记**：一天一份的时间轴，时间可点改、按时间自动排序、"现在"标记
- **回收站**：日记与随记**分开**（页内切换、各自清空），支持恢复 / 彻底删除
- **批量多选**：日记列表（全选/反选/取消、批量删除可撤销、移动日期、导出三格式）
- **导出**：Markdown / 纯文本 / JSON，浏览器直接下载
- 主题（深空 / 浅色）+ 主题色色板
- 悬浮球（桌宠，会自动贴边半藏）
- **Windows 桌面程序**：能跑、能打包成中文向导的安装程序

**未实现**
- **导入**（补齐数据闭环，优先级高）
- 手机 APK（Capacitor 尚未接入）
- 图片导入（占位）
- 天气查询（想接 Open-Meteo，免费无 Key、能查历史）
- AI 网关（模型配置页 + 测试连接）
- 健康 / 经济 / 日历三个占位模块
- 应用图标还没给 Android 准备

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

## 10. 被否决的方案（别再走一遍）

| 方案 | 为什么否决 |
|---|---|
| 发布 web 端 | 明确只做 Windows + Android 两种程序 |
| Python + pywebview 封装 | 产物大小/内存不比 Electron 好，维护成本全落到自己身上 |
| Inno Setup 直接"把网页做成程序" | 它只是安装包生成器，必须已有 exe 才有意义 |
| 现在换 SQLite | 见下 |
| `file://` 加载页面 | origin 是 opaque，存储/模块/网络都会出问题 |

### 换 SQLite 的触发条件（三者出现任一即可做）

1. 开始担心数据丢，想要"能自己复制一个文件备份"
2. 数据量上去，需要复杂查询 / 全文检索
3. AI 要频繁扫大量历史做统计

**如果要做，范围是**：桌面端 `better-sqlite3`（原生模块，需为 Electron 重编）或 `node:sqlite`；手机端 `@capacitor-community/sqlite`；浏览器开发环境需要兜底 → 因此**必须先加一层存储抽象**；要重写 `diaryRepo.ts` 全部函数，并自己实现 `useLiveQuery` 那套"表变界面变"的机制（SQLite 没有）。老数据靠"导出 JSON → 导入"搬。

## 11. 下一步候选

1. **手机 APK**（Capacitor，环境已全齐）
2. **导入**（补齐数据闭环，换 SQLite 的前置）
3. **换 SQLite**（独立里程碑，范围见 §10）
4. 天气查询（Open-Meteo）/ 图片导入 / AI 网关

## 12. 协作约定

- **小步走**：一次只做一小步，做完实测给你看，别一次性铺开
- **未经许可不提交**；提交时 commit message 写清"为什么"
- 功能入口配 emoji / 图标
- 界面分隔线、行线长度**不写死**，按显示宽度自适应
- 删除操作：全局危险色 + 二次确认 + 撤销提示条
- 动手前先把设计讲清楚，等你拍板
