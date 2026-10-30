# AGENTS.md

给在本仓库工作的 AI 代理与协作者的项目约定。

## 先读哪份文档

| 文档 | 什么时候读 |
| --- | --- |
| **`docs/PACKAGING-AND-RELEASE.md`** | **任何打包、签名、发版、凭证、推送相关操作之前必读** |
| `docs/PROJECT-NOTES.md` | 改架构、数据层、存储选型、UI 约定之前 |
| `docs/ROADMAP.md` | 判断功能优先级与当前阶段 |

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

## 改动完成后

至少跑一遍 `npm test`、`npm run typecheck`、`npm run lint`。
涉及打包或发版时，按 `docs/PACKAGING-AND-RELEASE.md` §4 的清单逐项核对。
