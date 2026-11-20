# 星芒记录者 / Starburst Recorder

本地优先的个人记录 App：日记、随记、日程与打卡、健康、训练、收支都放在一处，也可以用自己配置的 AI 整理日记。无需注册账号。

## 当前版本与使用入口

- 当前稳定版：**0.22.0** · [版本说明与下载](https://gitee.com/Mr_brainleech/starburst_recorder/releases/tag/v0.22.0) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/tag/v0.22.0)
- 网页版 / PWA：[starburst-recorder.pages.dev](https://starburst-recorder.pages.dev/)
- 官网：[brainleech198.github.io/starburst_recorder](https://brainleech198.github.io/starburst_recorder/)
- 主仓库（Gitee）：[Mr_brainleech/starburst_recorder](https://gitee.com/Mr_brainleech/starburst_recorder)
- GitHub 镜像：[BrainLeech198/starburst_recorder](https://github.com/BrainLeech198/starburst_recorder)

## 功能

- 日记与随记，支持 AI 辅助整理
- 日程、重复计划、每日打卡与历史记录
- 健康记录：体重、饮食摄入与睡眠
- 训练记录与收支管理
- 按分区导出、加密和恢复个人数据
- Windows、Android 与可安装为 PWA 的网页版

## 数据与隐私

核心记录保存在当前设备，不提供账号或云同步。桌面端使用 SQLite；浏览器、PWA 和 Android 使用 IndexedDB。AI 功能只在你主动调用时连接设置中选择的模型服务，相关内容会发送给该服务。开启网页版后台提醒时，中继只接收提醒时间和类别，不接收日程标题或记录正文。

数据不会自动同步到其他设备，请定期从设置中的数据页面导出备份，并妥善保管备份文件。

## 本地开发

```bash
npm ci
npm run dev          # 浏览器调试（Vite）
npm run desktop      # 构建并打开 Electron
npm test             # 单元测试
npm run typecheck    # TypeScript 检查
npm run lint         # ESLint
```

Windows 安装包：`npm run desktop:installer`（需要 Inno Setup 6）。

Android：设置 `JAVA_HOME` 指向 Android Studio 自带的 `jbr`，然后执行：

```bash
npm run build
npx cap sync android
cd android
gradlew.bat assembleRelease
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/` | React 应用源码：存储、功能模块、路由、界面与多语言 |
| `electron/` | Electron 桌面主进程与预加载脚本 |
| `android/` | Capacitor Android 工程 |
| `site/` | GitHub Pages 官网静态文件 |
| `worker/push/` | 可选的 Web Push 提醒中继 |
| `docs/` | 架构、路线、PWA 与发版说明 |
| `.local/` | 本机产物、安装包、截图和密钥；不提交到 Git |

## 许可

MIT，见 [LICENSE](LICENSE)。
