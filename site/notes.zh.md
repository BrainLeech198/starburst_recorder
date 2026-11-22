本地优先的个人记录工具，内置 AI：随手记一句今天，AI 会把它整理成一篇完整的日记。不用注册、没有云端，每一条记录都留在这台设备上。AI 用的是你自己准备的模型和 Key。

## 0.23.9 · 2026-11-22

助手会提示检索覆盖范围并统一套餐营养算法；食物和套餐操作卡片能查看细节、修改后再确认，悬浮助手多选也能清楚导出所选消息。

### 改进

- **完整检索与分类**：食物库支持按名称或标签查找，分页显示总数、当前页和是否还有结果；需要完整清单时可继续翻到末页。
- **营养数值一致**：食物保留库内精度，套餐使用与健康页相同的成分计算；缺失食材会标明营养合计不完整，估算和推断会明确区分。
- **写入先审阅**：食物和套餐卡片显示具体成分、份量与营养；修改卡片逐项显示原值和新值。支持编辑的待确认草稿可以直接调整。详情读取失败时可重试，加载成功前不能确认写入。
- **悬浮助手多选导出**：所选消息的导出按钮更醒目；可在弹窗选择格式、范围，以及是否包含工具轨迹和动作卡片。

### 下载

- Windows 10/11：[starburst-recorder-0.23.9-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.9/starburst-recorder-0.23.9-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.9/starburst-recorder-0.23.9-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.9.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.9/starburst-recorder-0.23.9.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.9/starburst-recorder-0.23.9.apk)

## 0.23.8 · 2026-11-22

食物库热量更醒目；编辑记录份量会自动重算营养，记录时图片加载期间也能继续操作。

### 改进

- **一份热量突出显示**：食物卡片按常用份量折算热量，未设置常用份量时显示每 100g；套餐卡片突出显示整份配方的热量。
- **编辑份量自动重算**：普通摄入记录改克数后，未手动调整的营养值会按原记录比例更新并计入当天热量；手动改过的字段会保留。
- **照片加载时继续交互**：记录页食物库的照片占位加载中即可点击查看，不必等图片读取完成才能操作。

### 下载

- Windows 10/11：[starburst-recorder-0.23.8-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.8/starburst-recorder-0.23.8-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.8/starburst-recorder-0.23.8-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.8.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.8/starburst-recorder-0.23.8.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.8/starburst-recorder-0.23.8.apk)

## 0.23.7 · 2026-11-22

修复 Android 称重提醒没有稳定排程的问题。

### 修复

- **称重提醒自动同步**：应用启动、称重日 / 时间变化，以及从系统设置返回时都会重新同步提醒；首次设置时会请求通知权限。
- **精确闹钟状态可见**：未获准精确闹钟时仍会安排提醒，并提示可能延迟；可从体重页继续打开系统授权。

### 下载

- Windows 10/11：[starburst-recorder-0.23.7-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.7/starburst-recorder-0.23.7-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.7/starburst-recorder-0.23.7-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.7.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.7/starburst-recorder-0.23.7.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.7/starburst-recorder-0.23.7.apk)

## 0.23.6 · 2026-11-22

修复体重趋势图未反映最近称重的问题。

### 修复

- **显示最新称重**：当天读数会参与七日趋势均值；后续称重出现前，不再只凭更早记录把最新读数从趋势图中排除。

### 下载

- Windows 10/11：[starburst-recorder-0.23.6-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.6/starburst-recorder-0.23.6-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.6/starburst-recorder-0.23.6-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.6.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.6/starburst-recorder-0.23.6.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.6/starburst-recorder-0.23.6.apk)

## 0.23.5 · 2026-11-22

修复 Windows 版更新后启动黑屏；应用数据仍保存在原有本机位置。

### 修复

- **Windows 启动黑屏**：安装包现在包含应用页面入口和 JavaScript 资源；更新后可正常打开，现有本地记录与 AI 配置保留在原用户资料目录。

### 下载

- Windows 10/11：[starburst-recorder-0.23.5-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.5/starburst-recorder-0.23.5-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.5/starburst-recorder-0.23.5-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.5.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.5/starburst-recorder-0.23.5.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.5/starburst-recorder-0.23.5.apk)

## 0.23.4 · 2026-11-22

分享记录卡片新增官网二维码，收到图片的人扫码即可查看网页版、Windows 和 Android 获取入口。

### 改进

- **分享图片增加下载入口**：记录卡片右下角的二维码会打开官网下载安装区，只包含下载页地址；弹窗里的分享二维码仍用于导入记录。

### 下载

- Windows 10/11：**此版本的 Windows 安装包会启动黑屏，请改用 v0.23.5。**[下载修复版](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.5/starburst-recorder-0.23.5-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.5/starburst-recorder-0.23.5-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.4.apk](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.4/starburst-recorder-0.23.4.apk)（正式签名）

## 0.23.3 · 2026-11-21

今日体重会及时进入趋势图；趋势详情默认展示全部保留记录，可左右滑动浏览，并提供体重总览。

### 改进

- **显示当天称重**：在健康首页或趋势详情录入的当天体重会立即进入曲线；旧档案中仅保存在身体资料里的当前体重也会补到历史中。
- **浏览完整体重历史**：趋势详情默认展示全部保留记录，可切换近 7 / 30 / 90 天；曲线支持左右滑动，下面同步显示最新体重、整体变化、周均变化和平均范围。

### 下载

- Windows 10/11：[starburst-recorder-0.23.3-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.3/starburst-recorder-0.23.3-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.3/starburst-recorder-0.23.3-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.3.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.3/starburst-recorder-0.23.3.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.3/starburst-recorder-0.23.3.apk)
## 0.23.2 · 2026-11-21

日程支持每周、每月、每年的多日期重复，并按开始与截止日期触发桌面、Android 和已开启推送的网页提醒。

### 改进

- **多日期重复**：每周可选多个星期；每月可选 1–31 号；每年可选多个具体月日。某月不存在的日期会跳过，2 月 29 日只在闰年触发，规则从开始日期持续到截止日期。
- **提醒覆盖更多日期规则**：桌面应用保持打开时可按时通知；Android 授权后由系统排程，包含一次性日程；网页关闭后的提醒需要在设置的提醒页开启推送。
- **规则同步**：日程备份导入导出及 AI 创建、编辑日程都会保留所选日期规则。

### 下载

- Windows 10/11：[starburst-recorder-0.23.2-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.2/starburst-recorder-0.23.2-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.2/starburst-recorder-0.23.2-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.2.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.2/starburst-recorder-0.23.2.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.2/starburst-recorder-0.23.2.apk)

## 0.23.1 · 2026-11-21

把健康目标和健康分析收进同一个入口，在一页管理目标并查看近 30 天数据。

### 改进

- **统一健康分析入口**：健康首页将「健康分析」移到「身体测量」同一行；目标设置与近 30 天分析集中在健康分析页。
- **保留旧目标地址**：旧 `/health/goals` 书签会自动打开合并后的健康分析页。

### 下载

- Windows 10/11：[starburst-recorder-0.23.1-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.1/starburst-recorder-0.23.1-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.1.apk](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.1/starburst-recorder-0.23.1.apk)（正式签名）

## 0.23.0 · 2026-11-21

日程打卡可修改，健康趋势口径更可靠，内置 AI 也能按需读取应用功能指南。

### 改进

- **打卡记录可修改**：可调整每日打卡的内容、照片和实际时间；重复任务只在安排生效的日期显示，历史清单更清楚。
- **健康趋势更一致**：趋势与推算排除今天，过滤有邻近数据支持的体重突变并使用 7 日滚动均值；样本不足或推算低于基础代谢保护线时不显示推算值，周趋势与区间变化使用同一口径。
- **助手了解应用功能**：新增内置应用指南，覆盖主要页面、关键规则、提醒平台差异和代码入口；助手按问题需要读取，不会因此自动读取个人记录。

### 下载

- Windows 10/11：[starburst-recorder-0.23.0-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.0/starburst-recorder-0.23.0-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.0/starburst-recorder-0.23.0-setup.exe)
- Android 10 以上：[starburst-recorder-0.23.0.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.23.0/starburst-recorder-0.23.0.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.23.0/starburst-recorder-0.23.0.apk)

## 0.22.1 · 2026-11-20

首页切换更容易找到，窄屏与宽屏排版更协调，悬浮助手不再压住底部导航。

### 改进

- **切换入口更清楚**：首页与今日清单切换移到内容区左上角，选中状态明确，也支持键盘切换。
- **首屏更舒展**：调整首页与今日清单的起始位置和卡片间距；窄屏下菜单与切换入口保持分开。
- **导航不再被悬浮球遮挡**：悬浮助手会停在手机底部导航上方，自动贴边时也会保持间距。
- **空状态操作更可靠**：未配置 AI 时图片导入和 AI 整理仍可点开配置提示；没有记录时不显示无效的批量操作，搜索提示也不再提到不存在的标签。

### 下载

- Windows 10/11：[starburst-recorder-0.22.1-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.22.1/starburst-recorder-0.22.1-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.22.1/starburst-recorder-0.22.1-setup.exe)
- Android 10 以上：[starburst-recorder-0.22.1.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.22.1/starburst-recorder-0.22.1.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.22.1/starburst-recorder-0.22.1.apk)

## 0.22.0 · 2026-11-20

首页分为两个视图；日程、提醒权限和更新操作更清楚。

### 改进

- **首页与今日清单分开**：首页只保留品牌与四张入口卡片，今日清单单独显示；右上角菜单固定可用。
- **日程表单按类型显示日期**：一次性日程填写日期；重复任务不再要求填写开始日期，只需设置截止日期。打卡记录显示七位十六进制编号，并随备份保存。
- **提醒权限更明确**：安卓可从设置申请系统通知权限并同步本地提醒；Windows 可设置登录后隐藏启动，让桌面提醒继续运行。
- **检查更新直接进入下载流程**：发现新版本后打开更新弹窗，可以选择下载来源。
- **官网内容精简**：移除重复介绍，并把本地记录、AI 服务和网页提醒会发送的数据说清楚。

### 下载

- Windows 10/11：[starburst-recorder-0.22.0-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.22.0/starburst-recorder-0.22.0-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.22.0/starburst-recorder-0.22.0-setup.exe)
- Android 10 以上：[starburst-recorder-0.22.0.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.22.0/starburst-recorder-0.22.0.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.22.0/starburst-recorder-0.22.0.apk)

## 0.21.5 · 2026-11-20

当天页新建日记可直接保存并回到原日期；训练空表单会说明需要补充什么。

### 改进

- **当天日记直接保存**：从当天页新建的日记会存到所选日期并返回当天；保存弹窗和成功提示会说明结果。普通日记的「另存为」仍可自行选择日期。
- **训练提示更具体**：点选记提示添加动作、填写时长或写备注；快速有氧提示填写时长或距离。动态错误会由屏幕阅读器播报。

### 下载

- Windows 10/11：[starburst-recorder-0.21.5-setup.exe](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.21.5/starburst-recorder-0.21.5-setup.exe) · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.5/starburst-recorder-0.21.5-setup.exe)
- Android 10 以上：[starburst-recorder-0.21.5.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.21.5/starburst-recorder-0.21.5.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.5/starburst-recorder-0.21.5.apk)

## 0.21.4 · 2026-11-20

日程卡片可直接打开打卡和历史记录；明信片完整保留照片比例，重复计划清楚显示起止日期。

### 改进

- **整张日程卡片可打卡**：点击卡片或勾选框都会打开记录窗；可查看逐日打卡历史和具体时间。
- **记录准确的打卡时间**：新打卡保存 Unix 毫秒时间戳，编辑记录不刷新原时间；旧数据缺少真实时间时会明确标出未记录。
- **重复日程显示起止范围**：表单明确标注开始日期；管理列表隐藏已过截止日的计划，截止当天仍有效。没有截止日的旧任务继续沿用原规则。
- **明信片照片不再裁切**：图片按原始比例完整展示，并按照片高度扩展明信片画布。

### 下载

- Windows 10/11：[starburst-recorder-0.21.4-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.4/starburst-recorder-0.21.4-setup.exe)
- Android 10 以上：[starburst-recorder-0.21.4.apk](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.4/starburst-recorder-0.21.4.apk)（正式签名）

## 0.21.3 · 2026-11-19

训练时长输入现在会明确标出单位是分钟。

### 改进

- **训练时长单位明确**：快捷新增、整次训练和单个动作的时长字段均标明“分钟”；输入与保存方式不变。

### 下载

- Windows 10/11：[starburst-recorder-0.21.3-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.3/starburst-recorder-0.21.3-setup.exe)
- Android 10 以上：[starburst-recorder-0.21.3.apk](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.3/starburst-recorder-0.21.3.apk)（正式签名）

## 0.21.2 · 2026-11-19

首页清单更紧凑，扫码和分享码导入集中到右上角菜单。

### 改进

- **今日清单默认收起**：首页先显示前三项，可展开查看剩余任务，也可随时收起。
- **分享入口更集中**：点右上角三点，可直接扫码或导入分享码。

### 下载

- Windows 10/11：[starburst-recorder-0.21.2-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.2/starburst-recorder-0.21.2-setup.exe)
- Android 10 以上：[starburst-recorder-0.21.2.apk](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.2/starburst-recorder-0.21.2.apk)（正式签名）

## 0.21.1 · 2026-11-19

从当天页快速新增记录后，保存会回到正在查看的日期。

### 改进

- **当天新增后回到当天**：从当天页新增日记、收支、饮食、睡眠、训练或日程，保存成功后回到原日期，刚记的内容会出现在时间线上。
- **取消保持原处**：取消或关闭编辑不会误当成保存，不会跳离当前页面。

### 下载

- Windows 10/11：[starburst-recorder-0.21.1-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.1/starburst-recorder-0.21.1-setup.exe)
- Android 10 以上：[starburst-recorder-0.21.1.apk](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.1/starburst-recorder-0.21.1.apk)（正式签名）

## 0.21.0 · 2026-11-19

把每天完成的事汇成清单与明信片，并让训练和月度回顾也能生成可分享的卡片。

### 这一版有什么

- **重复日程设截止日期**：截止当天仍可打卡；到期后不再出现或提醒，安卓会停止重排提醒。
- **首页今日清单**：直接查看和完成当天任务，可补充文字与照片；历史日期可回看并生成每日明信片。
- **更多记录可做成明信片**：训练记录、月度回顾、日记、随记、食物、套餐、摄入和收支都可预览并保存主题卡片；月度睡眠与收支默认不放进图片，需手动勾选。
- **首页品牌区可收起**：点一次星芒图标即可隐藏品牌区，清单和功能入口仍保留；收起偏好可随设置备份。

### 下载

- Windows 10/11：[starburst-recorder-0.21.0-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.0/starburst-recorder-0.21.0-setup.exe)
- Android 10 以上：[starburst-recorder-0.21.0.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.21.0/starburst-recorder-0.21.0.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.21.0/starburst-recorder-0.21.0.apk)

## 0.20.0 · 2026-11-18

备份支持按分区选择加密，也可以单独分享 AI 模型配置。

### 这一版有什么

- **备份分区可选加密**：AI 模型密钥与其他用户数据分别选择；也可以保持明文。导入时跳过口令，未加密分区仍可恢复。加密内容忘记口令后无法恢复。
- **AI 模型仍可单独备份**：API Key 可独立选择加密；跳过口令时可继续导入其他未加密分区。
- **分享单个 AI 模型**：生成二维码、复制分享码或保存分享文件；API Key 可选择加密，接收方预览后可将配置添加到模型列表。

### 下载

- Windows 10/11：[starburst-recorder-0.20.0-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.20.0/starburst-recorder-0.20.0-setup.exe)
- Android 10 以上：[starburst-recorder-0.20.0.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.20.0/starburst-recorder-0.20.0.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.20.0/starburst-recorder-0.20.0.apk)

## 0.19.2 · 2026-11-15

首页新增训练入口，训练记录页操作更集中，训练组表单在手机上更紧凑。

### 这一版有什么

- **首页可直接进入训练**：训练卡片加入首页，并适配窄屏布局。
- **训练常用操作移到页首**：新增、复制、模板、批量、回收站、计划和导入更容易找到。
- **训练组表单更精简**：次数与负重保持在主区域；休息时长和 RPE 收入可展开的可选字段。

### 下载

- Windows 10/11：[starburst-recorder-0.19.2-setup.exe](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.19.2/starburst-recorder-0.19.2-setup.exe)
- Android 10 以上：[starburst-recorder-0.19.2.apk](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.19.2/starburst-recorder-0.19.2.apk)（正式签名） · [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.19.2/starburst-recorder-0.19.2.apk)

## 0.19.1 · 2026-11-13

睡眠时间轴扩展为 48 小时并综合记录着色；身体测量新增多围度和趋势；训练加入独立进度、周回顾、模板、自设目标与手动 AI 点评。

## 0.19.0 · 2026-11-13

新增腰围记录与趋势、AI 健康报告预览，并改进训练入口和一餐多项摄入记录。

## 0.18.2 · 2026-11-13

修正手动检查更新会重复打开旧结果的问题；现在每次检查都会重新读取发布信息。

## 0.18.1 · 2026-11-13

摄入进度条按三大营养素克数占比分色；没有照片时隐藏空缩略图。

### 这一版有什么

- **摄入进度条按克数占比分色**：总条长仍表示摄入热量，颜色段分别表示蛋白质、碳水和脂肪的克数比例。
- **无照片时不显示空缩略图**：食物与套餐没有照片时，列表不再预留空白图片位置。

### 下载

- Windows 10/11：[`starburst-recorder-0.18.1-setup.exe`](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.1/starburst-recorder-0.18.1-setup.exe)（约 96 MB）
- Android 10 以上：[`starburst-recorder-0.18.1.apk`](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.1/starburst-recorder-0.18.1.apk)（约 62 MB，正式签名）

## 0.18.0 · 2026-11-13

助手跨会话继续运行，改动可先核对；收支和健康记录也更清楚。

### 这一版有什么

- **助手可以按会话排队并在切换页面后继续回答**：每个会话最多排队 10 条；动作卡片列出原值和修改后内容，执行前可再次编辑。关闭应用或刷新网页后，运行中的请求不会恢复。
- **长对话更好控制上下文**：按模型上下文窗口裁剪较早消息，优先保留最近对话。
- **摄入记录支持按份数填写**：已设置常用份量的食物可直接输入份数；联动收支按份数乘单份价格计算。营养素图表按三大营养素供能占比显示。
- **睡眠时间轴按起床日期对齐**：跨午夜的睡眠落在正确日期，并用个人目标和已记录指标提供颜色提示。
- **收支图表更容易比较**：横轴日期更简洁，极端金额较大时压缩纵轴；记账表单在小屏上可独立滚动。

### 下载

- Windows 10/11：[`starburst-recorder-0.18.0-setup.exe`](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0-setup.exe)（约 96 MB）· [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0-setup.exe)
- Android 10 以上：[`starburst-recorder-0.18.0.apk`](https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0.apk)（约 62 MB，正式签名）· [GitHub 备用](https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.18.0/starburst-recorder-0.18.0.apk)

## 0.17.4 · 2026-11-11

### 这一版有什么

- **日历 AI 回顾覆盖完整月份和年份**：修正月末与年末比较范围，并按有摄入记录的天数计算年度日均热量。
- **AI 模型成为独立备份分区**：可分别导出或恢复模型配置；旧备份自动迁移，口令只在选择含密钥的模型分区时询问。
- **收支周/月趋势改为双折线图**：收入与支出在同一时间轴上更容易对照。
- **官网增加网页版直达和手机导航菜单**：首屏仍保留下载入口。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.17.4-setup.exe`（约 96 MB） |
| Android 10 以上 | `starburst-recorder-0.17.4.apk`（约 62 MB，正式签名） |

安卓为侧载安装，需要允许「安装未知来源应用」。之前装过 debug 测试包的，要先卸载再装这一版（签名不同，覆盖安装会失败）。
存储跟着平台走：桌面是 SQLite，浏览器与 WebView 里是 IndexedDB。

## 已知限制

0.17.4 仍是早期版本，数据格式也可能在版本之间变化，升级前先导出一份备份。旧备份仍可直接导入；AI 对话会随备份一起走，带图片附件时会明显变大。安卓的健康应用导入属于实验功能，尚未做真机验证，读不到时请反馈。

**重要：0.13.1 之前导出的备份文件可能含有明文模型名称和 API Key。** 若旧备份曾存到网盘、邮箱或发给别人，请到模型服务后台撤销之前用过的 API Key，再重新生成并在「AI 设置」里填写。0.13.1 起导出时可以加口令加密 `apiKey`，但**只保护以后新导出的文件**，已经导出的旧文件不会自动变安全。

**关于网页版提醒**：要实现「应用关着也能收到提醒」，就必须有一个服务器知道你「几点要提醒」。所以上传的是提醒位（几点、哪一类），**不是提醒内容**——服务器不知道你 8:00 要称重，更看不到你的日程标题、训练项目或日记。

**关于订阅**：目前邮件投递尚未启用，因此不会发送订阅邮件。启用后，邮箱会由 Cloudflare 存储并由邮件服务商处理，仅用于公告邮件；退订会从服务端删除订阅记录。

MIT 许可。镜像仓库：https://github.com/BrainLeech198/starburst_recorder

## 0.17.2 · 2026-11-11

### 这一版有什么

- **无图记录也有整齐的缩略图**：收支记录、摄入历史、食物和套餐列表在没有照片时显示对应的插画占位图；已有照片仍按需读取并可预览。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.17.2-setup.exe`（约 96 MB） |
| Android 10 以上 | `starburst-recorder-0.17.2.apk`（约 62 MB，正式签名） |

安卓为侧载安装，需要允许「安装未知来源应用」。之前装过 debug 测试包的，要先卸载再装这一版（签名不同，覆盖安装会失败）。
存储跟着平台走：桌面是 SQLite，浏览器与 WebView 里是 IndexedDB。

## 0.17.1 · 2026-11-09

### 这一版有什么

- **食物库与摄入挑选更好找**：食物库支持按名称搜索和标签筛选；摄入食物与套餐选择支持按名称或添加时间排序、切换正反序。列表分批显示，照片按需读取。
- **日记、随记和收支浏览更轻**：切换日期、打开归档、搜索、周/月回顾时先读摘要；图片只在需要显示或打开时读取。
- **助手与批量操作减少整库读图**：AI 回顾、引用、确认写入、睡眠批量列表和记录导入只查所需摘要或记录；明确查看旧照片与完整备份仍保留原图。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows 10/11 | `starburst-recorder-0.17.1-setup.exe`（约 96 MB） |
| Android 10 以上 | `starburst-recorder-0.17.1.apk`（约 62 MB，正式签名） |

安卓为侧载安装，需要允许「安装未知来源应用」。之前装过 debug 测试包的，要先卸载再装这一版（签名不同，覆盖安装会失败）。
存储跟着平台走：桌面是 SQLite，浏览器与 WebView 里是 IndexedDB。
