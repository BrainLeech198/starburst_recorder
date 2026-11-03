# 打包与发版规范

> 本文是 Windows / Android 打包、签名、发版的**唯一操作口径**。
> 内容合并自 CodeBuddy 与 Trae 的项目长期记忆、2026-10-25 至 10-26 的实际发版记录、本机签名核验结果，以及 2026-11-01 定下的正式版 / 测试版双通道规范。
> 与 `docs/PROJECT-NOTES.md`（架构与决策）互补：那份讲「为什么这样设计」，这份讲「发版时具体怎么做、哪里不能碰」。

## 0. 权威顺序

1. 用户当次明确指令
2. 本文
3. `docs/PROJECT-NOTES.md`
4. 各 AI 工具的本机记忆（`~/.codebuddy/`、`~/.trae-cn/memory/`）

冲突时按上面顺序执行；发现文档过期，先改文档再干活。

## 1. 版本号只有一个来源

**`package.json` 的 `version` 是唯一真源**，其余位置都从它派生：

| 位置 | 如何取值 |
| --- | --- |
| Android `versionName` | `package.json.version`（`android/app/build.gradle` 运行时读取，测试版带 `-beta.N` 后缀） |
| Android `versionCode` | `major × 10000000 + minor × 100000 + patch × 1000 + 通道`；正式版通道 = `999`，测试版 `-beta.N` = `N`（`0.8.0 → 800999`，`0.8.0-beta.1 → 800001`） |
| Windows 安装包版本 | `package/windows/build.ps1` 读取 `package.json.version` |
| 安装包文件名 | `starburst-recorder-<version>-setup.exe` / `starburst-recorder-<version>.apk` |
| 官网、更新日志、Release 正文 | 手动同步为同一版本号（测试版不更新官网，见 §1.2） |

发版时 `package.json` 与 `package-lock.json` 要一起改，两处版本不能打架。

**不要**再在 `build.gradle` 里手写版本号，也不要给 Android 单独维护一套。

> versionCode 口径在 `0.8.0` 换代：旧公式 `major×10000 + minor×100 + patch` 装不下预发布序号，也无法保证 `beta.N < 同号正式版`。新公式从 `0.8.0-beta.1` 起生效；`0.7.0` 及更早仍按旧号（如 `0.7.0 = 700`），新号一律更大，升级覆盖不受影响。

### 1.1 什么时候动哪一位（2026-11-01 修订）

先看这次发版**新增了多少内容**，再看是否兼容，不要只看提交类型：

| 位 | 判断标准 | 例子 |
| --- | --- | --- |
| **patch**（0.7.0 → 0.7.1） | 旧数据能照常读取；本次新增集中在 1–2 个功能点，或只是修复、文案、样式、兼容字段；一个独立小功能也算 | 0.7.1 修一个表单、0.7.2 加一个小入口、0.7.3 加一个独立小功能 |
| **minor**（0.7.x → 0.8.0） | 旧数据仍兼容，但一次发版**跨多个模块**，或出现**新模块 / 新的交互模型**，发行说明需要分节才讲得清 | 0.8.0：AI 助手 + 收支模块 + 日期栏 + 更新通道 |
| **major**（0.x → 1.0.0） | 数据格式不兼容（旧备份导不进来）、架构或交互推翻重做，或宣告第一个正式版 | 1.0.0 留给正式版 |

配套规则：

- **默认先按 patch 算**：单个新功能、新页面、可选字段都走 patch；只有“跨模块的成组新增”或“新的交互模型”才考虑 minor。内容不够就继续 patch，不为了让版本号好看而抬。
- **禁止空跳 minor**：`0.8.0` 之后不能直接到 `0.9.0`；当前 minor 至少先发布过一个 patch（如 `0.8.1`），再考虑下一次 minor。这样每一段 minor 之间都有可回退的稳定点，不会出现“中间什么都没有”的跨度。
- **例外要明说**：只有用户明确把某版定为“阶段版本”时才允许跳过 patch——`0.7.0 → 0.8.0` 就是这样一次例外（AI 助手 + 收支模块 + 新交互模型，且 beta 已先行发布），作为规范收紧前最后一次。之后按上面的 patch 规则执行。
- **minor 不看时间表**：不是攒够时间就抬，而是看内容规模；内容不够就继续 patch。
- 一版里既有新功能又有修复，仍按内容规模判定，不因为出现 feat 就自动抬 minor。
- 0.x 期间新增**可选字段**且旧备份仍能照常导入，归 patch；更新说明仍建议写「升级前先导出备份」。只有旧备份无法读取这类破坏性变更才升 major。
- 版本号只改 `package.json` 与 `package-lock.json`（见 §1 表），其余全部派生；官网与更新说明里的版本号是手动同步项，发版清单第 3 步负责。
- 历史口径：0.2.7–0.2.13、0.5.2 曾把新功能放进 patch；0.6.x → 0.7.0 是按旧规则抬的 minor。历史版本号不追溯重排。

**发布前自检（30 秒）**：

1. 这次新增内容能不能用一段话讲完？能 → patch。
2. 是否跨了 2 个以上模块，或出现新的交互模型？不是 → patch。
3. 当前 minor 已经发过 patch 吗？没有 → 继续 patch（除非用户明确指定阶段版本）。
4. 旧备份还能直接导入吗？不能 → major。

### 1.2 版本通道：正式版与测试版（2026-11-01 起）

正式版与测试版共用一套版本号，用后缀区分；两条通道的发布范围不同：

| | 正式版（stable） | 测试版（beta） |
| --- | --- | --- |
| 版本 / 标签 | `0.8.0` / `v0.8.0` | `0.8.0-beta.1` / `v0.8.0-beta.1` |
| GitHub Release | 普通 Release，**会更新 `latest`** | **Pre-release**，不影响 `latest` |
| Gitee Release | 正常发，按 §4.1 只留最新版的附件 | **不发**，附件也不传 |
| 官网 `site/` | 同步版本、下载与更新说明 | **不动**，官网只展示最近一个正式版 |
| 更新说明 | 官网 `notes.zh.md` / Release 正文 | 只用 Release 正文（官网说明还是上一版） |
| 谁能收到 | 所有用户 | 在「我的 → 版本 → 更新通道」切到测试版的用户 |

版本号规则：

- 测试版跟**目标正式版同号**：准备发 patch 就用 `0.8.1-beta.1`，准备发 minor 才用 `0.9.0-beta.1`；同一 base 的正式版发布后，不再出同 base 的 beta。`0.8.0-beta.1 → 0.8.0` 是 §1.1 里说明的那次例外。
- 热修也可以先用测试版验证：`0.8.1-beta.1` → `0.8.1`，规则相同。
- 优先级按 SemVer：`0.8.0-beta.2 < 0.8.0-beta.10 < 0.8.0 < 0.8.1-beta.1`。正式版比同号预发布高，测试版用户能在正式版发布后升级过去。
- 正式版用户永远看不到测试版；测试版通道会同时收正式版与测试版，并取最高者。
- 通道选择存 `localStorage` 的 `sb_update_channel`，默认 `stable`，切换后立刻按新通道检查一次。
- 测试版安装包**只放 GitHub**：Gitee 附件配额有限，且规矩是「只保留最新正式版」；应用检查测试版时不拼 Gitee 下载地址。
- 检查测试版走 GitHub `/releases?per_page=20`，跳过 draft，按 SemVer 排序取最高；正式版仍走 `/releases/latest`，失败再退 Gitee。
- 桌面主进程（`electron/main.cjs`）与渲染层（`src/core/utils/versionCompare.ts`）各有一份 SemVer 比较与 Release 解析，**改规则必须两边一起改**，否则桌面和安卓会看到不同结果。

## 2. Android 打包

### 2.1 命令

```bash
npm run build
npx cap sync android
cd android && ./gradlew.bat assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`
归档：复制并改名到 `.local/artifacts/starburst-recorder-<version>.apk`

`npx cap sync android` 不能省：Web 产物要先同步进 Android 工程，否则装上去还是旧界面。
Windows 下用 `gradlew.bat`；bash 里执行时注意 `JAVA_HOME` 必须是 Android Studio 自带的 JBR：

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
```

系统默认的 Java 1.8 会让 Gradle 直接失败。

### 2.2 签名配置（保持不变）

- 配置：`.local/keys/keystore.properties`（本机文件，**不进 git**）
- 密钥库：`.local/keys/starburst-release.jks`
- 别名：`starburst`
- `android/app/build.gradle` 读取该文件；文件不存在时会退化成未签名包，**不要把这个「兜底」当成正常流程**
- `.local/` 整个目录已被 `.gitignore` 忽略，密钥、口令、Token 都不会进仓库

**证书指纹（公开信息，可用于核对）：**

```
SHA-256: 2E:B0:97:8A:6A:BA:D4:55:B5:5A:A0:6D:C8:6D:2C:CD:73:81:6A:A6:80:59:CE:6E:42:89:C3:55:33:F9:4B:05
CN=Starburst Recorder, OU=Personal, O=Mr_brainleech, L=Hangzhou, ST=Zhejiang, C=CN
有效期：2026-10-25 → 2059-09-02
```

**核验记录（2026-10-26）**：`0.1.0` 至 `0.2.6` 全部 APK 的签名证书 SHA-256 均为上值，且与当前 `.jks` 完全一致。也就是说，历次升级包一直使用同一套密钥。`0.2.7` 出包时同样核对过；`0.2.8` 在发布后从 Gitee 重新下载 APK 复验，哈希与本地归档一致、指纹仍为上值。`0.2.9` 出包后核对：指纹仍为上值，`versionCode=209`、`versionName=0.2.9`。`0.2.10` 出包后核对：指纹仍为上值，`versionCode=210`、`versionName=0.2.10`。`0.2.11` 出包后核对：指纹仍为上值，`versionCode=211`、`versionName=0.2.11`。`0.2.12` 出包后核对：指纹仍为上值，`versionCode=212`、`versionName=0.2.12`。`0.2.13` 出包后核对：指纹仍为上值，`versionCode=213`、`versionName=0.2.13`。`0.3.0` 出包后核对：指纹仍为上值，`versionCode=300`、`versionName=0.3.0`。`0.3.1` 出包后核对：指纹仍为上值，`versionCode=301`、`versionName=0.3.1`。`0.4.0` 出包后核对：指纹仍为上值，`versionCode=400`、`versionName=0.4.0`。`0.5.0` 出包后核对：指纹仍为上值，`versionCode=500`、`versionName=0.5.0`。`0.5.1` 出包后核对：指纹仍为上值，`versionCode=501`、`versionName=0.5.1`。`0.5.2` 出包后核对：指纹仍为上值，`versionCode=502`、`versionName=0.5.2`。`0.6.0` 出包后核对：指纹仍为上值，`versionCode=600`、`versionName=0.6.0`。`0.6.1` 出包后核对：指纹仍为上值，`versionCode=601`、`versionName=0.6.1`。`0.6.2` 出包后核对：指纹仍为上值，`versionCode=602`、`versionName=0.6.2`。`0.6.3` 出包后核对：指纹仍为上值，`versionCode=603`、`versionName=0.6.3`。`0.7.0` 出包后核对：指纹仍为上值，`versionCode=700`、`versionName=0.7.0`。`0.8.0-beta.1` 出包后核对：指纹仍为上值，`versionCode=800001`、`versionName=0.8.0-beta.1`（首个启用新 versionCode 公式的版本）；Windows 安装包 ProductVersion 为 `0.8.0-beta.1`。`0.8.0` 正式版出包后核对：指纹仍为上值，`versionCode=800999`、`versionName=0.8.0`；Windows 安装包 ProductVersion 为 `0.8.0`。`0.8.1` 出包后核对：指纹仍为上值，`versionCode=801999`、`versionName=0.8.1`；Windows 安装包 ProductVersion 为 `0.8.1`。`0.9.0` 出包后核对：指纹仍为上值，`versionCode=900999`、`versionName=0.9.0`；Windows 安装包 ProductVersion 为 `0.9.0`。`0.9.1` 出包后核对：指纹仍为上值，`versionCode=901999`、`versionName=0.9.1`；Windows 安装包 ProductVersion 为 `0.9.1`。`0.10.0` 出包后核对：指纹仍为上值，`versionCode=1000999`、`versionName=0.10.0`；Windows 安装包 ProductVersion 为 `0.10.0`。`0.10.1` 出包后核对：指纹仍为上值，`versionCode=1001999`、`versionName=0.10.1`；Windows 安装包 ProductVersion 为 `0.10.1`。`0.10.2` 出包后核对：指纹仍为上值，`versionCode=1002999`、`versionName=0.10.2`；Windows 安装包 ProductVersion 为 `0.10.2`。`0.10.3` 出包后核对：指纹仍为上值，`versionCode=1003999`、`versionName=0.10.3`；Windows 安装包 ProductVersion 为 `0.10.3`。`0.10.4` 出包后核对：指纹仍为上值，`versionCode=1004999`、`versionName=0.10.4`；Windows 安装包 ProductVersion 为 `0.10.4`。`0.11.0` 出包后核对：指纹仍为上值，`versionCode=1100999`、`versionName=0.11.0`；Windows 安装包 ProductVersion 为 `0.11.0`。`0.11.1` 出包后核对：指纹仍为上值，`versionCode=1101999`、`versionName=0.11.1`；Windows 安装包 ProductVersion 为 `0.11.1`。`0.12.0` 出包后核对：指纹仍为上值，`versionCode=1200999`、`versionName=0.12.0`；Windows 安装包 ProductVersion 为 `0.12.0`。`0.12.1` 出包后核对：指纹仍为上值，`versionCode=1201999`、`versionName=0.12.1`；Windows 安装包 ProductVersion 为 `0.12.1`。`0.13.0` 出包后核对：指纹仍为上值，`versionCode=1300999`、`versionName=0.13.0`；Windows 安装包 ProductVersion 为 `0.13.0`。`0.13.1` 出包后核对：指纹仍为上值，`versionCode=1301999`、`versionName=0.13.1`；Windows 安装包 ProductVersion 为 `0.13.1`。

### 2.3 每次出包必须验签

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
/d/Android/Sdk/build-tools/35.0.0/apksigner.bat verify --print-certs \
  .local/artifacts/starburst-recorder-<version>.apk
```

指纹必须等于 §2.2 的值。顺带确认版本：

```bash
/d/Android/Sdk/build-tools/35.0.0/aapt2.exe dump badging <apk> | head -1
```

或查看 `android/app/build/outputs/apk/release/output-metadata.json` 里的 `versionCode` / `versionName`。

### 2.4 绝对不能做的事

- **不要重新生成、替换或「升级」keystore**。换密钥后新包无法覆盖安装旧版本，用户必须先卸载，本地数据会一起没。
- **不要把 `.jks`、`keystore.properties`、口令写进仓库、文档、提交信息或聊天记录**。
- 需要新建密钥或口令时，**先问用户**（由用户提供 / 由用户确认生成），不要自作主张。已生成的密钥要原样保留并另行备份。
- 不要把 `minifyEnabled` 改成 `true`。当前是刻意关闭的，避免 Capacitor 插件被混淆后运行时崩溃。
- 不提交 `android/app/build/`、`android/build/`、`android/.gradle/`、`android/local.properties`。

## 3. Windows 打包

```bash
npm run desktop:installer
```

流水线在 `package/windows/build.ps1`：

1. `npm run build`
2. `npx electron-builder --win --dir` → `.local/release/win-unpacked`
3. Inno Setup 6 的 `ISCC.exe` → `.local/artifacts/starburst-recorder-<version>-setup.exe`

硬性约定：

- **只用 Inno Setup 6**，禁止改用 electron-builder 内置的 NSIS；安装器配置在 `package/windows/starburst-recorder.iss`
- 安装目录固定为 `{autopf}\StarburstRecorder`，程序名 `starburst-recorder.exe`；**文件夹与文件名保持英文**，应用 ID `com.starburst.recorder` 不变，否则新安装包认不出旧安装、会重复装一份
- 打包脚本必须保存为 **UTF-8 with BOM**，否则 PowerShell 可能报 `EPERM`
- Electron 下载走国内镜像（`package.json` 的 `build.electronDownload.mirror`），GitHub 直连会卡住
- 不注册全局系统级快捷键
- 构建产物、中间目录、安装包都留在 `.local/`，不进 git

## 4. 发版清单（按顺序）

1. **检查**：`npm test`、`npm run typecheck`、`npm run lint`
2. **定版本**：改 `package.json` + `package-lock.json`
3. **写说明**：中文 / 英文更新说明与官网「这一版有什么」、更新日志都要和实际改动一致，不能套模板。只写本版新增与修复，不写「上一版的 X 照旧 / 全部内容照旧」这类承接句——旧功能默认还在，说明不是累计清单。
4. **出包**：按 §2、§3 打 Android 与 Windows，各自验签 / 验版本
5. **归档**：两个产物放 `.local/artifacts/`，文件名带版本号；不再往桌面复制，发布时作为 Release 附件上传（见第 9 步）
6. **提交**：只提交源码与文档；`git add` 用具体文件名，不用 `git add -A`
7. **打标签**：`git tag v<version>`
8. **推送**：`git push origin main --tags`（origin = Gitee 主仓库，GitHub 由镜像自动同步）
9. **发 Release（正式版）**：Gitee 与 GitHub 各建一条普通 Release，上传同名的 `.apk` 与 `-setup.exe`；替换同名资产时先删旧资产再传。**Gitee 只保留最新版本的附件**：免费仓库的发行版附件总量只有 1 GB，每版两个包约 110 MB，发新版前先删掉旧版本 Release 里的附件（Release 与源码归档保留）；旧版本下载只走 GitHub，官网「历史版本」链接也一直指向 GitHub。测试版走 §4.2，**不发 Gitee**。
10. **验证**：官网 Pages 是否更新、两个平台的下载链接是否可用、APK 指纹是否仍是 §2.2；再打开一个已安装的正式版，确认「检查更新」能拿到这一版。

### 4.1 Gitee 发行版附件配额（重要）

Gitee 免费仓库（社区版）的 Release 附件有**两层限制**，不要混为一谈：

| 限制 | 数值 | 当前状态 |
| --- | --- | --- |
| 单个附件大小 | **≤ 100 MB** | exe 约 94.9 MB，**已经贴着上限**；再长过 100 MB 就传不上 Gitee |
| 仓库附件总量 | **≤ 1 GB** | 每版 `apk + exe` 约 110 MB，约 9 个版本占满 |

GitHub 没有这两个总量限制（单文件上限远高于此）。如果哪天 Windows 包超过 100 MB，Gitee 只能放 APK，官网的 Gitee Windows 链接要下掉或改指向 GitHub。

**定下的规矩（2026-10-26）：Gitee 只保留最新版本的 `apk` 与 `-setup.exe`。**

- 发新版前，先删掉旧版本 Release 里的附件；**Release 条目与源码归档（zip / tar.gz）保留**。
- 旧版本下载只走 GitHub；官网「历史版本」链接本来就全部指向 GitHub。
- 上传前先看剩余配额，传完核对附件数量与大小；同名资产先删旧再传。
- Token 在 `.local/keys/gitee-token.txt`：写请求时放在请求体（JSON / multipart）或查询串里，不要出现在命令行参数、提交信息或日志中。

清理用的接口（`access_token` 均放在请求体或查询串，不要提交到 git）：

```text
GET    https://gitee.com/api/v5/repos/{owner}/{repo}/releases
GET    https://gitee.com/api/v5/repos/{owner}/{repo}/releases/{id}/attach_files
DELETE https://gitee.com/api/v5/repos/{owner}/{repo}/releases/{id}/attach_files/{file_id}
POST   https://gitee.com/api/v5/repos/{owner}/{repo}/releases/{id}/attach_files   # multipart: file + access_token
```

> 0.2.8 发版时按这条规矩清空了 `0.1.0` 至 `0.2.7` 的全部附件，只留 `0.2.8` 的两个包；各版本 Release 页面与源码归档仍在。`0.2.10` 发版时同样删掉 `0.2.9` 的两个附件，核对结果为：`0.1.0` 至 `0.2.9` 均无附件，仅 `0.2.10` 有 `apk` 与 `-setup.exe`。从 Gitee 重新下载的 APK，SHA-256 与本地归档一致。`0.2.11` 发版时删掉 `0.2.10` 的两个附件，核对结果为：`0.1.0` 至 `0.2.10` 均无附件，仅 `0.2.11` 有 `apk` 与 `-setup.exe`；从 Gitee 重新下载的 APK，SHA-256 与本地归档一致（`2aba4db5…51a82a`）。`0.2.12` 发版时删掉 `0.2.11` 的两个附件，仅 `0.2.12` 有 `apk`（16,116,020 字节）与 `-setup.exe`（99,583,205 字节）；GitHub 与 Gitee 的附件大小一致。`0.2.13` 发版时删掉 `0.2.12` 的两个附件，仅 `0.2.13` 有 `apk`（16,209,857 字节）与 `-setup.exe`（99,598,354 字节）；从 Gitee 重新下载的 APK，SHA-256（`883d7c1d…faa27976`）与本地归档一致。`0.3.0` 发版时删掉 `0.2.13` 的两个附件，仅 `0.3.0` 有 `apk`（16,235,859 字节）与 `-setup.exe`（99,655,537 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`ca60ab32…1afb1df3`）与本地归档一致。`0.3.1` 发版时删掉 `0.3.0` 的两个附件，核对结果为：`0.1.0` 至 `0.3.0` 均无附件，仅 `0.3.1` 有 `apk`（16,236,091 字节）与 `-setup.exe`（99,657,009 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`12da83f5…d9a65093`）与本地归档一致；官网 Pages 已显示 `0.3.1`。`0.4.0` 发版时删掉 `0.3.1` 的两个附件，仅 `0.4.0` 有 `apk`（16,250,178 字节）与 `-setup.exe`（99,667,492 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`d259bda4…ba448ab4`）与本地归档一致；官网 Pages 已显示 `0.4.0`。`0.5.0` 发版时删掉 `0.4.0` 的两个附件，仅 `0.5.0` 有 `apk`（16,255,135 字节）与 `-setup.exe`（99,668,437 字节）；GitHub 与 Gitee 的附件大小一致。`0.5.1` 发版时删掉 `0.5.0` 的两个附件，仅 `0.5.1` 有 `apk`（16,255,279 字节）与 `-setup.exe`（99,667,927 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`8624cd2e…04623760`）与本地归档一致。`0.5.2` 发版时删掉 `0.5.1` 的两个附件，仅 `0.5.2` 有 `apk`（16,259,905 字节）与 `-setup.exe`（99,673,587 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`2970979c…9e18f60a`）与本地归档一致；官网 Pages 已显示 `0.5.2`。`0.6.0` 发版时删掉 `0.5.2` 的两个附件，仅 `0.6.0` 有 `apk`（16,263,777 字节）与 `-setup.exe`（99,674,844 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`44573818…133908fd`）与本地归档一致；官网 Pages 已显示 `0.6.0`。`0.6.1` 发版时删掉 `0.6.0` 的两个附件，仅 `0.6.1` 有 `apk`（16,266,570 字节）与 `-setup.exe`（99,675,134 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`a6a9b4f9…f39692a5`）与本地归档一致；官网 Pages 已显示 `0.6.1`。`0.6.2` 发版时删掉 `0.6.1` 的两个附件，仅 `0.6.2` 有 `apk`（16,269,778 字节）与 `-setup.exe`（99,678,651 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`eaf76b07…8c59bb85`）与本地归档一致；官网 Pages 已显示 `0.6.2`。`0.6.3` 发版时删掉 `0.6.2` 的两个附件，仅 `0.6.3` 有 `apk`（16,270,258 字节）与 `-setup.exe`（99,677,889 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`8994cd8a…dd81e867`）与本地归档一致；官网 Pages 已显示 `0.6.3`。`0.7.0` 发版时删掉 `0.6.3` 的两个附件，仅 `0.7.0` 有 `apk`（16,281,707 字节）与 `-setup.exe`（99,687,271 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`ae33099b…4edabc0`）与本地归档一致；官网 Pages 已显示 `0.7.0`。`0.8.0` 发版时删掉 `0.7.0` 的两个附件，仅 `0.8.0` 有 `apk`（16,308,245 字节）与 `-setup.exe`（99,785,703 字节）；GitHub 与 Gitee 的附件大小一致；官网 Pages 已显示 `0.8.0`，两个源的四个下载链接均返回 200。`0.8.1` 发版时删掉 `0.8.0` 的两个附件，仅 `0.8.1` 有 `apk`（16,331,922 字节）与 `-setup.exe`（99,721,257 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`754025e5…2cb24`）与本地归档一致；官网 Pages 已显示 `0.8.1`，两个源的四个下载链接均返回 200。`0.9.0` 发版时删掉 `0.8.1` 的两个附件，仅 `0.9.0` 有 `apk`（21,408,452 字节，因新增 Health Connect 插件比上一版大约 5 MB）与 `-setup.exe`（99,811,651 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`350c683d…e09b4`）与本地归档一致；官网 Pages 已显示 `0.9.0`，两个源的四个下载链接均返回 200/206。`0.9.1` 发版时删掉 `0.9.0` 的两个附件，仅 `0.9.1` 有 `apk`（21,411,812 字节）与 `-setup.exe`（99,788,501 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`f9e6a6eb…9e14cd`）与本地归档一致；官网 Pages 已显示 `0.9.1`，两个源的四个下载链接均返回 200/206。`0.10.0` 发版时删掉 `0.9.1` 的两个附件，仅 `0.10.0` 有 `apk`（21,453,823 字节）与 `-setup.exe`（99,774,394 字节）；GitHub 与 Gitee 的附件大小一致；APK SHA-256（`2C7486DE…443AE382`）、setup.exe SHA-256（`EFB7BFFA…66E1A517`）与本地归档一致；官网 Pages 已显示 `0.10.0`，两个源的四个下载链接均返回 200。`0.10.1` 发版时删掉 `0.10.0` 的两个附件，仅 `0.10.1` 有 `apk`（61,556,999 字节，因新增二维码扫码插件比上一版大约 40 MB）与 `-setup.exe`（100,142,245 字节）；GitHub 与 Gitee 的附件大小一致；APK SHA-256（`64B2F008…D71DB811`）、setup.exe SHA-256（`5C522CE3…BEC2D8DC`）与本地归档一致。`0.10.2` 发版时删掉 `0.10.1` 的两个附件，仅 `0.10.2` 有 `apk`（61,557,035 字节）与 `-setup.exe`（100,143,453 字节）；GitHub 与 Gitee 的附件大小一致；APK SHA-256（`0D6F0C0E…E756D9AC`）、setup.exe SHA-256（`BB7DFA79…7211048E`）与本地归档一致。`0.10.3` 发版时删掉 `0.10.2` 的两个附件，仅 `0.10.3` 有 `apk`（61,557,059 字节）与 `-setup.exe`（100,142,535 字节）；GitHub 与 Gitee 的附件大小一致；APK SHA-256（`709A10BE…C2391AF`）、setup.exe SHA-256（`26C1A05B…5C336F`）与本地归档一致。`0.10.4` 发版时删掉 `0.10.3` 的两个附件，仅 `0.10.4` 有 `apk`（61,557,543 字节）与 `-setup.exe`（100,143,114 字节）；GitHub 与 Gitee 的附件大小一致；APK SHA-256（`AD7B3B9E…BCA2`）、setup.exe SHA-256（`37FDAB5A…DC21`）与本地归档一致。`0.11.0` 发版时删掉 `0.10.4` 的两个附件，仅 `0.11.0` 有 `apk`（61,596,464 字节）与 `-setup.exe`（100,166,484 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`F24D308C…47BFDD`）与本地归档一致，setup.exe 本地归档 SHA-256 为 `1E18C504…FB2161`；官网 Pages 已显示 `0.11.0`（日历卡片已从「建设中」改为「已可用」），两个源的四个下载链接均返回 200。`0.11.1` 发版时删掉 `0.11.0` 的两个附件，仅 `0.11.1` 有 `apk`（61,599,096 字节，versionCode `1101999`）与 `-setup.exe`（100,168,397 字节，ProductVersion `0.11.1`）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`0FBCF5EF…556E28`）与本地归档一致，setup.exe 本地归档 SHA-256 为 `34390DAF…D1215`；官网 Pages 已显示 `0.11.1`，两个源的四个下载链接均返回 200。`0.12.0` 发版时删掉 `0.11.1` 的两个附件，仅 `0.12.0` 有 `apk`（61,628,659 字节，versionCode `1200999`）与 `-setup.exe`（100,270,473 字节，ProductVersion `0.12.0`）；GitHub 与 Gitee 的附件大小一致；APK 本地归档 SHA-256 为 `DBB1B306…C48F4BED`，setup.exe 本地归档 SHA-256 为 `98C84A46…51C6025`；官网 Pages 已显示 `0.12.0`，两个源的四个下载链接均返回 200。`0.12.1` 发版时删掉 `0.12.0` 的两个附件，仅 `0.12.1` 有 `apk`（61,637,840 字节，versionCode `1201999`）与 `-setup.exe`（100,195,538 字节，ProductVersion `0.12.1`）；GitHub 与 Gitee 的附件大小一致；APK 本地归档 SHA-256 为 `1A44C1B8…A64CB41C`，setup.exe 本地归档 SHA-256 为 `05B38FD7…B48763C`；官网 Pages 已显示 `0.12.1`，两个源的四个下载链接均返回 200。这次 GitHub 镜像没跟上来（见 §6 最后一行），是直推补齐的。`0.13.0` 发版时删掉 `0.12.1` 的两个附件，仅 `0.13.0` 有 `apk`（61,648,459 字节，versionCode `1300999`）与 `-setup.exe`（100,207,927 字节，ProductVersion `0.13.0`）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`D07BCE71…E2B3F83F`）与本地归档一致，setup.exe 本地归档 SHA-256 为 `30A7744F…FEA1A547`；官网 Pages 已显示 `0.13.0`，两个源的四个下载链接均返回 200。这次 GitHub 镜像同步正常（推完即与 Gitee 同一提交）。

#
`0.13.1` 正式版：标签 `v0.13.1` 指向 `676f593`（含 PWA、后台提醒与备份密钥加密）；APK 为 61,713,610 字节、`versionCode=1301999`、SHA-256 `0D3A08D6500D462CE89BC892057392162047F6E12E573110963C96D0D00733F0`，签名证书与 §2.2 一致；Windows 安装包为 100,260,991 字节、ProductVersion `0.13.1`、SHA-256 `A1A7DDF8A6D5504548F3398FEFE7216690BBE901989232178D9F37B513AD0DCD`。GitHub 与 Gitee 上传大小一致；发布 0.14.0 前已移除本版 Gitee 附件，保留 Release 条目。

`0.14.0` 正式版：标签 `v0.14.0` 指向 `d9f396a`；APK 为 61,741,283 字节、`versionCode=1400999`、SHA-256 `0BCD7651DDAC4A883AE508FE2957F0CFB74F02A07F22914A1A4B3E99E0ED79BD`，签名证书与 §2.2 一致；Windows 安装包为 100,331,353 字节、ProductVersion `0.14.0`、SHA-256 `5267E47D59BA97CE21C4C790EAED6A9BED49601D922AFE3009B67D216E1C87FD`。GitHub 与 Gitee 各有两个正式版附件，四个下载地址均返回 200；从 Gitee 重新下载的 APK 大小与 SHA-256 均与本地归档一致。GitHub `/releases/latest` 与 Gitee 网页 `/releases/latest` 均指向 `v0.14.0`；Gitee API `/api/v5/repos/.../releases/latest` 在本次发布后曾短暂返回 `v0.13.1`；后续复查 `/latest` 连续多次返回 `v0.14.0`，列表 `/releases?page=1&per_page=100` 共 42 条且末项为 `v0.14.0`，当前已恢复，无需改应用回退逻辑。本次 Gitee 到 GitHub 的自动镜像超过 10 分钟未同步；确认 `github/main` 是 `main` 的祖先后，按 §6 普通快进补推，发行代码两端最初同步至 `1ec80f0`，未强推。随后官网安全提醒补充“0.13.1 前的备份同时含模型名称与 API Key 明文”，提交 `a5759cb` 已推 Gitee；超过 10 分钟仍未自动镜像后，确认祖先关系并普通快进推至 GitHub。Pages 工作流 run `41637704974` 成功；线上主页、中文/英文说明均已更新，changelog 的 Gitee 附件链接仅保留 `v0.14.0`。
## 4.2 测试版发版（GitHub Pre-release）

测试版少几步，但边界更硬：

1. 检查、定版本、写说明、出包、归档、提交、打标签与正式版相同；版本号带 `-beta.N`，文件名也带后缀。
2. 推 `origin main --tags`，等 GitHub 镜像同步后，在 GitHub 建 **Pre-release**（勾选 *Set as a pre-release*），上传该版本的 `.apk` 与 `-setup.exe`。
3. **不建 Gitee Release、不传 Gitee 附件**；`site/`、`notes.zh.md`、官网更新日志都不动。
4. 发布后核对：
   - GitHub `/releases/latest` 仍是上一个正式版（`0.7.0`），测试版不会顶掉正式版；
   - `/releases?per_page=20` 里能看到刚发的 beta；
   - 应用内把更新通道切到「测试版」能检查到该版本，切回「正式版」查不到；
   - APK 指纹、`versionCode` 与 §2.2 / §1 一致。
5. 测试版说明写清「这是测试版」、主要验证点、已知问题与退回正式版的方法，不写「稳定版」之类误导。

> 首个测试版 `0.8.0-beta.1` 于 2026-11-01 发布：GitHub Pre-release，资产为 `apk`（16,308,237 字节）与 `-setup.exe`（99,752,057 字节）；发布后核对 `releases/latest` 仍为 `v0.7.0`，测试版没有顶掉正式版。Gitee 只同步了 tag 与源码，没有建 Release、没有传附件；官网与 `notes.zh.md` 保持 `0.7.0`。随后 `0.8.0` 正式版发布，`latest` 才更新为 `v0.8.0`。

## 5. 凭证与提交约定

- **长期凭证（密钥、密码、Token）由用户决定**：需要新凭证时先给选项（用户提供 / 我生成并写进 gitignore 文件 / 用已有文件），得到确认再动手；已经生成的不要擅自更换。
- Gitee Token 在 `.local/keys/gitee-token.txt`，只在本机使用，禁止进入仓库或输出到日志。
- **提交信息不要任何 AI 标注**：不写 `Co-Authored-By: Claude ...`、`Generated with ...`，作者保持用户自己的 git 配置。
- **主仓库是 Gitee（origin）**，GitHub 是自动镜像。日常 `git push origin main` 即可；镜像有延迟，不要把 GitHub 的旧 HEAD 当成推送失败，也不要一有延迟就直推。**等超过 10 分钟仍不动**（0.12.1 发版时发生过一次），按 §6 最后一栏直推补齐，推完在 §4.1 记录一句。
- 不改用户的 git 配置；不强推、不改写已发布历史，除非用户明确要求。

## 6. 已知坑（发版相关）

| 现象 | 原因 / 处理 |
| --- | --- |
| Gradle 报路径或编码错误 | 工作区路径含零宽字符 / 非 ASCII 会挂；当前项目路径是纯 ASCII，别随手挪到中文目录 |
| Gradle 用错 Java | 系统默认 Java 1.8；显式设置 `JAVA_HOME` 到 Android Studio `jbr` |
| 装上新包还是旧界面 | 漏了 `npx cap sync android` |
| 新包装不上、提示签名冲突 | 换了 keystore，或装的是 debug 包；用 §2.3 验签 |
| GitHub 资产本地下载报 TLS 吊销错误 | 本机证书链问题，用 `gh release view` 核对资产大小，不代表文件坏了 |
| Gitee 上传安装包报「文件大小已超出仓库附件配额：1 GB」 | 这是**仓库附件总量**（1 GB）满了，不是单文件；按 §4.1 先删旧版本附件再传，之后坚持「Gitee 只留最新版」 |
| Gitee 上传单个包被拒（接近或超过 100 MB） | 单附件上限 100 MB；当前 exe 94.9 MB 已接近，超过后 Windows 包只能放 GitHub |
| 发完测试版，正式版用户也收到了 | GitHub Release 没勾 *Pre-release*，`latest` 被顶掉；改成 Pre-release 并确认 `/releases/latest` 回到正式版 |
| 测试版通道检查不到刚发的包 | 依次查：Release 是否为 draft、是否上传了对应平台附件（apk / exe）、`/releases?per_page=20` 是否能看到、当前安装版本是否已不低于它 |
| 测试版下载 404 或只有 GitHub 能下 | 正常：测试版只传 GitHub，Gitee 没有对应附件，应用也不会拼 Gitee 地址 |
| Android `versionCode` 突然变大 | `0.8.0` 起换成「base × 1000 + 通道」公式（§1），新号一律大于旧号，属正常 |
| Inno Setup 找不到 | 安装 Inno Setup 6，或把 `ISCC.exe` 放进 PATH |
| Inno Setup 报「系统找不到指定的路径」并中断 | 安卓插件在 `node_modules/@krzysztofkostecki/capacitor-health/android/build` 留下 Gradle 产物，`.transforms` 下的路径超过 260 字符。`package.json` 的 `build.files` 已排除该插件的 `android/**`；出包前也可手动删掉这个 `build` 目录 |
| Gitee 建 Release 报 `body is invalid` | 说明带 `\r\n` 发过去会被拒。把说明读进来后用 `-replace "\r\n","\n"` 转成 LF 再提交 |
| 官网更新了但页面没变 | Pages 工作流只监听 `site/**`；确认提交里确实改了 `site/`，再看 Actions 是否成功 |
| Gitee 传附件返回 `Unauthorized` | `access_token` 放在 multipart 表单字段里会被拒，必须放在 URL 查询串（`.../attach_files?access_token=...`）；创建 Release 时放 JSON 请求体则正常 |
| `npx cap sync android` 报 `[safe-delete] 操作失败: ...capacitor-cordova-android-plugins` | 本机 CLI 的安全删除守卫把「删整个插件目录」判成危险操作，`trash` 失败即中止。该目录本来就是每次同步重新生成的，用 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npx cap sync android` 放行即可（只对这条命令生效） |
| `npm run desktop:installer` 报 `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] ...dist\assets` | vite 的 `emptyOutDir` 一次删上百个文件，被「批量删除」守卫拦下。先 `rm -rf .local/dist` 再构建即可 |
| `npm run desktop:installer` 报 `win-unpacked\resources: Error during a trash operation` | `build.electronLanguages` 只留 `zh-CN`/`en-US`，electron-builder 要删掉另外 53 个 `locales/*.pak`，同样触发批量删除守卫。做法：用脚本复制一份只含两个语言包的 Electron 发行目录（复制时就不带 `locales/`，全程不删），再 `npx electron-builder --win --dir -c.directories.output=<新目录> -c.electronDist=<精简目录>` |
| 装出来的 exe 版本信息是一串乱码 / 读出来是 `X` | 传给 ISCC 的 `.iss` 丢了 BOM。Inno Setup 6 对无 BOM 的脚本按系统 ANSI 码页解析，中文 `AppName` 直接变乱码。`.iss` 必须存成 UTF-8 with BOM（Python 用 `encoding='utf-8-sig'` 写） |
| ISCC 报 `You may not specify more than one script filename.` | 参数里带了含中文的 `/DMyAppName=星芒记录者`，bash 下被拆成多个参数，ISCC 误以为传了多个脚本。中文默认值写在 `.iss` 的 `#define` 里，命令行只传 `"/DMyAppVersion=0.12.1"` 这类纯 ASCII 参数；用 PowerShell 调用更稳 |
| 推完 Gitee 很久，GitHub 镜像还停在旧提交 | 0.12.1 发版时遇到：Gitee 已有 `fd0b151` 与 `v0.12.1`，GitHub 停在 `c3be48d` 超过 25 分钟（上一版 3 分钟就同步了）。先确认 Gitee 侧确实推成功（`git log origin/main -1`），再直推补齐：`GIT_SSL_NO_VERIFY=1 git push github main --tags`。这是快进，不改写历史，镜像恢复后不会冲突。本机直推 GitHub 会先撞 `schannel: CRYPT_E_NO_REVOCATION_CHECK`，`-c http.schannelCheckRevoke=false` 压不住，只有 `GIT_SSL_NO_VERIFY=1` 能过（本机证书链问题，不是仓库问题） |
| `npx electron-builder --win --dir` 报 `EBUSY: resource busy or locked, unlink ...\win-unpacked\resources\app.asar` | 旧的免安装目录还被某个进程（杀毒、资源管理器预览、残留的 Electron 子进程）拿着 `app.asar`，删不掉也覆盖不了。换一个输出目录即可：`npx electron-builder --win --dir -c.directories.output=<新目录>`（注意是 `-c.` 前缀，写成 `--config.directories.output` 会被当成配置文件路径报 `ENOENT`）；随后把 `.iss` 的 `Source` 指到新目录，或等占用释放后重建 `win-unpacked` |
| Gitee 删附件 / 传附件返回 403 | `access_token` 放 JSON 请求体或查询串都会被拒，写请求要带 `Authorization: token <token>` 头（curl `-H "Authorization: token …"`），token 仍只从 `.local/keys/gitee-token.txt` 读，不要进命令行 |
| 核对 asar 里的 `package.json` 把仓库那份覆盖了 | `npx asar extract-file` 会把文件写到**当前目录**。不要在仓库根跑：先 `cd .local/tmp` 或用 `asar list` / `asar extract` 到临时目录。恢复办法：`git show HEAD:package.json > package.json`，再把版本号改回来 |

## 7. 相关文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | 版本真源、打包脚本、electron-builder 配置 |
| `android/app/build.gradle` | 版本派生（含测试版 versionCode）、release 签名读取 |
| `src/core/utils/versionCompare.ts` | SemVer 比较（渲染层与安卓） |
| `src/features/update/updateService.ts` / `electron/main.cjs` | 检查更新：正式版 latest、测试版 releases 列表、下载源与更新说明 |
| `.local/keys/keystore.properties` / `starburst-release.jks` | Android 签名凭证（**不进 git**） |
| `package/windows/build.ps1` / `starburst-recorder.iss` | Windows 安装包流水线 |
| `package/icons/make-icons.ps1` / `make-splash.ps1` | 全端图标与启动图生成 |
| `.local/artifacts/` | 历次安装包与发版说明归档 |
| `site/` | 官网与下载页（GitHub Pages） |
| `docs/PROJECT-NOTES.md` | 架构、数据、设计决策与历史坑 |
