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

## 技术底线

- 一套 React 源码同时进 Electron 与 Capacitor；桌面用 SQLite，浏览器 / Android 用 Dexie + IndexedDB。
- 壳层固定一屏高，只有内容区滚动；禁止整页视口滚动。
- 用户可见文案必须走 `src/shared/i18n`，中文与英文两份消息表保持同步。
- 动画与氛围效果必须尊重 `prefers-reduced-motion`。
- 单元测试只测纯逻辑（Node 环境），通过 `node package/run-tests.cjs` 运行。

## 改动完成后

至少跑一遍 `npm test`、`npm run typecheck`、`npm run lint`。
涉及打包或发版时，按 `docs/PACKAGING-AND-RELEASE.md` §4 的清单逐项核对。
