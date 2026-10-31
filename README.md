# 星芒记录者 / Starburst Recorder

本地优先的个人记录工具，内置 AI：随手记一句今天，AI 整理成完整日记。不用注册、没有云端，数据只留在这台设备上。
Windows 与 Android 同源，一套 React 代码分别装进 Electron 和 Capacitor。

> 0.6.3 是早期版本：**日记**与**健康**已经能天天用，**财务**和**日历**还是占位页。

- 官网与下载：https://brainleech198.github.io/starburst_recorder/
- 主仓库（Gitee）：https://gitee.com/Mr_brainleech/starburst_recorder
- 镜像（GitHub）：https://github.com/BrainLeech198/starburst_recorder

## 本地开发

```bash
npm install
npm run dev          # 浏览器里调试（Vite）
npm run desktop      # 构建后打开 Electron 窗口
npm test             # 单元测试
npm run typecheck    # tsc
npm run lint         # eslint
```

Windows 安装包：`npm run desktop:installer`（需要 Inno Setup 6）。
Android：`npm run build && npx cap sync android`，再到 `android/` 里 `gradlew assembleRelease`（签名配置见 `.local/keys/`，不在仓库里）。

## 目录

| 路径 | 是什么 |
| --- | --- |
| `src/` | 应用源码：core（存储/工具）、features（日记、健康、AI…）、app（壳层与路由）、shared（i18n、UI） |
| `electron/` | 桌面主进程与预加载脚本 |
| `android/` | Capacitor 安卓工程 |
| `site/` | 官网静态页（纯 HTML/CSS/JS，GitHub Pages 托管） |
| `docs/` | 项目记录与路线：`docs/PROJECT-NOTES.md`、`docs/ROADMAP.md` |
| `.local/` | **不进 git** 的本机产物：构建结果、安装包、截图、参考资料、签名密钥 |

## 许可

MIT，见 [LICENSE](LICENSE)。
