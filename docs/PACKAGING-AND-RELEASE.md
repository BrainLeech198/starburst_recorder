# 打包与发版规范

> 本文是 Windows / Android 打包、签名、发版的**唯一操作口径**。
> 内容合并自 CodeBuddy 与 Trae 的项目长期记忆、2026-10-25 至 10-26 的实际发版记录，以及本机签名核验结果。
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
| Android `versionName` | `package.json.version`（`android/app/build.gradle` 运行时读取） |
| Android `versionCode` | `major × 10000 + minor × 100 + patch`（`0.2.7 → 207`） |
| Windows 安装包版本 | `package/windows/build.ps1` 读取 `package.json.version` |
| 安装包文件名 | `starburst-recorder-<version>-setup.exe` / `starburst-recorder-<version>.apk` |
| 官网、更新日志、Release 正文 | 手动同步为同一版本号 |

发版时 `package.json` 与 `package-lock.json` 要一起改，两处版本不能打架。

**不要**再在 `build.gradle` 里手写版本号，也不要给 Android 单独维护一套。

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

**核验记录（2026-10-26）**：`0.1.0` 至 `0.2.6` 全部 APK 的签名证书 SHA-256 均为上值，且与当前 `.jks` 完全一致。也就是说，历次升级包一直使用同一套密钥。`0.2.7` 出包时同样核对过；`0.2.8` 在发布后从 Gitee 重新下载 APK 复验，哈希与本地归档一致、指纹仍为上值。`0.2.9` 出包后核对：指纹仍为上值，`versionCode=209`、`versionName=0.2.9`。`0.2.10` 出包后核对：指纹仍为上值，`versionCode=210`、`versionName=0.2.10`。`0.2.11` 出包后核对：指纹仍为上值，`versionCode=211`、`versionName=0.2.11`。`0.2.12` 出包后核对：指纹仍为上值，`versionCode=212`、`versionName=0.2.12`。`0.2.13` 出包后核对：指纹仍为上值，`versionCode=213`、`versionName=0.2.13`。`0.3.0` 出包后核对：指纹仍为上值，`versionCode=300`、`versionName=0.3.0`。`0.3.1` 出包后核对：指纹仍为上值，`versionCode=301`、`versionName=0.3.1`。

### 2.3 每次出包必须验签

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
/d/Android/Sdk/build-tools/35.0.0/apksigner.bat verify --print-certs \
  .local/artifacts/starburst-recorder-<version>.apk
```

指纹必须等于 §2.2 的值。顺带确认版本：

```bash
/d/Android/Sdk/build-tools/35.0.0/aapt2.bat dump badging <apk> | head -1
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
3. **写说明**：中文 / 英文更新说明与官网「这一版有什么」、更新日志都要和实际改动一致，不能套模板
4. **出包**：按 §2、§3 打 Android 与 Windows，各自验签 / 验版本
5. **归档**：两个产物放 `.local/artifacts/`，文件名带版本号；不再往桌面复制，发布时作为 Release 附件上传（见第 9 步）
6. **提交**：只提交源码与文档；`git add` 用具体文件名，不用 `git add -A`
7. **打标签**：`git tag v<version>`
8. **推送**：`git push origin main --tags`（origin = Gitee 主仓库，GitHub 由镜像自动同步）
9. **发 Release**：Gitee 与 GitHub 各建一条，上传同名的 `.apk` 与 `-setup.exe`；替换同名资产时先删旧资产再传。**Gitee 只保留最新版本的附件**：免费仓库的发行版附件总量只有 1 GB，每版两个包约 110 MB，发新版前先删掉旧版本 Release 里的附件（Release 与源码归档保留）；旧版本下载只走 GitHub，官网「历史版本」链接也一直指向 GitHub
10. **验证**：官网 Pages 是否更新、两个平台的下载链接是否可用、APK 指纹是否仍是 §2.2

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

> 0.2.8 发版时按这条规矩清空了 `0.1.0` 至 `0.2.7` 的全部附件，只留 `0.2.8` 的两个包；各版本 Release 页面与源码归档仍在。`0.2.10` 发版时同样删掉 `0.2.9` 的两个附件，核对结果为：`0.1.0` 至 `0.2.9` 均无附件，仅 `0.2.10` 有 `apk` 与 `-setup.exe`。从 Gitee 重新下载的 APK，SHA-256 与本地归档一致。`0.2.11` 发版时删掉 `0.2.10` 的两个附件，核对结果为：`0.1.0` 至 `0.2.10` 均无附件，仅 `0.2.11` 有 `apk` 与 `-setup.exe`；从 Gitee 重新下载的 APK，SHA-256 与本地归档一致（`2aba4db5…51a82a`）。`0.2.12` 发版时删掉 `0.2.11` 的两个附件，仅 `0.2.12` 有 `apk`（16,116,020 字节）与 `-setup.exe`（99,583,205 字节）；GitHub 与 Gitee 的附件大小一致。`0.2.13` 发版时删掉 `0.2.12` 的两个附件，仅 `0.2.13` 有 `apk`（16,209,857 字节）与 `-setup.exe`（99,598,354 字节）；从 Gitee 重新下载的 APK，SHA-256（`883d7c1d…faa27976`）与本地归档一致。`0.3.0` 发版时删掉 `0.2.13` 的两个附件，仅 `0.3.0` 有 `apk`（16,235,859 字节）与 `-setup.exe`（99,655,537 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`ca60ab32…1afb1df3`）与本地归档一致。`0.3.1` 发版时删掉 `0.3.0` 的两个附件，核对结果为：`0.1.0` 至 `0.3.0` 均无附件，仅 `0.3.1` 有 `apk`（16,236,091 字节）与 `-setup.exe`（99,657,009 字节）；GitHub 与 Gitee 的附件大小一致；从 Gitee 重新下载的 APK，SHA-256（`12da83f5…d9a65093`）与本地归档一致；官网 Pages 已显示 `0.3.1`。

## 5. 凭证与提交约定

- **长期凭证（密钥、密码、Token）由用户决定**：需要新凭证时先给选项（用户提供 / 我生成并写进 gitignore 文件 / 用已有文件），得到确认再动手；已经生成的不要擅自更换。
- Gitee Token 在 `.local/keys/gitee-token.txt`，只在本机使用，禁止进入仓库或输出到日志。
- **提交信息不要任何 AI 标注**：不写 `Co-Authored-By: Claude ...`、`Generated with ...`，作者保持用户自己的 git 配置。
- **主仓库是 Gitee（origin）**，GitHub 是自动镜像。日常 `git push origin main` 即可；镜像有延迟，不要把 GitHub 的旧 HEAD 当成推送失败，也不要直接推 GitHub。
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
| Inno Setup 找不到 | 安装 Inno Setup 6，或把 `ISCC.exe` 放进 PATH |
| 官网更新了但页面没变 | Pages 工作流只监听 `site/**`；确认提交里确实改了 `site/`，再看 Actions 是否成功 |

## 7. 相关文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | 版本真源、打包脚本、electron-builder 配置 |
| `android/app/build.gradle` | 版本派生、release 签名读取 |
| `.local/keys/keystore.properties` / `starburst-release.jks` | Android 签名凭证（**不进 git**） |
| `package/windows/build.ps1` / `starburst-recorder.iss` | Windows 安装包流水线 |
| `package/icons/make-icons.ps1` / `make-splash.ps1` | 全端图标与启动图生成 |
| `.local/artifacts/` | 历次安装包与发版说明归档 |
| `site/` | 官网与下载页（GitHub Pages） |
| `docs/PROJECT-NOTES.md` | 架构、数据、设计决策与历史坑 |
