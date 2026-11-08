# 星芒记录者 · 框架债清单（技术优化用）

> 来源：2026-11-02 一次全量代码体检（数据层 / UI 层 / AI 子系统 / 工程基建四路 + 闸门实跑）。
> 测量基线：**工作区 HEAD `d3867a3`，版本 0.11.1，但工作区不干净**——另一路改动正在扩全局搜索
> （`src/core/db/store.ts` 的 `SearchResults` 从 4 类改 10 类、新增 `src/core/search/match.ts`）、`site/` 三文件同步在改。
> 因此凡是涉及 `SearchPage.tsx` / `store.ts` / `database.cjs` 的行号，等那批改动落地后要重新对一遍。
>
> **为什么不写进 `docs/PROJECT-NOTES.md`**：发版期间 `PROJECT-NOTES.md`、`site/`、`package.json` 由发版方占用
> （见 AGENTS.md「多个 AI 并行时」）。这批结论先落在这里，等发版收尾再并进 PROJECT-NOTES。

## 0. 实跑结果（闸门现状）

| 项 | 结果 |
|---|---|
| `npm test` | 47 个文件 / **515 用例全过**，3.1s；vitest 提示 `isolate: false` 可再省约 1.4s |
| `npm run typecheck` | 干净（但 `tsconfig.json` 的 `include` 只有 `src`，**`electron/*.cjs` 完全不进类型检查**） |
| `npm run lint` | 干净 |
| `npm audit --omit=dev` | **0 漏洞**；全量 32 条（31 中 1 高）全在 dev 链（`uuid<11.1.1` 经 `@capacitor/cli`→xcode、`ejs`/`jake`） |
| 覆盖率 | 无配置，无数字 |

结论：三道闸门全绿，说明**问题不在"代码写崩了"，在"闸门测不到的地方"**——下面每一条都给了代码证据。

## 1. 第 0 档：已经在骗用户的 bug（全部 S，建议本周内修完）

1. **彻底删除后界面不刷新。** ✅ **已修（`cb4d1dd`）**。变更总线白名单 [src/core/db/changes.ts](../src/core/db/changes.ts) 漏登记
   `purgeIntake` / `purgeTrashedIntakes` / `purgeFinance` / `purgeTrashedFinance`，而
   [FinanceTrashPage.tsx:47](../src/features/finance/FinanceTrashPage.tsx) 与摄入回收站页正在调用 → 删完不收行，
   要等下一次别处的写才恢复。
   口径：把 `store.ts` 契约里的 93 个写方法逐一对过白名单，缺口只有这 4 个（其余命中是 `trashed*` 读方法的前缀误判）。
   同批补了第 2 节要的那道闸门：[src/core/db/changeBus.test.ts](../src/core/db/changeBus.test.ts) 双向比对契约与白名单。
2. **"删除必须确认"靠命名后缀判定。** ✅ **已修（2026-11-02）**。[assistantPermission.ts:34-55](../src/features/assistant/assistantPermission.ts)
   改成新增白名单：只有 `AUTO_CREATE_KINDS` 里的纯新增动作能在「新增自动保存」档免确认，
   `weatherEdit` / `sleepEdit` / `profileEdit` / `weigh` 等修改动作一律走确认；
   删除仍全部要求确认，并在 [assistantActions.ts:475](../src/features/assistant/assistantActions.ts) 落库前校验档案版本号，
   撤销快照可恢复档案与记忆。回归用例在 [assistantPermission.test.ts](../src/features/assistant/assistantPermission.test.ts)
   与 [assistantActionBuild.test.ts](../src/features/assistant/assistantActionBuild.test.ts)。同一条助手回复可由用户显式一次授权
   批量执行所有仍待确认的动作；批次仅限该回复，逐项执行并保存结果，不修改全局权限。用户也可选择逐条确认或取消本组。
3. **AI 请求生命周期与等待反馈。** ✅ 传输期限、取消句柄和助手「停止」按钮已接通：桌面主进程用
   [electron/aiRequest.cjs](../electron/aiRequest.cjs) 管理 5 分钟对话 / 20 秒模型列表期限；浏览器侧由
   [aiDeadline.ts](../src/features/ai/aiDeadline.ts) 合并调用方 signal 与兜底期限。2026-11-04 助手请求开始消费
   OpenAI 兼容 SSE：桌面通过 requestId 对应的 IPC 增量回传，浏览器直连边读边显示，已有代理缓冲的 SSE
   会在完整回包后解析。纯解码逻辑在 [aiStream.ts](../src/features/ai/aiStream.ts)，助手卸载会取消请求，
   重启后遗留的空助手占位会恢复成可重试状态。**仍有限制**：部署版 PWA 的薄代理会先读完整上游响应再包信封，
   因此还不能实时显示增量；要让该路径实时显示，需同步更新代理 Worker 的流式响应协议。429 仍只显示提示、不自动重试；
   各家模型的首 token 延迟与 SSE 兼容性仍需结合实际使用观测，不能由客户端保证。
4. **桌面端两个 IPC 缺纵深防御。** ✅ **已修（本轮）**。守卫集中在
   [electron/updateGuards.cjs](../electron/updateGuards.cjs)（纯函数，不起窗口就能测）：
   下载 URL 只认我们仓库的 GitHub release 路径与 Gitee 域、落盘文件名必须是安装包形状、
   安装路径只能落在「下载」目录**这一层**（`.part` 与子目录、`..\` 全否）。
   用例在 [src/features/update/updateGuards.test.ts](../src/features/update/updateGuards.test.ts)。
   **同处缺口仍在**：无 CSP（`index.html` 无 meta，`protocol.handle('app')` 不设响应头）、
   全仓无 `will-navigate` / `setWindowOpenHandler`。


## 2. 第 1 档：把"手工同步 N 份副本"变成机器检查（本轮最划算）

现在的漂移全靠人记住"那边也要改"。四条闸门能让这类错误变成编译期或 CI 失败：

| 闸门 | 治的漂移 | 改动量 |
|---|---|---|
| **Dexie / SQLite 双实现一致性测试**（同一组用例跑两边） | 排序漂移（`diaryPresets`：Dexie 用 `localeCompare`，SQLite 走二进制 `ORDER BY`，中文名两端序不同；`stampsOfDay`/`trainings` 同值无 tiebreak）；`mergeHealthFoods` 语义相反（SQLite 对回收站中的食物抛错，Dexie 不查 `deletedAt`）；**Dexie 侧目前 0 个测试** | L（要引 fake-indexeddb） |
| **变更总线白名单 = 契约写方法** 断言测试 | ✅ 已建（`cb4d1dd`，[changeBus.test.ts](../src/core/db/changeBus.test.ts)）：第 1 节第 1 条那类漏注册，永不再犯 | S |
| **i18n 孤儿 key 检查 + 动态 key 前缀白名单** | 现测得 **68 个孤儿 key**（×9 语言≈600 条死文案，含少量 `training.kind.${x}` 式动态 key 的可能误判）；key *完整性*已由类型兜住（[context.ts:39](../src/shared/i18n/context.ts) 是 `Record<MessageKey, string>`），缺的是反向检查与 `{name}` 占位符一致性 | S/M |
| **发版版本一致性脚本**（`package.json` ↔ `android/app/build.gradle` ↔ `site/notes.zh.md` ↔ 更新日志） | PACKAGING 文档自己列的"最容易错三处"目前全靠肉眼 | M |

规则双份实现（只靠注释同步）也在这一档：`cleanTags`（[normalize.ts:138](../src/core/db/normalize.ts) vs `database.cjs:246`）、
`collectTags` / `macrosFor` / `sumParts`（`dexieStore.ts:932-980` vs `database.cjs` 同名实现）；
SemVer 比较在 `main.cjs:459-507` 与 [core/utils/versionCompare.ts](../src/core/utils/versionCompare.ts) 各一份，只有后者有测试。

## 3. 第 2 档：结构性收敛（按"重复处数"排，不按行数）

| 项 | 证据 | 量 |
|---|---|---|
| 回收站 8 个页几乎逐字相同（睡眠/摄入/收支/训练/日程/食物/套餐…各 130–170 行） | 如 `SleepTrashPage.tsx:21/33/38/52` 与其他 7 页对照 | M，省约 800 行 |
| 记录级导入导出样板复制 5 处 | `WeightsPage.tsx:160-182`、`DataPage.tsx:600-643` 等 | S/M |
| 助手「加一个工具要改 7 处」（声明 / 执行 / 构建 / 描述 / 写库 / 撤销 / 白名单分散 4 文件） | `assistantTools.ts:47/204/503/1091`、`assistantActionBuild.ts:458/1242`、`assistantActions.ts:92/564`、`assistantChatStore.ts:83-115` | M |
| **给一张表加一列要改 8 处、4 个文件**（schema → db 版本 → `database.cjs` 建表+ALTER+列+占位符+行映射 → `normalize.ts` 的 `pick*`） | `schema.ts:149`、`database.cjs:100-121/674-749/908-932/1335-1356/403-427`、`normalize.ts:506-537`。0.5.0 那次 `NOT NULL constraint failed` 就是这条链断的 | L，唯一值得上集中列清单/代码生成的地方 |
| undo-toast 闭包每页手写（19 处 / 10 文件） | `WeightsPage.tsx:122-135`、`DiaryEditPage.tsx:557-591` | S |
| `localStorage` 键三套前缀并存、无登记表（47 处 / 17 文件：`starburst.*` / `sb_*` / `sb.*`） | `LEGACY_FLAG` 在 `DataPage.tsx:169`、`sb_image_quality` 在 `imageAssets.ts` | S（要迁移读旧键） |
| **助手会话与撤销快照存 localStorage，`persist()` 失败被 catch 后静默丢数据** | `assistantChatStore.ts:373-381`；附件 dataURL 单张上限 240 万字符（`assistantAttachments.ts:17`）；SQLite 侧完全没有会话表。**2026-11-02 已并入整库备份的「AI 对话」分区**，空会话不导出；存储仍在 localStorage，SQLite 仍无会话表 | M |
| 巨型组件：IntakeDialog 8 步状态机 + 29 个 `useState` | `IntakeDialog.tsx:92/168-221`；`DiaryEditPage.tsx:131-178`、`DataPage.tsx:487-496` 同型 | M/L，**建议排在闸门就位之后**：它不容易出错，拆分是纯体力活 |

错误边界只有根级一处（`router.tsx:61` 的 `errorElement` 挂 `'/'`），任一页 render 崩会连带整壳替换——补 per-feature errorElement 是 S。

## 4. 第 3 档：基建小项（便宜，顺手做）

- ESLint 分层只禁了别名形态（[eslint.config.js:63](../eslint.config.js) 是 `@/features/*`、`@/app/*`），**相对路径 `../../features/*` 不受限**；现无违例，规则形同虚设。patterns 补相对形态：S。
- `vitest.config.ts:16` 只 include `src/**/*.test.ts` → UI 组件 0、**Electron 主进程 0**（`database.cjs` 只被 `desktopImport.test.ts` 间接覆盖）、Android Java 0。至少给 `main.cjs` 里的纯函数（`normalizeRelease`、SemVer）建测试：M。
- TS 严格度已开 `strict`/`noUnused*`/`verbatimModuleSyntax`，缺 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`：M（开了会一次性冒出不少报错，建议单独一次提交）。
- CI 单 job 跑 lint/typecheck/test/build，无 `npm audit`、无 Electron/Android 打包、无产物校验：加 audit job 是 S。
- `dexie-react-hooks` 仍在 `package.json` 的 dependencies，src 里**只剩注释提到它**（`live.ts:30`、`changes.ts:4`）→ 死依赖，删：S。
- `src/assets/fonts/lxgw-wenkai-subset.woff2`（1.57MB）在 `src/` 与 `site/` 各存一份，可复用：S。
- 仓库无 >5MB 提交文件，`.gitignore` 覆盖 `.local/` 与 android 构建目录，这两项没问题。

## 5. 已经查过、结论是"没问题"的项（别再查一遍）

- 只读档与确认档在代码层强制（readonly 不给写工具 + `takeAction` 双检，`assistantAgent.ts:413-416/487-489`）。
- prompt 里没有 API key 与备份路径；错误文案只有 `explainFailure` 一处实现；图片只在末条消息发送。
- 全站用户可见中文残留 = 0（九份消息表 ×2059 key，key 集完全一致、无重复）；`alert(` = 0、`console.log` = 0、真 TODO/FIXME = 0。
- 取数统一走 `useLiveQuery`（99 处，兼容 SQLite 与 Dexie），分层是"repo 查询 / 页面格式化+提交"，未发现上帝 hook；
  `reduced-motion` 由 `index.css:93/780/831` 全局 `@media` 兜住，未见新页面退化。
- `Modal` 用 37 次，裸 `fixed inset-0` 仅 3 处且都是正当（Modal 自身 / 灯箱 / 悬浮球），`createPortal` 9 处全合规。
- `build.ps1` 与 `afterPack.cjs` 幂等无问题；`live.ts` 的竞态与卸载后 setState 已防（`live.ts:52-68`，缺点是查询异常被吞、每次写全量重跑订阅）。

## 6. 如果只做三件

1. 双实现一致性测试 + 变更总线白名单断言；
2. 第 1 节四条 bug；
3. 助手破坏性动作改为动作元数据门控（不再靠 kind 后缀）。

理由：1 是漂移的源头，2 今天就在骗用户，3 是"AI 能动手写库"这件事的信任底座。
代价：1 要新增 fake-indexeddb 依赖并补一轮两边行为对照，是三条里最慢且短期不出成果的一条。

## 7. 文档纠偏（发版收尾后一起做）

- [PROJECT-NOTES.md:7](./PROJECT-NOTES.md) 与 :383、:449、[ROADMAP.md:67](./ROADMAP.md) 的项目路径仍写 `D:\File\idea\trae\starburst_recorder`，实际是 `D:\File\idea\ai\starburst_recorder`。
- [PROJECT-NOTES.md:26](./PROJECT-NOTES.md)「手机 | Capacitor（尚未开始）」——android 工程早已进仓库并出过 APK。
- [PROJECT-NOTES.md:350](./PROJECT-NOTES.md)「未实现：健康 / 经济 / 日历三个占位模块」与 :343/:351「缺译文、下一步建 `en.ts`」——0.11.1 已全部上线，`messages/` 有 9 语言。
- [ROADMAP.md](./ROADMAP.md) 第 14 项（官网）、第 16 项（android 入库 + README）已完成未销账；第 16 项里"定我们自己的许可证"仍是开放问题（`package.json` 写 MIT，`LICENSE` 亦 MIT，但文档把它列为待办）。
- [PROJECT-NOTES.md:296](./PROJECT-NOTES.md) 明确记着"**不要全局快捷键**（不能影响其它软件）"；外部调研建议加热键时，这条要由用户拍板，AI 不得自行推翻。

## 8. 数据规模（2026-11-02 分析，详见 [PROJECT-NOTES.md](./PROJECT-NOTES.md)「数据规模」一节）

容量结论：单文件 SQLite 撑得住 GB 级，**不是瓶颈**；先撞墙的是「整库读进内存」与「单文件 JSON 备份」。
数字与分档方案见 PROJECT-NOTES，这里只登记要动的代码。

| 档 | 事项 | 触发条件 | 改动面 |
|---|---|---|---|
| **0（✅ 2026-11-09 完成）** | 图片摘要读取：日记 / 随记、食物 / 套餐、收支列表和搜索不把图片数据放进 UI 状态；回顾、助手、引用、睡眠批量列表及记录导入不为普通读取导出整库 | 无条件 | `core/db/store.ts`、Dexie / SQLite、日记 / 健康 / 收支、助手 / AI 回顾与记录导入 |
| 1 | 备份分卷（按年，单卷 ≤ 20 MB，导入识别多卷） | 库 > 80 MB 或图片 > 1500 张 | `diaryBackup.ts`、`DataPage`、`recordImport.ts` |
| 2 | 图片外置（附件表 + 文件系统，备份改 zip） | 库 > 150 MB | 数据层整体（软删除 / 回收站 / 导入导出全要重写图片寻址） |

0 档为什么算「正确性」而不是优化：`everyEntry()` 是 `SELECT *`，桌面上还要跨 IPC 序列化整库 base64，
库到 50 MB 时「全部记录」页会明显卡；它和备份能不能用是两件独立的事，不该一起等。2026-11-09 完成后，
SQLite 的摘要查询不选图片列，图片缩略图按需读取；完整备份仍保留原图。浏览器 / Android 的 IndexedDB 按对象读取，
Dexie 会在内存中映射时去掉图片字段，但 IndexedDB 仍需先克隆记录对象；若实际数据规模下这一步仍造成卡顿，
下一档应评估已登记的附件表迁移，避免在本次 patch 中改动现有备份 / 图片寻址契约。

### 8.1 「挑选记录导出」弹窗（2026-11-03 已做一半）

这个弹窗最容易先炸：它拿的是 `exportAllData()` 的**整库**，八类记录全在内存里，
一打开就要把每一类都摊成行、排一次序。

**已经改掉的（前端侧，不需要数据层配合）**

- 每类记录只在 `data` 变化时摊一次（`useMemo`），点复选框不再重算八类；
- 勾选状态换成 `Set`，行查重从 O(n²) 降到 O(1)；
- 列表按 40 行一批渲染，滚到底自动续（`IntersectionObserver` + 手动按钮兜底），
  行组件 `memo`，只有被点的那一行重画；
- 面板改成 flex 列：头部与底部固定、只有列表滚，底部操作栏不再是 `sticky`
  （安卓 WebView 上 sticky 会让列表文字从操作栏底下透出来）。

**还欠数据层这一步**

| 档 | 事项 | 触发条件 | 改动面 |
|---|---|---|---|
| 1（提前做） | 弹窗不再接收整库：`store.ts` 加 `countOf(kind)` 与 `pageOf(kind, from, limit, offset)`，弹窗按类分页取 | 单类 > 2000 条，或打开弹窗 > 500ms | `core/db/store.ts` 契约 + `dexieStore` / `sqliteStore` / `electron/database.cjs` 三处实现、`RecordExportDialog` 与 5 个入口（`DataPage`、`IntakesPage`、`SleepsPage`、`WeightsPage`、`FinancePage`） |

做完之后弹窗只认「当前这一类、当前这一页」，与 0 档的 `briefEntries()` 一起落地最省事：
两者都是「列表只要摘要、不要整库」的同一类需求。

