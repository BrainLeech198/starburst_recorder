# AGENTS.md

给在本仓库工作的 AI 代理与协作者的项目约定。

## 先读哪份文档

| 文档 | 什么时候读 |
| --- | --- |
| **`docs/PACKAGING-AND-RELEASE.md`** | **任何打包、签名、发版、凭证、推送相关操作之前必读** |
| `docs/PROJECT-NOTES.md` | 改架构、数据层、存储选型、UI 约定之前 |
| `docs/PWA-IOS.md` | 部署网页版、改 Service Worker、配 AI 代理、处理 iOS 兼容之前 |
| `worker/push/README.md` | 部署 / 排查 Web Push 中继（Cloudflare Worker + KV + Cron）之前 |
| `docs/ROADMAP.md` | 判断功能优先级与当前阶段 |
| `docs/TECH-DEBT.md` | 动手改架构 / 存储 / AI 子系统之前，先看已登记的框架债与四条待建闸门（含"已查过、没问题"的清单，免得重复劳动） |

打包/发版的命令、密钥位置、证书指纹、检查清单和已知坑，全部以 `docs/PACKAGING-AND-RELEASE.md` 为准，不要在别处另立一份。

## 常用命令

```bash
npm run dev              # 浏览器调试
npm run desktop          # 构建 + 打开 Electron
npm test                 # 单元测试（Vitest，Node 环境）
npm run typecheck
npm run lint
npm run desktop:installer  # Windows 安装包（需要 Inno Setup 6）
```

Android：`npm run build && npx cap sync android`，再到 `android/` 执行 `gradlew.bat assembleRelease`。
`JAVA_HOME` 必须指向 Android Studio 的 `jbr`。

## 不可违反

- **签名密钥只读**：`.local/keys/starburst-release.jks` 与 `keystore.properties` 不进 git、不重新生成、不替换；新凭证先问用户。
- **`.local/` 全部不进 git**：构建产物、安装包、截图、参考资料、密钥、Token。
- **提交信息不带 AI 标注**（`Co-Authored-By: Claude`、`Generated with` 都不要）。
- **主仓库是 Gitee（origin）**，GitHub 是自动镜像；日常只推 origin。
- 版本号只改 `package.json`（连同 `package-lock.json`），Android 版本由构建脚本派生。
- 不要提交构建产物或大体积二进制文件。
- **清理缓存只碰临时文件**：WebView / Chromium 的 HTTP 缓存与已下载的安装包；日记、随记、健康、收支、AI 配置和 `localStorage` 一律不许动。

## 多个 AI 并行时

- 仓库里可能同时有别的 AI（例如 CodeBuddy）在改同一份工作区：动手前先 `git status`，只改自己需要的文件，不跑全量格式化，不覆盖看不出用途的未提交改动。
- 工作区里不认识的未提交改动，当作他人进行中的工作；不回滚、不清理、不顺手一起提交。
- **发版期间由发版方临时占用** `package.json`、`package-lock.json`、`site/`、`docs/PACKAGING-AND-RELEASE.md`、`docs/PROJECT-NOTES.md`；另一位 AI 要改这些，先等发版收尾或先和用户确认，避免版本号与更新说明互相覆盖。
- 发版期间工作区里别人写完的改动会被一起打进安装包；不确定是否完成的改动，先在 `CODEBUDDY.md` 或对话里说明状态，不要半截提交。

### 并行提交三条硬规矩

> 起因：0.11.1 体检当天两路 AI 交错 `git add` / `commit` / `reset`，一路的 `reset --soft` 把另一路刚生成的提交从分支上摘掉了。命令本身没错，错在同一时刻有两方在动 HEAD。

1. **同一时刻只有一方可以提交。** 提交前确认另一路没在收尾；拿不准就先问用户，别赌。
2. **提交前先看 `git log -1`。** 哈希不是自己上次看到的那个，说明 HEAD 已经被别人推进过，重新对齐范围再动。
3. **共享分支上禁止 `reset` / `stash`。** 要只提自己那几个文件，一律用 pathspec 形式：`git commit -m "..." -- <路径1> <路径2>`——它绕开索引里别人 staged 的内容，也不会改动任何人的 HEAD。

## 技术底线

- 一套 React 源码同时进 Electron 与 Capacitor；桌面用 SQLite，浏览器 / Android 用 Dexie + IndexedDB。
- 壳层固定一屏高，只有内容区滚动；禁止整页视口滚动。
- 覆盖层（弹窗、灯箱、抽屉）一律 `createPortal` 到 `document.body`：挂在内容区里会被 `.sb-scroll` 的堆叠上下文困住，安卓上被底部导航压住。新弹窗走 `shared/ui/Modal.tsx`。
- 用户可见文案必须走 `src/shared/i18n`：`zh.ts` 是 key 真源，`en / zhTW / ja / ko / de / fr / ru / es` 八份消息表要同步补齐（`{name}` 占位符保持一致）；组件外用 `translate()`，别在模块里写死中文。
- 动画与氛围效果必须尊重 `prefers-reduced-motion`。
- 单元测试只测纯逻辑（Node 环境），通过 `node package/run-tests.cjs` 运行。

## 数据导入导出

- 备份里的图片是**内联 dataURL**，跟着记录走：导出、读回、合并冲突都必须带上；改这块先看 `src/core/db/normalize.ts` 的 `pickImages`。
- `electron/database.cjs` 的 SQL 是手写占位符：给表加列时，`db.prepare` 的列与每个 `.run()` 的参数必须一一对应。0.5.0 之前的替换导入就因为 `writeSections` 漏绑 `images`，直接炸在 `NOT NULL constraint failed`；只导随记时还会把参数整体错位。
- 改动导入导出至少要跑 `src/core/db/desktopImport.test.ts`（真实 SQLite 导出 → 写回往返）和 `src/features/diary/diaryBackup.test.ts`（备份文件读写）。

### 硬规矩：所有用户数据都必须能备份导出（2026-11-02 起）

**凡是用户自己攒出来的东西，都必须能导出、再原样导入回来。** 新加一类用户数据时，**同一批改动里**要把下面四件事做完，缺一不算完成：

1. **进备份**：数据库表 → 加进 `features/diary/diaryBackup.ts` 的 `BackupPayload` 与 `ALL_SECTIONS`；localStorage 偏好 → 加进 `features/settings/userPrefs.ts` 的 `PREF_GROUPS`。
2. **能导入**：`readBackup` / `applyPrefs` 收得回来；坏数据只丢那一条，**不许整份拒绝**（理由见 `diaryBackup.ts` 顶部注释）。
3. **有测试**：`diaryBackup.test.ts` 或 `userPrefs.test.ts` 补一条「导出 → 读回」往返；只测写不测读等于没测。
4. **界面看得见**：`DataPage` 的分区行与导入报告各补一条，九份语言表同步补齐（`{name}` 占位符保持一致）。

当前覆盖范围：日记 / 随记 / 天气 / 预设 / 日程 / 健康（档案含体重、食物、套餐、摄入、睡眠）/ 训练 / 收支 / AI 对话 / 偏好设置（外观、语言、关怀模式、助手记忆与技能、AI 模型、图片存法、天气地点、更新通道）。

**明确不进备份的**：只对本机有意义的瞬时状态——提醒弹过的日期标记、免责声明已读、调试开关、悬浮球拖动位置以外的窗口状态。判断口径是「换台设备后这条还有意义吗」。

**明文密钥**：AI 模型配置含 `apiKey`，备份照带（不带就等于换机必丢），但导出前必须提示「文件里有密钥」——判据是 `prefsContainSecrets`，别在别处另写一份。


## 改动完成后

至少跑一遍 `npm test`、`npm run typecheck`、`npm run lint`。
涉及打包或发版时，按 `docs/PACKAGING-AND-RELEASE.md` §4 的清单逐项核对。

## AI 协作与设置页规范

- Vibe Coding 的持久规则、验收标准、小步实施与独立复核：`D:\File\skills\vibe-coding-guardrails\SKILL.md`。涉及 AI 辅助代码改动时先遵循该流程；聊天记录不作为唯一规范来源。
- 设置页排版约定：`D:\File\skills\settings-layout\SKILL.md`。新增或调整设置界面时遵循紧凑偏好项左右排布、复杂表单上下排布、分组标题与留白层级，并检查窄屏可读性。
- 规则副本存于本机 `D:\File\skills`，便于复用；本仓库只记录路径与项目约束，不把本机技能目录纳入版本控制。
- 全量整改按模块分批：先盘点现状与风险，再逐批提出可追踪的改动单元；每批保留最小差异并说明验证。不得覆盖工作区中其他协作者的未提交改动，测试脚本不得为通过而弱化。
