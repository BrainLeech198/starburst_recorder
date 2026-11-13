# 训练板块 · 第二阶段体验规格

> 第一阶段「从零建模块」的指导见 [TRAINING-MODULE.md](TRAINING-MODULE.md)，那部分代码已经落地。
> 本文只写**差距和下一步**：怎么从「能记」变成「会用」，不要求重做已有的数据层和页面。
> 通用规矩（提交、密钥、构建、多 AI 并行）见 [AGENTS.md](../AGENTS.md)。

---

## 0. 一句话目标

用户不用学一套流程：

- **想记**的时候，30 秒内记完，什么运动都能记。
- **不想练**的时候，提醒有分寸，不制造焦虑。
- **想回看**的时候，看到的不是账单，而是真实数字加一句能执行的建议。

所有增强都必须是**可选的**。默认安静，用户打开才生效。

---

## 1. 现状快照（2026-11-02 审计）

动手前先确认这些已经存在，不要重写。

| 能力 | 现状 | 位置 |
| --- | --- | --- |
| 数据模型 | `TrainingKind / TrainingSet / TrainingExercise / HealthTraining / TrainingPlan` 已定义 | `src/core/db/schema.ts` |
| 双端存储 | Dexie + SQLite 双实现、软删、回收站、清空 | `dexieStore.ts` / `sqliteStore.ts` / `electron/database.cjs` |
| 备份与互通 | 整库备份写 `training.entries`，记录级导入导出，合并冲突 | `diaryBackup.ts` / `recordExport.ts` / `recordImport.ts` / `diaryMerge.ts` |
| 三种记录入口 | 一句话、点选、快速 | `TrainingForm.tsx` |
| 任意运动类型 | 力量 / 有氧 / 拉伸 / 球类 / 其他；快速记支持时长 + 距离 | `TrainingForm.tsx`、`schema.ts` |
| 当日 / 本周统计 | 次数、组数、次数和、容量、时长、部位、与上周比、断档天数 | `trainingMath.ts` |
| 提醒 | 固定周几 + 时刻；连续 N 天没练；安卓本地通知 + 网页前台检查 | `trainingPlan.ts` / `trainingNotify.ts` |
| 助手 | `training_stats`、`training_week_chart`、`add/update/delete_training` | `assistantTools.ts` / `assistantActionBuild.ts` |
| 全库 AI 报告 | 日报 / 周报 / 月报 / 年报会把训练次数、分钟数、每天练了什么写进素材 | `src/features/ai/aiReport.ts` |
| 入口 | 「记录」导航组有独立「训练」入口，路径 `/training`；健康首页不再放训练卡 | `AppShell.tsx`、`router.tsx` |

**已确认的缺口**

1. 提醒只能表达「周几」，表达不了「练一休一」；休息日也可能被固定周几催到。
2. 提醒没有静音时段、没有「稍后」、点通知不能直接打开记录。
3. 容量、部位分布、逐动作进步这些数字算出来了，但训练页只展示了很小一部分，AI 报告素材更浅（只有次数、分钟、动作个数）。
4. `training.aiReview*` 九语言 key 已经写好，但没有任何界面调用，属于死 key。
5. 记录时只能复制「单个动作的上次组数」，不能复制整场、不能用模板；不会提示「这个动作上次做了多少」。
6. 保存后只有一句 toast，没有「和上次比」的即时反馈。
7. 助手 `add_training` 的 JSON Schema 写着 `required: ['exercises']`，但描述说「只记时长也可以不传 exercises」，两者矛盾；`update_training` 不能改动作和组数。
8. 训练页现在有独立 `/training` 入口；通知点开仍没有深链。

---

## 2. 目标场景

验收时按场景走，不要按功能列表走。

### 场景 A：今天该不该练

用户晚上八点打开手机，不知道自己今天该练还是该休。
期望：如果按「练一休一」，昨天刚练过，今天**不提醒**；如果昨天是休息日，今天到点提醒一次，通知里写清「上次练了什么、隔了几天」，不写「你怎么又没练」。

用户可以选择：固定周几 / 练一休一 / 只做断档提醒 / 全关；提醒时刻；静音时段。

### 场景 B：刚练完，记一笔

用户做完 3 组俯卧撑，打开训练页。
期望：点「记一次」→「快速记」或「点选记」→ 选到「俯卧撑」时直接看到「上次 10-28：8 / 5 / 4」，可以一键沿用；保存后看到「本次 17 次，比上次 +4」。
用户可以选择：一句话、点选、快速；是否显示上次数据；是否套模板。

### 场景 C：周末回看

用户点「本周总结」。
期望：先看到次数、天数、容量、部位分布、最长空档；需要的话再点「AI 点评」，得到一段基于真实数字的评价和 3 条下次怎么练的建议。没有配模型也能看数字总结。

用户可以选择：只看数字 / 要 AI 点评；周 / 月 / 自定义区间。

### 场景 D：断了十天

用户十天没记录。
期望：断档提醒只发一次，语气中性，给一个低成本起点（「先做 10 分钟，或者把上次的拉日减半做」），不是连续轰炸。

用户可以选择：断档天数 2 / 3 / 5 / 7；关闭断档提醒。

### 场景 E：今天只打球

用户打了一小时羽毛球，不想填组数。
期望：快速记选「球类」→ 项目名「羽毛球」→ 60 分钟 → 感受 4 → 保存。不强制动作、不强制距离。
用户可以选择：项目名留空自动用类型名；距离可选；备注可选。

---

## 3. 设计原则：让用户自己选

| 能力 | 默认 | 在哪里开 |
| --- | --- | --- |
| 按计划提醒 | 关 | 训练页「训练提醒」面板 |
| 练一休一节奏 | 关（默认固定周几） | 同上 |
| 断档提醒 | 开，3 天 | 同上 |
| 静音时段 | 未设置 | 同上 |
| 今日建议 / 模板 | 关 | 同上 + 详情页「存为模板」 |
| 保存后和上次比 | 开（只显示，不打扰） | 详情页可见，无需开关 |
| AI 训练点评 | 不自动，按钮触发 | 训练页 / 回顾页按钮 |
| 动作历史提示 | 开 | 表单内折叠，可关 |

硬规则：

- **不新增必填字段**。只记时长、只记项目名、只记备注都合法。
- **不自动调模型**。打开页面、保存记录都不发请求；点评必须用户点。
- **提醒不连发**。同一类提醒每天最多一次；休息日不催计划提醒。
- **AI 只读已有数据**。可以读体重、睡眠、饮食做恢复判断，但不写别的模块。
- **失败了不挡路**。模型失败、通知没权限、模板损坏，都退回手动路径，不弹错误对话框。

---

## 4. 提醒：从「周几」到「节奏」（P0）

### 4.1 数据扩展

`TrainingPlan` 只加可选字段，旧档案缺字段按默认值走：

```ts
/** 提醒节奏：固定周几 / 练一休一 */
export type TrainingRhythm = 'weekly' | 'alternate'

export interface TrainingPlan {
  enabled: boolean
  weeklyDays: number[]
  time: string
  nudgeAfterDays: number

  /** 新增：缺省按 'weekly'，旧档案不用迁移 */
  rhythm?: TrainingRhythm
  /** 新增：静音时段，'HH:MM'；两个都填才生效 */
  quietFrom?: string
  quietTo?: string
  /** 新增：通知里是否带上次训练摘要，默认 false */
  includeLast?: boolean
}
```

`normalizePlan` 补默认值与容错：

- `rhythm` 不是合法值 → `'weekly'`
- `quietFrom` / `quietTo` 不匹配 `HH:MM` → 丢掉
- 其他字段保持现有逻辑

### 4.2 纯函数（`trainingPlan.ts`）

新增：

```ts
/** 今天是不是该练：weekly 看周几；alternate 看距上次训练是否 ≥ 2 天 */
export function isDueToday(
  plan: TrainingPlan,
  lastTrainingDate: string | null,
  today: string,
): boolean

/** 下一次该练的日期；weekly 找最近的周几，alternate 取 last + 2 天 */
export function nextDueDate(
  plan: TrainingPlan,
  lastTrainingDate: string | null,
  today: string,
): string | null

/** 静音时段判断；支持跨午夜（例如 23:30–07:00） */
export function inQuietHours(clock: string, from?: string, to?: string): boolean
```

`shouldRemindPlan` 改成：

```ts
export interface RemindInput {
  plan: TrainingPlan
  dateKey: string
  clock: string
  trainedToday: boolean
  notifiedToday: boolean
  /** 新增：最近一次训练日期，没有传 null */
  lastTrainingDate: string | null
}
```

判定顺序：

1. 开关关；weekly 模式下周几为空 → 不提醒
2. 今天已练 → 不提醒
3. 今天已提醒过 → 不提醒
4. 静音时段 → 不提醒
5. `isDueToday` 为 false → 不提醒
6. 到点 → 提醒

`shouldNudge` 保持独立，不受 `rhythm` 影响；`nudgeAfterDays = 0` 仍是关闭。

**alternate 的语义**：练完当天算第 0 天，次日休息，第 2 天起为「该练」。没有历史记录时，今天到点提醒一次。若同时开着断档提醒、空档已达到 `nudgeAfterDays`，计划提醒让位给断档提醒，避免同一天两条通知；断档提醒本身每天最多一次。

**注意**：`TrainingPlanPanel` 现在有「enabled 且 weeklyDays 为空就报错」的校验，要改成只对 `weekly` 生效，否则 alternate 模式会被拦下。

### 4.3 通知与重排

现有 `syncTrainingReminder(plan)` 只处理固定周几的周重复通知。改造：

```ts
export async function syncTrainingReminder(
  plan: TrainingPlan | undefined,
  lastTrainingDate: string | null,
): Promise<void>
```

- **weekly**：保持现有「按周几排重复通知」。
- **alternate**：用 `nextDueDate` 往后算 8 次，`LocalNotifications.schedule` 排成一次性通知（`schedule.at`），不要用 `every: 'week'`。
- 每次**保存 / 删除 / 恢复训练**、保存计划、应用启动，都重新调一次 `syncTrainingReminder`。目前只有计划变化时同步，这是 alternate 模式会失效的主要原因。
- 关掉开关或切回 weekly 时，先 `cancel` 所有可能用过的 id（现有 `ALL_IDS` 已覆盖 77130–77136、77140）。
- 通知 `extra` 带上深链：`{ route: '/training?date=<today>&add=1' }`。安卓在应用启动时监听 `localNotificationActionPerformed`，跳转到该路由。网页端点击 `notification.onclick` 时 `window.focus()` 并跳到同一路由。
- `includeLast` 为 true 时，通知正文追加「上次：<标题> · <日期>」，在 `syncTrainingReminder` 内部用 `latestTraining()` 取标题和时间，不要把整条记录塞进通知。

### 4.4 文案

| 场景 | 标题 | 正文 |
| --- | --- | --- |
| 固定计划日 | 今天该练了 | 练完记得记一笔，别断了节奏。 |
| 练一休一 | 今天该练了 | 昨天休息过了，今天练完记一笔。 |
| 断档 | 有一阵没练了 | 已经 {n} 天没记录，先动 10 分钟也算。 |
| 带上次摘要 | 今天该练了 | 上次：{标题} · {日期}。练完记一笔。 |

文案不要出现「坚持」「自律」「别放弃」这类说教词。中文真源写 `zh.ts`，九语言同步。

### 4.5 验收

- [ ] 练一休一：10-28 练、10-29 不提醒、10-30 到点提醒一次。
- [ ] 10-30 已练过，10-31 不提醒。
- [ ] 静音 23:30–07:00 时，07:00 前不弹。
- [ ] 关掉提醒后，安卓已排的通知全部取消。
- [ ] 保存一次训练后，alternate 的下一次提醒日期立即后移。
- [ ] 点通知能打开训练页；带 `add=1` 时直接弹记录表单。

---

## 5. 训练模板与「今天练什么」（P1，可选）

这一块直接对应「给用户更多选择」：不强制计划，用户想建就建。

### 5.1 数据

模板存进 `TrainingPlan`，不新建表：

```ts
export interface TrainingTemplate {
  id: string
  name: string
  kind: TrainingKind
  /** 复用动作结构；sets 里的数字当作目标值，可以全是 null */
  exercises: TrainingExercise[]
}

// TrainingPlan 里加：
templates?: TrainingTemplate[]
```

备份、导入、合并都跟着 `profile.trainingPlan` 走，不需要改备份结构。

### 5.2 创建与编辑

- 训练详情弹窗底部加「存为模板」，把当前记录的标题和动作复制成模板（组数照抄）。
- 提醒面板下方加「训练模板」折叠区：列出模板、重命名、删除、上下移。
- 模板上限建议 8 个；超过时提示先删。不要做复杂的计划编排器。

### 5.3 轮换

```ts
/** 上次练的标题命中某个模板名，就返回下一个模板；否则返回第一个 */
export function nextTemplate(
  templates: TrainingTemplate[],
  lastTraining: HealthTraining | null,
): TrainingTemplate | null
```

按数组顺序轮换，不做「每周几固定 A/B」的复杂映射。

### 5.4 今日建议卡

条件：`enabled && isDueToday && templates.length > 0`，且用户当天没点「今天不练」。

内容：

```
今天：拉日
背 · 4 个动作 · 约 12 组
床板划船 / 门框划船 / 书包弯举
[按模板开始] [换一个] [今天不练]
```

- 「按模板开始」打开 `TrainingForm` 并预填模板动作，时间用当前时刻，日期用今天。
- 「换一个」只在本地下一次选择里轮换，不改模板顺序。
- 「今天不练」写 `localStorage`，键带日期，仅当天生效。
- 模板为空或关闭时，卡片不出现；不要把空卡片留在页面上。

---

## 6. 记录体验（P0/P1）

### 6.1 复制整场（P1）

在「记一次」的入口页加第四个选项「复制上次」，或放在点选表单顶部。行为：

- 取 `latestTraining()`，把 `exercises` 和 `sets` 全部映射成草稿。
- 标题、类型保留；日期换成当前日期，时间换成当前时刻；备注清空。
- 没有历史记录时按钮置灰，不弹错误。

### 6.2 动作历史提示（P0，只读）

新增纯函数：

```ts
export interface LastPerformance {
  dateKey: string
  sets: TrainingSet[]
  volumeKg: number
}

/** 在最近 lookbackDays 天里找同名动作的最后一次；没有返回 null */
export function lastPerformanceOf(
  name: string,
  trainings: HealthTraining[],
  today: string,
  lookbackDays = 90,
): LastPerformance | null
```

UI：在点选表单里，每个动作名下显示一行小字：

```
上次 10-28：8 / 5 / 4（自重）
[用上次数字]
```

- 「用上次数字」把该动作的 sets 填进去，用户仍可改。
- 匹配用 `name.trim()` 完全相等，不做模糊匹配，避免「卧推」吃到「上斜卧推」。
- 不自动填，避免用户没注意就保存了旧数据。

### 6.3 容量口径（必须写清）

- 有 `reps` 且有 `weightKg` 才进容量：`Σ reps × weightKg`。
- 自重动作只报组数、次数，**不要把体重乘进去**冒充容量。
- 训练页大数字规则保持：容量 > 0 显示容量，否则显示时长。
- 详情、列表、助手、AI 报告共用 `trainingMath.ts`，不要各算一套。

### 6.4 快速记的预设（P1）

- 项目名输入框下方给最近 60 天用过的项目（按次数排序，最多 6 个），然后才是内置动作库里的有氧/球类。
- 点一下只填项目名，不自动填时长，避免误记。
- 常用项：跑步、快走、骑行、羽毛球、篮球、乒乓球、跳绳、拉伸。

### 6.5 一句话记的增强（P0）

`trainingPhrase.ts` 的提示词补充规则：

- 日期：「今天 / 昨天 / 前天 / 10-28」转成 `dateKey`；识别不了用今天。
- 时长：「半小时」「40 分钟」「1 个半小时」统一转分钟。
- 距离：「5 公里」「5km」「5000 米」统一转公里。
- 自重：只有次数时 `weightKg` 必须是 `null`，不许估体重。
- 球类 / 拉伸：允许只给 `durationMin`，`sets: []`。
- 最多 6 个动作；超出的合并或截断，不丢整条。
- 不确定的数字一律 `null`，不要编造。

失败路径保持现状：保留原文，给「改用手动记录」，不清空输入。

新增测试用例：

| 输入 | 期望 |
| --- | --- |
| 昨天卧推 3 组 8/8/6 40 公斤 | `dateKey` 为昨天；3 组；负重 40 |
| 今天跑了 5 公里，半小时 | `kind: cardio`；`durationMin: 30`；`distanceKm: 5` |
| 打了 1 小时羽毛球 | `kind: sport`；60 分钟；不要求动作 |
| 俯卧撑 8 5 4 | 3 组；`weightKg: null` |
| 不知道说了什么 | 解析失败，原文保留 |

### 6.6 保存后的即时反馈（P0）

保存成功仍然只 toast，不弹新窗口。详情弹窗里加一块「和上次比」：

```ts
export interface SessionComparison {
  exercise: string
  previousDate: string
  currentSets: TrainingSet[]
  previousSets: TrainingSet[]
  /** 只在该动作两次都有负重时计算 */
  volumeDelta: number | null
  repsDelta: number | null
}

export function compareWithPrevious(
  training: HealthTraining,
  trainings: HealthTraining[],
): SessionComparison[]
```

展示规则：

- 只和同名动作的上一次比：排除自身 id，只看 `dateKey` 更早（同日则 `time` 更早）的未删除记录。
- 没有历史就不显示这一块，不写「首次」以外的评价。
- 不做红绿对错判断，只报数字。
- AI 点评不在这里自动触发。

---

## 7. 总结：先有数字，再谈评价（P0）

### 7.1 纯数学补全（`trainingMath.ts`）

```ts
export interface MuscleSlice {
  muscle: string
  sets: number
  reps: number
  volumeKg: number
}

/** 区间内按部位汇总；只统计未删除记录 */
export function muscleBreakdown(trainings: HealthTraining[]): MuscleSlice[]

export interface ExerciseTrendPoint {
  dateKey: string
  sets: TrainingSet[]
  volumeKg: number
  reps: number
}

/** 同名动作的历次表现，日期升序 */
export function exerciseHistory(
  trainings: HealthTraining[],
  name: string,
): ExerciseTrendPoint[]

export interface ExerciseProgress {
  name: string
  sessions: number
  firstDate: string
  lastDate: string
  firstVolumeKg: number
  lastVolumeKg: number
  bestVolumeKg: number
  /** 只在首尾都有负重时给 */
  volumeDelta: number | null
}

export function exerciseProgress(trainings: HealthTraining[]): ExerciseProgress[]

export interface Consistency {
  trainingDays: number
  longestGapDays: number
  averageGapDays: number | null
}

export function consistency(trainings: HealthTraining[], from: string, to: string): Consistency
```

`summarizeWeek` 增加两个字段：`previousSessions`、`previousDays`，方便页面直接显示「次数」的环比，而不是只有容量环比。

### 7.2 训练页的本周卡

在现有进度环卡片下方追加（保持紧凑，不做图表库）：

- 部位分布：每个部位一条细进度条 + 「胸 12 组」。
- 节奏：`本周 4 天 · 最长空档 2 天`。
- 环比：`次数 4（上周 3）· 容量 1,240 kg（上周 +8%）`。
- 动作进步：最近两次都出现的动作，取 3 个显示 `俯卧撑 15 → 17 次`。

没有数据的行直接省略，不要显示 0 或「—」堆满屏幕。

### 7.3 训练专项 AI 点评

现有 `aiReport.ts` 是全生活回顾，训练只是其中一段。这里要的是**训练视角**的点评。

新建 `src/features/training/trainingReview.ts`：

```ts
export interface TrainingReviewPeriod {
  from: string
  to: string
  label: string
}

/** 素材：本期 / 上期总量、逐日、逐动作、体重、睡眠，全部来自现有数据 */
export function buildTrainingReviewPrompt(
  data: BackupData,
  period: TrainingReviewPeriod,
): { system: string; user: string }

export async function composeTrainingReview(
  config: AiConfig,
  data: BackupData,
  period: TrainingReviewPeriod,
): Promise<ReportResult>
```

**素材必须包含**：

- 本期：次数、天数、总组数、总次数、容量、总时长。
- 上期同口径（没有就写「上期无记录」）。
- 部位分布：部位、组数、容量。
- 逐日：日期、标题、时长、部位、动作与每组数字（动作多时截断到前 6 个，但要注明截断）。
- 逐动作最近 5 次：日期 + 每组数字。
- 体重：区间内称重序列（没有就写没有）。
- 睡眠：有记录夜数、平均时长、质量均分（没有就写没有）。
- 计划：节奏、计划天数、实际天数。

**系统提示词规则**：

```
你在帮用户回顾训练，不是写励志文。
- 只使用素材里真实出现的事实，数字不许编
- 有负重才谈容量（Σ 次数×负重）；自重动作只报组数和次数，不要把体重当负重
- 动作进步只和同名动作比，不同动作不横比
- 素材没有运动消耗数据，不要估算千卡，不要写「扣运动后」
- 恢复只看睡眠和体重序列，不做医学判断；出现疼痛、异常只建议停下并就医
- 频率看训练天数与最长空档，不因单日没练下结论
- 结构固定：## 结论 / ## 训练量与频率 / ## 部位与动作 / ## 恢复 / ## 下次怎么练
- 「下次怎么练」给 3 条能直接执行的动作级建议，和前面的问题对得上
- 200–500 字，平实，第一人称，不写开场白
- 素材不足的段落整段省略，不要硬凑
```

**界面**：

- 训练页本周卡右上角按钮「AI 点评本周」，用现有的 `training.aiReview*` key。
- 回顾页的周报入口保持现状；训练点评可选加第二个按钮，但不要重复占位。
- 新建 `TrainingReviewDialog.tsx`，交互照 `AiReportDialog.tsx`：加载中、失败可重试、结果可复制。不要改 `AiReportDialog` 的既有行为。
- 没配模型时按钮置灰，提示「先在设置里配置模型」；不要偷偷回退到别的模型。
- 结果不自动写进日记。想保存就加一个「存为随记」按钮（可选，P2）。

**必须新增的测试**：

- 没有任何训练时，提示「先记几次再点评」，不调模型。
- 只有自重动作时，素材里不出现 kg 容量。
- 有体重和睡眠时，素材包含序列与均分；没有时写「没有记录」。
- 上期无数据时，不输出「比上周 0%」。

### 7.4 把训练素材补进全库报告（P0）

现有 `aiReport.ts` 的训练素材太浅，只写了标题、时长、感受、动作个数。至少补到：

- `dayLines`：`训练：拉日，45 分钟，感受 4/5；容量 1,240 kg，12 组；背 8 组、手臂 4 组；动作：床板划船、门框划船`
- `totalsLines`：训练次数、天数、容量、总组数、部位前三、最长空档。
- 系统提示词加一句：「训练量只看有负重的组，自重只报次数；不要估算消耗」。
- 报告周期用 `weekRange` 等现有工具，不要另写日期逻辑。
- 部位名在提示词里用固定中文映射（`chest → 胸`……），直接写在 `aiReport.ts` 的本地常量里，不要 import React i18n context；报告正文本来就是中文。

这样用户即使不用训练专项点评，日报 / 周报里的训练段也不会只剩「练了 1 次，45 分钟」。

---

## 8. 助手补强（P1）

### 8.1 修 Schema 与行为不一致

- `add_training` 的 `required` 从 `['exercises']` 去掉，和描述里的「只记时长也可以不传」一致。
- `buildAssistantAction` 的 `add_training` 分支补「没有动作但有时长 / 备注」的合法路径，不能因为 `exercises` 为空就失败。
- 至少要有动作、时长、备注三者之一，否则返回可读错误。

### 8.2 `update_training` 支持改动作

- Schema 加 `exercises` 数组（结构同 `add_training`）。
- 传了 `exercises` 就整体替换；不传就保留原动作。不要做逐组补丁，模型很难稳定输出。
- 校验：动作名不能为空；数字越界置 `null`；`sets` 可以为空数组。
- 动作卡预览显示「替换为 N 个动作 / M 组」。

### 8.3 `training_stats` 输出补深度

现在只有次数、天数、总组数、容量、部位次数、逐次动作名。补充：

- 容量按部位拆分。
- 每个动作最近一次与最佳容量（只对同名动作）。
- 最长空档天数、最近一次训练距今天数。
- 保留 `[code]`，方便后续 `update_training` / `delete_training` 引用。
- 输出控制在 30 行内，逐次记录只列日期、标题、动作名，不要展开每组。

### 8.4 新增只读工具 `training_today`（可选，P2）

回答「今天练什么」时，避免模型自己瞎编：

```
今天是否该练、按什么节奏、最近一次训练、计划模板、最近 3 天部位、最近一晚睡眠与最近体重
```

只读，不产出 action。没有模板时如实写「没有模板」，不要生成一份训练计划。

### 8.5 写操作规则不变

预览 → 用户确认 → 落库；删除进回收站；刚写完可撤销。助手不能绕过确认直接写。

---

## 9. 入口与深链

- 保持健康首页的训练卡（已有）。
- 底部导航是否加「训练」取决于 320px 宽度实测；加之前先看四格会不会挤成两行。**不加也可以**，不要为了导航改坏现有布局。
- 训练页支持查询参数：
  - `date=YYYY-MM-DD`：已支持。
  - `add=1`：打开页面后直接弹「记一次」。
  - `plan=1`：直接打开提醒面板。
- 通知点击、助手动作卡、外部深链都走这几个参数，不要新造路由。

---

## 10. 数据与兼容

- 所有新增字段都是可选的；`normalizePlan` / `pickProfile` 负责补默认值。
- 模板存在 `profile.trainingPlan.templates`，跟着档案走，不需要新的备份 section。
- 不升 `BACKUP_VERSION`；旧备份缺字段按空处理。
- 保存计划时继续用 `saveHealthProfile({ ...base, trainingPlan: plan })`，不要只传 `trainingPlan` 覆盖掉档案其他字段。
- 训练记录仍是「一条记录一个文档」，`exercises` / `sets` 不拆表。
- 部位、类型继续存英文枚举，中文只在 i18n。

---

## 11. 文件改动清单

| 优先级 | 文件 | 改什么 |
| --- | --- | --- |
| P0 | `src/core/db/schema.ts` | `TrainingRhythm`、`TrainingPlan` 可选字段、`TrainingTemplate` |
| P0 | `src/features/training/trainingPlan.ts` | `isDueToday` / `nextDueDate` / `inQuietHours`；`shouldRemindPlan` 加 `lastTrainingDate`；normalize |
| P0 | `src/features/training/trainingNotify.ts` | alternate 一次性通知、静音、深链、重排入口 |
| P0 | `src/features/training/TrainingPage.tsx` | 保存 / 删除 / 恢复后重排；`add=1` / `plan=1`；今日建议卡；本周卡增强；AI 点评按钮 |
| P0 | `src/features/health/HealthPage.tsx` | `syncTrainingReminder` 新签名；传最近训练日期 |
| P0 | `src/features/training/trainingMath.ts` | `muscleBreakdown` / `exerciseHistory` / `exerciseProgress` / `consistency` / `compareWithPrevious` / `lastPerformanceOf` |
| P0 | `src/features/training/trainingPhrase.ts` | 日期、时长、距离、自重、球类的提示词与解析 |
| P0 | `src/features/training/trainingReview.ts`（新建） | 训练专项素材与提示词 |
| P0 | `src/features/training/TrainingReviewDialog.tsx`（新建） | 点评弹窗 |
| P0 | `src/features/ai/aiReport.ts` | 训练素材补容量、部位、动作进步 |
| P1 | `src/features/training/TrainingPlanPanel.tsx` | 节奏、静音、模板、通知摘要 |
| P1 | `src/features/training/TrainingForm.tsx` | 复制整场、动作历史、用上次数字、最近项目 |
| P1 | `src/features/training/TrainingDetailDialog.tsx` | 和上次比、存为模板 |
| P1 | `src/features/assistant/assistantTools.ts` | 修 `required`；`update_training` 支持 exercises；stats 增强；可选 `training_today` |
| P1 | `src/features/assistant/assistantActionBuild.ts` | 动作替换、时长-only 训练 |
| P1 | `src/shared/i18n/messages/*.ts` | 新 key，九语言 |
| P2 | `src/app/layout/AppShell.tsx` | 可选导航项 + 通知点击监听 |
| P2 | `src/app/router.tsx` | 如加深链路由参数，不改 path |

---

## 12. i18n 新 key

先写 `zh.ts`，再补其余八份。`Record<MessageKey, string>` 会强制补全。

| key | 中文 |
| --- | --- |
| `training.rhythm` | 提醒节奏 |
| `training.rhythm.weekly` | 固定周几 |
| `training.rhythm.alternate` | 练一休一 |
| `training.rhythm.hint` | 练一休一：练完次日不催，隔一天再提醒 |
| `training.quiet` | 静音时段 |
| `training.quiet.from` | 从 |
| `training.quiet.to` | 到 |
| `training.includeLast` | 通知里带上次训练 |
| `training.copySession` | 复制上次整场 |
| `training.copySessionEmpty` | 还没有可复制的训练 |
| `training.lastTime` | 上次 {date} |
| `training.useLast` | 用上次数字 |
| `training.bodyweightOnly` | 自重 |
| `training.compareTitle` | 和上次比 |
| `training.compareVolume` | 容量 {delta} |
| `training.compareReps` | 次数 {delta} |
| `training.muscleBreakdown` | 部位分布 |
| `training.consistency` | 本周 {days} 天 · 最长空档 {gap} 天 |
| `training.progressTitle` | 动作进步 |
| `training.reviewTitle` | 训练点评 |
| `training.reviewEmpty` | 先记几次训练再点评 |
| `training.reviewBusy` | 正在整理… |
| `training.reviewFail` | 这次没生成成功，稍后重试 |
| `training.reviewCopy` | 复制点评 |
| `training.reviewNeedModel` | 先在设置里配置模型 |
| `training.template.title` | 训练模板 |
| `training.template.save` | 存为模板 |
| `training.template.empty` | 还没有模板 |
| `training.template.saved` | 已存为模板 |
| `training.template.next` | 换一个 |
| `training.template.start` | 按模板开始 |
| `training.todaySkip` | 今天不练 |
| `training.todayTitle` | 今天：{name} |
| `training.notifyLast` | 上次：{title} · {date} |
| `training.notifyAlternate` | 昨天休息过了，今天练完记一笔。 |
| `training.actionReplace` | 替换动作 |
| `training.statsGap` | 最近一次 {n} 天前 |
| `training.statsBest` | 最佳 {volume} |

已有但没用的 `training.aiReview*` 要么接到新按钮，要么删掉，不要留着两套文案。

---

## 13. 测试

### 13.1 必补单测

| 文件 | 用例 |
| --- | --- |
| `trainingPlan.test.ts` | weekly 命中；alternate 练完次日不提醒；alternate 第 2 天提醒；今天已练不提醒；静音同日 / 跨午夜；无历史时首次提醒；`nudgeAfterDays=0` 关闭 |
| `trainingMath.test.ts` | 部位容量只算有负重；自重不进容量；`exerciseHistory` 同名匹配、忽略软删；`exerciseProgress` 首尾与最佳；`consistency` 最长空档；`compareWithPrevious` 无历史返回空 |
| `trainingPhrase.test.ts` | §6.5 表格五条；围栏；坏 JSON；越界数字 |
| `trainingReview.test.ts`（新建） | 无训练提示；只有自重时不出现 kg；有 / 无体重睡眠；上期无数据 |
| `assistantTools.test.ts` | `training_stats` 含容量、部位、空档、code；时长-only 的 `add_training` |
| `assistantActionBuild.test.ts` | `add_training` 无 exercises 合法；`update_training` 替换动作；空动作名失败 |
| `aiReport.test.ts` | 训练行含容量、部位；无负重时不出现容量 |
| `diaryBackup.test.ts` | 带 templates 的档案往返；旧档案无 templates |

### 13.2 手测

- 安卓真机：设「练一休一」→ 保存一次训练 → 杀进程 → 次日 / 隔日通知是否符合预期；点通知是否直达。
- 网页：关掉页面不会通知，这是预期，不要当 bug。
- 通知权限拒绝后不再反复弹权限框。
- 静音时段内不弹；时段结束后当天仍可补一次。
- 训练页在 320px 宽度下，今日建议卡、部位条、对比块不溢出。
- 深浅主题下进度条、徽标对比度正常。

### 13.3 命令

```bash
node package/run-tests.cjs
npm run typecheck
npm run lint
```

三项全绿再提交。提交信息中文、不带 AI 标注。

---

## 14. 分阶段交付

### 阶段 1（P0）：提醒节奏与即时反馈

1. `TrainingPlan` 可选字段 + normalize
2. `isDueToday` / `nextDueDate` / `inQuietHours`
3. `syncTrainingReminder` 新签名，保存 / 删除 / 恢复后重排
4. 提醒面板加节奏与静音
5. 详情弹窗「和上次比」
6. 单测

**验收**：场景 A、B 走通；关掉提醒后安卓不再响。

### 阶段 2（P0）：训练专项总结

1. `trainingMath` 四个新函数
2. 本周卡增强
3. `trainingReview.ts` + `TrainingReviewDialog`
4. `aiReport.ts` 训练素材补全
5. 单测

**验收**：场景 C 走通；没配模型时只显示数字；AI 点评不自动触发。

### 阶段 3（P1）：记录选择

1. 复制整场
2. 动作历史 + 用上次数字
3. 一句话记的日期 / 时长 / 距离 / 自重
4. 模板 + 今日建议卡
5. 快速记最近项目
6. 单测

**验收**：场景 B、E 走通；空字段不报错。

### 阶段 4（P1/P2）：助手与入口

1. 修 `add_training` required、`update_training` 动作替换
2. `training_stats` 增强
3. 可选 `training_today`
4. 通知深链、`add=1` / `plan=1`
5. 可选导航项

**验收**：对助手说「昨天跑了 5 公里半小时」「把最近一次卧推改成 4 组」都能生成正确的待确认卡。

---

## 15. 交付前自查

**体验**

- [ ] 练一休一时，休息日不催；该练那天只提醒一次。
- [ ] 提醒正文不带说教词；能关、能静音、能改时刻。
- [ ] 保存训练后，alternate 的下次提醒立即后移。
- [ ] 点通知能打开训练页；深链参数不报错。
- [ ] 只记时长的有氧、只记项目的球类、只记备注的记录都能保存。
- [ ] 一句话记能处理昨天、半小时、5 公里、自重、球类。
- [ ] 动作历史只提示不自动填；「用上次数字」可撤回修改。
- [ ] 详情页「和上次比」没有历史时不显示。
- [ ] 本周卡所有数字与手算一致；没有数据的行省略。
- [ ] AI 点评必须手动点；失败可重试；没模型有明确提示。

**数据**

- [ ] 旧档案（无 rhythm / templates / quiet）正常打开，提醒按 weekly 工作。
- [ ] 带模板的档案导出 → 清库 → 导入，模板与动作完整。
- [ ] 软删的训练不进入统计、AI 素材和助手统计。
- [ ] 备份版本号没动，旧备份能导入。

**工程**

- [ ] `node package/run-tests.cjs` 全绿。
- [ ] `npm run typecheck` / `npm run lint` 无错。
- [ ] 九语言 key 齐全，占位符一致；没有死 key。
- [ ] 没有新建表、没有拆 `exercises` / `sets`、没有存中文枚举。
- [ ] 没碰 `.local/`、密钥、别人未提交的改动。
- [ ] 没跑全量格式化。

---

## 16. 不做与常见坑

**本阶段不做**

- 实时组间倒计时、训练中计时器
- 多周周期编排、递增负荷、Deload 自动生成
- 动作视频、肌肉热力图、可穿戴直连
- 社交分享、排行榜、云同步
- 把体重乘进自重容量
- 模型自动生成训练计划并直接落库

**已知坑**

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| alternate 只在计划页重排 | 保存训练后仍按旧日期提醒 | 保存 / 删除 / 恢复都调 `syncTrainingReminder` |
| Windows / 时区算天数 | 隔日提醒差一天 | 一律用 `shiftDay` 与 `daysBetween`，不要 `new Date()` 相减 |
| 静音跨午夜判断错 | 23:30–07:00 只在一边生效 | 分段判断：`from > to` 时命中 `>= from || < to` |
| 保存计划覆盖档案 | 体重、目标线丢失 | 永远 `{ ...base, trainingPlan }` |
| 通知 id 撞车 | 覆盖称重提醒 | 继续用 77130–77136、77140 |
| 取消通知只取消当前 id | 改节奏后旧通知还响 | 先取消 `ALL_IDS` 再排 |
| `add_training` required 写错 | 只记时长时模型被迫编动作 | Schema 与校验同时改 |
| 统计没过滤软删 | 回收站记录进容量 | 所有新函数入口先 `deletedAt === null` |
| 自重算进容量 | 容量虚高 | 只认 `reps && weightKg` |
| AI 素材塞整库 | 请求过大、模型跑偏 | 只给区间内、截断动作、逐条摘要 |
| 新 key 只补中文 | typecheck 过不了 / 运行时 fallback | 九份一起补 |
| 覆盖层直接挂内容区 | 安卓被底部栏压住 | 走 `Modal`（已 `createPortal`） |

---

## 17. 参考

- 第一阶段构建指导：[TRAINING-MODULE.md](TRAINING-MODULE.md)
- 架构与存储选型：[PROJECT-NOTES.md](PROJECT-NOTES.md)
- 训练数学：`src/features/training/trainingMath.ts`
- 提醒判断：`src/features/training/trainingPlan.ts`
- 通知：`src/features/training/trainingNotify.ts`、`src/features/health/weighNotify.ts`
- AI 报告：`src/features/ai/aiReport.ts`、`src/features/ai/AiReportDialog.tsx`
- 助手工具：`src/features/assistant/assistantTools.ts`、`assistantActionBuild.ts`
- 数据层：`src/core/db/schema.ts`、`store.ts`、`normalize.ts`、`electron/database.cjs`
