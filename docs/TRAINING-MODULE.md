# 训练模块开发指导

给接手「训练 / 健身」板块的 AI。本文是这一块唯一的落地口径，按顺序读完就能动手，不需要再摸一遍架构。

> 第一阶段的代码已落地。下一步的体验补完（提醒节奏、训练模板、即时反馈、训练专项 AI 点评）见 [TRAINING-EXPERIENCE.md](TRAINING-EXPERIENCE.md)。

通用规矩（提交、密钥、构建、多 AI 并行）见 [AGENTS.md](../AGENTS.md)；架构与存储选型见 [docs/PROJECT-NOTES.md](PROJECT-NOTES.md)。本文只补训练模块特有的部分。

---

## 1. 这份文档怎么用

| 你要做的事 | 看哪节 |
| --- | --- |
| 先弄清要做什么、边界在哪 | §2 §3 |
| 建数据表、接存储 | §4 §5 |
| 写计算与解析的纯函数 | §6 §7 |
| 让助手能记 / 改 / 删训练 | §8 |
| 做提醒 | §9 |
| 写页面、接路由 | §10 |
| 补九语言 | §11 |
| 接备份、导入导出、合并冲突 | §12 |
| 写测试、自测 | §13 |
| 排期与交付顺序 | §14 |
| 交付前逐项对照 | §15 §16 |

**执行原则**

- 先让数据层跑通再写 UI，不要一边建表一边调样式。
- 每个阶段结束跑一次 `node package/run-tests.cjs && npm run typecheck && npm run lint`。
- 不确定的交互先做最朴素的一版，别提前造配置项。
- 工作区可能有别的 AI 在改同一仓库：动手前 `git status`，只动自己需要的文件，别人的未提交改动不碰、不提交。

---

## 2. 范围与验收目标

### 2.1 必须做到

1. 能记录任意类型运动：力量、自重、有氧、拉伸、球类/其他。
2. 三种记录入口，用户自己选：一句话记、点选记、快速记。
3. 按天翻看、编辑、软删、撤销、回收站、批量删。
4. 当天小结与本周总结自动算，不调模型。
5. 训练提醒：按计划（周几 + 时刻）与断档（连续 N 天没练）。
6. 数据进备份、记录级导出、导入、合并冲突比较。
7. 助手能记一次训练、改、删、查统计。
8. 九种语言、深浅主题、安卓与桌面都能用。

### 2.2 明确不做（本版）

- 不做训练计划编排器（多周周期、递增负荷、Deload 自动生成）。
- 不做动作视频、3D 示范、肌肉热力图。
- 不做账号、云同步、社区、分享卡片。
- 不做可穿戴设备直连（等健康模块的 Health Connect 扩展再说）。
- 不做训练中的实时计时器与休息倒计时（下一版再议）。

范围外的东西不要顺手加，也不要为它们预留一堆空开关。

---

## 3. 产品需求（细）

### 3.1 信息架构

- 顶级页 `/training`，名字叫「训练」。
- 底部「记录」菜单加第四项，与日记 / 健康 / 收支并列。
- 健康首页加一张训练卡：显示今天练了没有、本周次数，点进去到 `/training`。
- 二级页：`/training/trash`（回收站）。

### 3.2 三种记录入口

进入「记一次」后先让用户选方式，三个按钮平铺，各带一句说明：

| 入口 | 说明文案要点 | 交互细节 |
| --- | --- | --- |
| 一句话记 | 「打一句话，我帮你拆成动作和组数」 | 单行输入 + 示例占位；提交后调模型；返回结构 → 可改确认卡 → 确认落库 |
| 点选记 | 「选动作，逐组填次数和负重」 | 动作搜索框 + 内置动作库；可加自定义动作；每组一行；「复制上次同动作」；可加备注 |
| 快速记 | 「有氧、拉伸、球类，只填时长」 | 项目名（可留空自动用类型名）、时长分钟、距离公里（可选）、强度感受 1–5、备注 |

三者写入同一张表，差别只在填了哪些字段。

### 3.3 字段映射

| 用户操作 | 写入字段 |
| --- | --- |
| 选类型（力量 / 自重 / 有氧 / 拉伸 / 球类 / 其他） | `kind` |
| 动作名 | `exercises[].name` |
| 部位标签 | `exercises[].muscle` |
| 一组次数 / 负重 / 时长 / 休息 / RPE | `exercises[].sets[]` 对应字段 |
| 有氧距离 | `exercises[].distanceKm` |
| 整场时长 | `durationMin` |
| 强度感受 | `feeling`（1–5） |
| 备注 | `note` |
| 开始时刻 | `time`（`HH:MM`） |

**规则**：空就是空，不做必填校验。一条只有 `durationMin` 的记录是合法的；一条只有动作名、一组都没填的记录也是合法的。

### 3.4 列表页

顶部顺序固定：

1. `PageShell` 标题「训练」+ 返回。
2. `DayNav` 日期栏（支持 `useDaySwipe` 左右滑动换天）。
3. 当天小结卡（见 §6.2）。
4. 记录列表（按 `time` 倒序）。
5. 操作条：`记一次`（主按钮）、`批量`、`回收站`（`ROW_ACTION` 级别）。

列表行显示：类型徽标、标题（没有标题就用第一个动作名或类型名）、开始时刻、动作数与总组数、总时长、备注首行截断。点整行进详情。

### 3.5 详情与编辑

- 详情展示每个动作的每组数据，力量显示「8 次 × 40 kg」，有氧显示「20 分钟 · 5.0 km」。
- 编辑复用记录表单，保存走 `saveHealthTraining`（同 id 覆盖，`updatedAt` 刷新）。
- 删除走 `removeHealthTraining`，删后 `useToast` 给「已删掉，可撤销」，撤销调 `restoreHealthTraining`。
- 回收站页：列表 + 「恢复」+「彻底删除」+「清空回收站」，彻底删除用 `ConfirmDialog`（`tone='danger'`）。

### 3.6 批量

沿用 `useBatchSelect()` + `BatchActions` + `RowCheckbox` + `BatchBar`：

- 批量删除 = 逐条软删（回收站里能恢复）。
- 换天自动退出批量，避免删到看不见的记录。

### 3.7 统计口径（必须在文档与代码里一致）

**当天小结**

- `totalSets`：所有动作的组数之和。
- `totalReps`：所有力量组 `reps` 之和（空值不计）。
- `volumeKg`：Σ (`reps` × `weightKg`)，两个值都有才计入。
- `totalDurationMin`：优先 `durationMin`；为空则 Σ 各动作 `durationMin`；再为空则 Σ 各组 `durationSec` ÷ 60，四舍五入。
- `muscles`：出现过的部位去重列表。

**本周总结**（周一为一周起点，用现有 `weekdayKey` / `shiftDay` 取范围）

- `sessions`：本周记录条数。
- `days`：本周有训练的天数（去重）。
- `volumeKg`：本周容量。
- `muscleCount`：部位 → 次数映射，用于分布条。
- `deltaVsLastWeek`：本周容量与上周容量的差（上周为 0 时不显示百分比，显示「首次」）。
- `gapDays`：最近一次训练距今天数（今天有训练则为 0）。

数值格式化：容量用 `kg`，超过 1000 用千位分隔；时长超过 60 分钟显示「1 小时 20 分」。格式化放纯函数里，组件不写。

### 3.8 提醒

两个独立开关，都放在训练页右上角齿轮进入的设置面板（也可放「我的 → 设置」，二选一，不要两处都做）：

| 提醒 | 字段 | 行为 |
| --- | --- | --- |
| 按计划 | `trainingPlan.weeklyDays` + `time` | 到了设定的周几和时刻，本地通知「今天该练了」 |
| 断档 | `trainingPlan.nudgeAfterDays`（默认 3） | 连续 N 天没有训练记录时提醒一次，当天只提醒一次 |

- 今天已经练过就不发计划提醒。
- 关掉开关立即 `cancel` 已排的通知。
- 没有通知权限时静默，不弹错误对话框。

### 3.9 AI 能力

- **一句话记**：把自然语言拆成结构化记录，先预览再落库。
- **助手对话**：`add_training / update_training / delete_training / training_stats`。
- **本周评价**：按钮触发，生成一段文字点评，失败静默。
- **不做**：每次打开页面自动调模型；把整库记录塞进请求。

---

## 4. 数据模型

追加到 [src/core/db/schema.ts](../src/core/db/schema.ts)，放在 `HealthSleep` 附近：

```ts
/** 运动大类：决定表单显示哪些字段 */
export type TrainingKind = 'strength' | 'cardio' | 'mobility' | 'sport' | 'other'

/** 一组。没填的字段一律 null，不要用 0 冒充「没填」 */
export interface TrainingSet {
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  restSec: number | null
  /** 自觉强度 1–10 */
  rpe: number | null
}

export interface TrainingExercise {
  id: string
  name: string
  kind: TrainingKind
  /** 部位：chest / back / legs / shoulders / arms / core / fullBody / cardio / other */
  muscle: string
  sets: TrainingSet[]
  durationMin: number | null
  distanceKm: number | null
  note: string
}

export interface HealthTraining {
  id: string
  /** 7 位十六进制短编号，和日记 / 随记一致 */
  code: string
  /** YYYY-MM-DD */
  dateKey: string
  /** 开始时刻 HH:MM */
  time: string
  kind: TrainingKind
  title: string
  exercises: TrainingExercise[]
  durationMin: number | null
  /** 主观感受 1–5 */
  feeling: number | null
  note: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}
```

**设计约束**

- `exercises` 与 `sets` 是**嵌套数组**，不要拆表。一条训练记录就是一个完整文档，SQLite 里整段存 JSON。
- `muscle` 用固定的英文键，中文只在 i18n 里翻译；不要存中文，否则换语言后旧数据没法显示。
- 档案里追加提醒设置（可选字段，旧档案没有也要能用）：

```ts
export interface TrainingPlan {
  enabled: boolean
  /** 1=周一 … 7=周日 */
  weeklyDays: number[]
  /** 'HH:MM' */
  time: string
  /** 连续多少天没练后提醒；0 表示关闭断档提醒 */
  nudgeAfterDays: number
}

// HealthProfile 里加：
/** 训练提醒设置；旧档案没有这个字段 */
trainingPlan?: TrainingPlan
```

---

## 5. 存储层改造清单

照 `HealthSleep` 的完整链路逐项加，**12 步缺一步就会半截**。

### 5.1 类型

`schema.ts` 加 §4 的三个类型，并给 `HealthProfile` 加 `trainingPlan?`。

### 5.2 Dexie 表

[src/core/db/db.ts](../src/core/db/db.ts)：表接口加 `healthTrainings: EntityTable<HealthTraining, 'id'>`，版本号从 14 升到 15：

```ts
// 训练记录：按天查、回收站靠 deletedAt
db.version(15).stores({ healthTrainings: 'id, dateKey, deletedAt' })
```

版本号只能往上加，不要改历史版本。

### 5.3 存储契约

[src/core/db/store.ts](../src/core/db/store.ts) 的 `DiaryStore` 加（命名与 `sleep*` 系列对齐）：

```ts
// ─────────── 训练 ───────────
trainingOfDay(dateKey: string): Promise<HealthTraining[]>
trainingsBetween(from: string, to: string): Promise<HealthTraining[]>
trainingDays(): Promise<string[]>
latestTraining(): Promise<HealthTraining | undefined>
saveHealthTraining(training: HealthTraining): Promise<HealthTraining>
removeHealthTraining(id: string): Promise<void>
restoreHealthTraining(id: string): Promise<void>
trashedHealthTrainings(): Promise<HealthTraining[]>
purgeHealthTraining(id: string): Promise<void>
purgeTrashedHealthTrainings(): Promise<void>
```

同时改三处数据形状：

- `BackupData` 加 `trainings: HealthTraining[]`
- `BackupSections.health` 加 `trainings: HealthTraining[]`
- `ImportStats` 加 `trainings: SectionCount`，`zeroStats()` 同步

### 5.4 两个实现

`src/core/db/dexieStore.ts`（照 `sleepsBetween` / `saveHealthSleep` 写）：

```ts
async trainingOfDay(dateKey: string): Promise<HealthTraining[]> {
  const rows = await db.healthTrainings
    .where('dateKey')
    .equals(dateKey)
    .filter((item) => item.deletedAt === null)
    .toArray()
  return rows.sort((a, b) => a.time.localeCompare(b.time))
},

async saveHealthTraining(training) {
  const next: HealthTraining = { ...training, updatedAt: Date.now() }
  await db.healthTrainings.put(next)
  return next
},

async removeHealthTraining(id) {
  await db.healthTrainings.update(id, { deletedAt: Date.now() })
},
```

`src/core/db/sqliteStore.ts` 只转发，写法照 `saveHealthSleep`：

```ts
saveHealthTraining: async (training) => {
  const next: HealthTraining = { ...training, updatedAt: Date.now() }
  await call('saveHealthTraining', next)
  return next
},
```

**两个实现的时间戳逻辑必须一致**，否则同一操作在不同端行为不同。

### 5.5 写通知白名单

[src/core/db/changes.ts](../src/core/db/changes.ts) 的 `WRITE_METHODS` 加：

```ts
'saveHealthTraining',
'removeHealthTraining',
'restoreHealthTraining',
'purgeHealthTraining',
'purgeTrashedHealthTrainings',
```

**漏了这里不会报错，但页面不刷新**——这是本项最容易踩的坑。

### 5.6 Repo 转出

`src/features/health/healthRepo.ts`（或新建 `src/features/training/trainingRepo.ts`）解构转出上面所有方法，页面只从 repo 取，不直接 import store。

### 5.7 SQLite 表与迁移

[electron/database.cjs](../electron/database.cjs) 加五处。新表只需 `CREATE TABLE IF NOT EXISTS`，不用写 `ALTER`：

```sql
CREATE TABLE IF NOT EXISTS healthTrainings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  dateKey TEXT NOT NULL,
  time TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  exercises TEXT NOT NULL DEFAULT '[]',
  durationMin INTEGER,
  feeling INTEGER,
  note TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trainings_day ON healthTrainings(dateKey);
CREATE INDEX IF NOT EXISTS idx_trainings_trash ON healthTrainings(deletedAt);
```

行转换（放在 `sleepRow` 旁边）：

```js
function trainingRow(row) {
  return {
    ...row,
    exercises: JSON.parse(row.exercises || '[]'),
    durationMin: num(row.durationMin),
    feeling: num(row.feeling),
    deletedAt: num(row.deletedAt),
  }
}
```

prepared statements（`q` 里）：

```js
trainingOfDay: db.prepare(
  'SELECT * FROM healthTrainings WHERE dateKey = ? AND deletedAt IS NULL ORDER BY time ASC',
),
trainingsBetween: db.prepare(
  'SELECT * FROM healthTrainings WHERE dateKey >= ? AND dateKey <= ? AND deletedAt IS NULL ORDER BY dateKey ASC, time ASC',
),
trainingDays: db.prepare('SELECT DISTINCT dateKey FROM healthTrainings WHERE deletedAt IS NULL'),
latestTraining: db.prepare(
  'SELECT * FROM healthTrainings WHERE deletedAt IS NULL ORDER BY dateKey DESC, time DESC LIMIT 1',
),
upsertTraining: db.prepare(
  `INSERT INTO healthTrainings
     (id, code, dateKey, time, kind, title, exercises, durationMin, feeling, note, createdAt, updatedAt, deletedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     code = excluded.code,
     dateKey = excluded.dateKey,
     time = excluded.time,
     kind = excluded.kind,
     title = excluded.title,
     exercises = excluded.exercises,
     durationMin = excluded.durationMin,
     feeling = excluded.feeling,
     note = excluded.note,
     createdAt = excluded.createdAt,
     updatedAt = excluded.updatedAt,
     deletedAt = excluded.deletedAt`,
),
removeTraining: db.prepare('UPDATE healthTrainings SET deletedAt = ? WHERE id = ?'),
restoreTraining: db.prepare('UPDATE healthTrainings SET deletedAt = NULL WHERE id = ?'),
trashedTrainings: db.prepare(
  'SELECT * FROM healthTrainings WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
),
purgeTraining: db.prepare('DELETE FROM healthTrainings WHERE id = ?'),
purgeTrashedTrainings: db.prepare('DELETE FROM healthTrainings WHERE deletedAt IS NOT NULL'),
everyTraining: db.prepare('SELECT * FROM healthTrainings'),
allTrainingIds: db.prepare('SELECT id FROM healthTrainings'),
```

写入函数：

```js
function saveTraining(training) {
  q.upsertTraining.run(
    training.id,
    training.code ?? '',
    training.dateKey,
    training.time ?? '00:00',
    training.kind ?? 'other',
    training.title ?? '',
    JSON.stringify(Array.isArray(training.exercises) ? training.exercises : []),
    num(training.durationMin),
    num(training.feeling),
    training.note ?? '',
    num(training.createdAt) ?? Date.now(),
    num(training.updatedAt) ?? Date.now(),
    num(training.deletedAt),
  )
  return training
}
```

**14 个列对应 14 个参数，逐列核对。** 本项目曾因漏绑参数出过 `NOT NULL constraint failed` 事故。

还要接：

- `exportAll()` 加 `trainings: q.everyTraining.all().map(trainingRow)`
- `writeSections` 的 health 块加建表 / 写入 / 计数 / `DELETE FROM healthTrainings`
- `clearHealthData`、`trashHealthData` 的表名数组加 `healthTrainings`
- `METHODS` 白名单加同名方法

### 5.8 规范化

[src/core/db/normalize.ts](../src/core/db/normalize.ts) 加 `pickTraining`，照 `pickSleep` 写：

```ts
export function pickTraining(raw: unknown): HealthTraining | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  const kind = text(item.kind)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(text(item.time)) ? text(item.time) : '00:00',
    kind: isTrainingKind(kind) ? kind : 'other',
    title: text(item.title),
    exercises: pickExercises(item.exercises),
    durationMin: nonNegative(item.durationMin),
    feeling: inRange(item.feeling, 1, 5),
    note: text(item.note),
    createdAt: number(item.createdAt) ?? Date.now(),
    updatedAt: number(item.updatedAt) ?? Date.now(),
    deletedAt: nullableNumber(item.deletedAt),
  }
}
```

`pickExercises` 要求：

- 非数组 → `[]`
- 每项名字为空直接丢
- `sets` 非数组 → `[]`；每组数字为负、NaN、非有限值 → `null`
- `kind` / `muscle` 不合法就归到 `other`
- 缺 `id` 用 `newId()` 补

然后把 `pickTraining` 接进 `pick` 主流程（和 `pickSleep` 并列），旧备份没有 `trainings` 字段时返回空数组即可。

`pickProfile` 补 `trainingPlan` 容错：没有字段就返回 `undefined`；有字段但 `weeklyDays` 非法就清空。

### 5.9 备份文件

[src/features/diary/diaryBackup.ts](../src/features/diary/diaryBackup.ts)：

- `BackupPayload` 加 `trainings: HealthTraining[]`
- `emptyPayload()` 加 `trainings: []`
- `buildBackup` 填值
- `readBackup` 用 `pickTraining` 过滤
- `onlySections` / `sectionSize` 加训练块

**不需要升 `BACKUP_VERSION`**：新字段是可选的，旧备份缺它按空数组处理，和当年加 `sleeps` 一样。

### 5.10 记录级导出 / 导入

- `src/features/records/recordExport.ts`：`RecordKind` 加 `'training'`，补 `recordsOf`、`KIND_TITLE_KEY`、`KIND_FIELD`。
- `src/features/records/recordImport.ts`：`RecordsFile` 加 `trainings`，`importRecords` 加分支（走 `saveHealthTraining`）。
- 导出文案里的「训练」标题走 i18n。

### 5.11 合并冲突

`src/features/diary/diaryMerge.ts`：

- `ConflictKind` 加 `'training'`
- 写 `trainingDiffers(local, remote)`：先比 `updatedAt`，不同就算差异；相同再比动作名序列 + 每组数字摘要
- 接进 `findHealthConflicts` 与 `pickHealth`
- 摘要文案走 i18n

### 5.12 测试

见 §13，先写 `desktopImport.test.ts` 的往返用例再继续。

---

## 6. 纯逻辑模块

新建 `src/features/training/trainingMath.ts`，**所有计算放这里**，组件只渲染。

### 6.1 导出函数

```ts
export function summarizeDay(trainings: HealthTraining[]): DaySummary
export function summarizeWeek(
  trainings: HealthTraining[],
  weekStart: string,
  today: string,
): WeekSummary
export function weekStartOf(dateKey: string): string        // 周一
export function weekRange(dateKey: string): { from: string; to: string }
export function trainingLabel(training: HealthTraining): string  // 标题兜底
export function formatVolume(kg: number): string
export function formatDuration(minutes: number): string
```

**类型**

```ts
export interface DaySummary {
  sessions: number
  totalSets: number
  totalReps: number
  volumeKg: number
  totalDurationMin: number
  muscles: string[]
}

export interface WeekSummary {
  sessions: number
  days: number
  volumeKg: number
  previousVolumeKg: number
  muscleCount: Record<string, number>
  gapDays: number
}
```

### 6.2 计算细则

- 只统计 `deletedAt === null` 的记录（调用方已经过滤，函数里仍要防御一次）。
- `reps` 或 `weightKg` 有一个为 `null` 就不进容量，但 `reps` 仍进 `totalReps`。
- `durationSec` 求和后除以 60 再 `Math.round`。
- `gapDays`：`today` 与最近一次训练 `dateKey` 的天数差；今天练了为 0；从未练过返回 `-1`，界面显示「还没有记录」。
- 跨月、跨年只靠 `dateKey` 字符串比较，不要用 `new Date()` 算天数差（时区会出错），用 `shiftDay` 循环或现成的日期工具。

### 6.3 动作库

新建 `src/features/training/exerciseLibrary.ts`，纯静态数据，不建表：

```ts
export interface LibraryExercise {
  name: string
  kind: TrainingKind
  muscle: string
  /** 英文别名，供搜索与 AI 匹配 */
  aliases: string[]
}
```

首批覆盖 40 个左右常见动作：卧推、深蹲、硬拉、引体向上、俯卧撑、划船、推举、弯举、三头下压、腿举、弓步、平板支撑、卷腹、跑步、快走、骑行、游泳、跳绳、椭圆机、划船机、开合跳、拉伸、瑜伽、篮球、羽毛球、足球等。

- 首次进入点选记时给「常用」前 8 个 + 搜索框。
- 用户输入的动作名不在库里时，允许直接保存，并在下次搜索时作为「最近用过」出现（从历史记录里取，不写库）。

---

## 7. AI 一句话解析

新建 `src/features/training/trainingPhrase.ts`，纯函数可单测。

### 7.1 函数

```ts
export interface PhraseResult {
  ok: boolean
  training?: HealthTraining
  errorKey?: MessageKey
}

/** 发给模型的提示词，包含字段结构与字段缺失时的约定 */
export function buildPhrasePrompt(today: string): { system: string; user: string }

/** 解析模型返回的文本：剥围栏 → JSON.parse → normalize → 兜底校验 */
export function parseTrainingPhrase(reply: string, today: string): PhraseResult
```

### 7.2 提示词要求

- 只输出 JSON，不写解释，不加 Markdown。
- 字段与 §4 的 `HealthTraining` 对齐，但 `id / code / createdAt / updatedAt / deletedAt` 一律不返回，由代码补。
- 时间缺失用当前时刻的 `HH:MM`；日期缺失用 `today`。
- 组数用 `"3x8"`、`"8/6/5"`、`"3 组 12 次 40kg"` 都要能拆。
- 不确定的字段填 `null`，**不要编造负重**。
- 只能用给定的 `kind` / `muscle` 枚举值。

### 7.3 解析规则

1. 去掉 ```json 围栏与首尾空白。
2. 找到第一个 `{` 与最后一个 `}` 之间的片段再 `JSON.parse`，失败返回 `ok: false`。
3. 过 `pickTraining` 同款校验（可复用 normalize 里的辅助函数），`dateKey` 必须是合法日期，非法就换成 `today`。
4. 动作数组为空 → `ok: false`，提示「没认出动作，换种说法或改用手动记录」。
5. 数字越界（如负重 10000 kg）直接置 `null`，不要静默保留脏值。

### 7.4 确认卡

- 列出识别到的每个动作与每组数字，逐项可改。
- 顶部显示标题与类型，可下拉改。
- 底部按钮：`取消`（`GHOST_BUTTON`）、`确认记下`（`SOLID_BUTTON`）。
- 模型失败或没配模型时：保留用户原文，给一行提示 + 「改用手动记录」按钮，不要清空输入。

---

## 8. 助手工具

三处都要改，缺一处助手就「看得见但点不动」。

### 8.1 `src/features/assistant/assistantTools.ts`

新增四个 spec：

| 工具 | 类型 | 参数要点 |
| --- | --- | --- |
| `training_stats` | 读 | `from`、`to`，返回次数、容量、部位分布、最近一次 |
| `add_training` | 写 | `date`、`time`、`kind`、`title`、`exercises[]`（含 sets）、`durationMin`、`feeling`、`note` |
| `update_training` | 改 | `id` 或「最近一次」标记 + 要改的字段 |
| `delete_training` | 删 | `id` 或「最近一次」标记 |

- description 用中文，写清 `exercises` 的嵌套结构，别让模型自由发挥字段名。
- 读工具的输出要精简（只要数字与摘要），不要把整条记录 JSON 塞回模型。
- 写工具不要直接落库，只产出 action。

### 8.2 `src/features/assistant/assistantActionBuild.ts`

- `AssistantAction` 联合类型加训练分支。
- `buildAssistantAction` 加 `case`：校验日期、类型、动作非空；不合法返回 `{ok:false, error}`。
- `describeAction` 加摘要，例如「记一次训练：胸 · 4 个动作 · 18 组」。

### 8.3 `src/features/assistant/assistantActions.ts`

- `executeAssistantAction`：调 `saveHealthTraining`。
- `undoAssistantAction`：删除场景调 `restoreHealthTraining`。
- 遵守现有规则：写操作先预览、确认后落库、删除进回收站、刚写完可撤销。

### 8.4 `src/features/assistant/AssistantActionCard.tsx`

`switch (action.kind)` 加训练分支，预览列表：

```
卧推   8×40 / 8×40 / 6×42.5
划船   12×30 / 12×30
```

数字格式与详情页一致，别另写一套。

### 8.5 测试

`assistantActionBuild.test.ts` 加：合法训练、日期非法、动作为空、组数字为负；`assistantTools.test.ts` 加：`training_stats` 返回结构。

---

## 9. 提醒实现

新建 `src/features/training/trainingNotify.ts`，结构照 [weighNotify.ts](../src/features/health/weighNotify.ts)。

### 9.1 常量

```ts
/** 安卓本地通知 id，避开称重的 77120 */
const TRAINING_NOTIFICATION_ID = 77130
const NUDGE_NOTIFICATION_ID = 77131
const NOTIFIED_KEY = 'starburst.trainingNotified'
const NUDGE_KEY = 'starburst.trainingNudged'
```

### 9.2 两个函数

```ts
/** 桌面 / 浏览器 / 安卓前台：到点且今天没练、没提醒过就弹一次 */
export function maybeNotifyTraining(plan: TrainingPlan | undefined, trainedToday: boolean): void

/** 安卓：按周排计划通知；断档提醒靠前台检查 */
export async function syncTrainingReminder(plan: TrainingPlan | undefined): Promise<void>
```

- 周几换算：`LocalNotifications` 的 `weekday` 是 1=周日，我们的 `weeklyDays` 是 1=周一，用 `(day % 7) + 1`。
- 多个周几要一次 `schedule` 多条通知，id 用 `TRAINING_NOTIFICATION_ID + index`。
- 关掉开关 `cancel` 掉所有可能用到的 id（含历史 id），不要只取消当前计划里的。
- 前台检查放在训练页挂载时每 60 秒一次（和称重一致），页面卸载清掉定时器。
- 今天已练：`trainingOfDay(todayKey()).length > 0`。
- 断档：`gapDays >= nudgeAfterDays` 且 `localStorage` 里今天没记过。

### 9.3 设置入口

训练页右上角齿轮 → `Modal` 面板：

- 「按计划提醒」开关 + 周几多选（7 个圆角小格）+ 时刻输入。
- 「断档提醒」开关 + 天数（2 / 3 / 5 / 7 四档，默认 3）。
- 保存走 `saveHealthProfile`（带上原档案其余字段，别覆盖丢数据）。

---

## 10. 页面实现

### 10.1 路由

`src/app/router.tsx`：

```tsx
const TrainingPage = lazy(() => import('@/features/training/TrainingPage'))
const TrainingTrashPage = lazy(() => import('@/features/training/TrainingTrashPage'))

// children 里：
{ path: 'training', element: <TrainingPage /> },
{ path: 'training/trash', element: <TrainingTrashPage /> },
```

### 10.2 导航

`src/app/layout/AppShell.tsx` 的 `RECORDS` 加：

```ts
{ to: '/training', labelKey: 'nav.training', icon: '🏋️' },
```

先确认底部四格在加了「记录」子项后仍然放得下（手机宽度 320px 时不能挤成两行）；必要时把顺序调成日记 / 训练 / 健康 / 收支。

### 10.3 文件拆分

```
src/features/training/
  TrainingPage.tsx          列表 + 小结 + 操作条
  TrainingTrashPage.tsx     回收站
  TrainingDetailDialog.tsx  详情
  TrainingForm.tsx          三种入口的分发 + 手填表单
  TrainingPhraseDialog.tsx  一句话记 + 确认卡
  TrainingPlanPanel.tsx     提醒设置
  trainingMath.ts / .test.ts
  trainingPhrase.ts / .test.ts
  trainingPlan.ts / .test.ts
  exerciseLibrary.ts
  trainingNotify.ts
  trainingRepo.ts
```

### 10.4 组件复用（不要另造）

| 需求 | 用哪个 |
| --- | --- |
| 页面壳层 | `PageShell` |
| 日期栏 | `DayNav` + `useDaySwipe` |
| 弹层 | `Modal`（已 `createPortal`） |
| 删除确认 | `ConfirmDialog` |
| 批量选择 | `useBatchSelect` / `BatchActions` / `RowCheckbox` / `BatchBar` |
| 提示 | `useToast` |
| 按钮 | `SOLID_BUTTON` / `SOLID_SMALL_BUTTON` / `OUTLINE_BUTTON` / `GHOST_BUTTON` / `ROW_ACTION` / `ROW_DANGER` / `choiceTile()` |
| 列表容器 | `useLiveQuery`（配 `trainingRepo`） |

**按钮选型**：页面主操作 `SOLID_BUTTON`；卡片上的小操作 `SOLID_SMALL_BUTTON`；弹窗取消 `GHOST_BUTTON`；行尾 `ROW_ACTION`；危险操作 `ROW_DANGER` / `SOLID_DANGER`。

### 10.5 交互细节

- 换天时滚动回顶部。
- 空状态：一句说明 + 「记第一次」主按钮，不要空白。
- 数字输入用 `inputMode="decimal"`，允许清空。
- 组行删除后焦点不乱跳；新增组滚到可见。
- 所有动画尊重 `prefers-reduced-motion`（用现有类，不新写关键帧）。
- 覆盖层必须走 `Modal`，不要直接挂在内容区。

---

## 11. i18n 清单

先把下列 key 加进 `src/shared/i18n/messages/zh.ts`，再补 `zhTW / en / ja / ko / de / fr / ru / es` 八份。`Record<MessageKey, string>` 会逼你补全，漏一个就 typecheck 失败。

| key | 中文文案 |
| --- | --- |
| `nav.training` | 训练 |
| `training.title` | 训练 |
| `training.empty` | 这天还没有训练记录 |
| `training.first` | 记第一次 |
| `training.add` | 记一次 |
| `training.trash` | 回收站 |
| `training.batch` | 批量 |
| `training.chooseMode` | 想怎么记？ |
| `training.modePhrase` | 一句话记 |
| `training.modePhraseHint` | 打一句话，我帮你拆成动作和组数 |
| `training.modePick` | 点选记 |
| `training.modePickHint` | 选动作，逐组填次数和负重 |
| `training.modeQuick` | 快速记 |
| `training.modeQuickHint` | 有氧、拉伸、球类，只填时长 |
| `training.kind.strength` | 力量 |
| `training.kind.cardio` | 有氧 |
| `training.kind.mobility` | 拉伸 |
| `training.kind.sport` | 球类 |
| `training.kind.other` | 其他 |
| `training.muscle.chest` | 胸 |
| `training.muscle.back` | 背 |
| `training.muscle.legs` | 腿 |
| `training.muscle.shoulders` | 肩 |
| `training.muscle.arms` | 手臂 |
| `training.muscle.core` | 核心 |
| `training.muscle.fullBody` | 全身 |
| `training.muscle.cardio` | 有氧 |
| `training.muscle.other` | 其他 |
| `training.sets` | 组 |
| `training.reps` | 次 |
| `training.weightKg` | kg |
| `training.durationMin` | 分钟 |
| `training.distanceKm` | 公里 |
| `training.feeling` | 感受 |
| `training.note` | 备注 |
| `training.addExercise` | 加一个动作 |
| `training.addSet` | 加一组 |
| `training.copyLast` | 复制上次同动作 |
| `training.save` | 保存 |
| `training.confirm` | 确认记下 |
| `training.saved` | 已记下这次训练 |
| `training.updated` | 已更新训练记录 |
| `training.deleted` | 已删掉这次训练 |
| `training.undo` | 撤销 |
| `training.dayTitle` | 今天练了什么 |
| `training.dayEmpty` | 今天还没练 |
| `training.totalSets` | 总组数 |
| `training.totalReps` | 总次数 |
| `training.volume` | 容量 |
| `training.weekTitle` | 本周 |
| `training.weekSessions` | 训练次数 |
| `training.weekDays` | 训练天数 |
| `training.weekVsLast` | 比上周 |
| `training.weekFirst` | 首次记录 |
| `training.gapDays` | 已经 {n} 天没练了 |
| `training.never` | 还没有训练记录 |
| `training.phraseHint` | 例如：今天卧推 3 组 8/8/6，40 公斤 |
| `training.phraseEmpty` | 没认出动作，换种说法或改用手动记录 |
| `training.phraseManual` | 改用手动记录 |
| `training.aiReview` | 让 AI 点评本周 |
| `training.aiReviewEmpty` | 先记几次训练再看点评 |
| `training.plan.title` | 训练提醒 |
| `training.plan.enabled` | 按计划提醒 |
| `training.plan.days` | 练哪几天 |
| `training.plan.time` | 提醒时刻 |
| `training.plan.nudge` | 断档提醒 |
| `training.plan.nudgeDays` | 连续 {n} 天没练时提醒 |
| `training.plan.notifyTitle` | 今天该练了 |
| `training.plan.notifyBody` | 练完记得记一笔，别断了节奏。 |
| `training.plan.nudgeTitle` | 有一阵没练了 |
| `training.plan.nudgeBody` | 已经 {n} 天没记录，动一动？ |
| `training.trashTitle` | 训练回收站 |
| `training.trashEmpty` | 回收站是空的 |
| `training.restore` | 恢复 |
| `training.purge` | 彻底删除 |
| `training.purgeAll` | 清空回收站 |
| `training.purgeTitle` | 彻底删掉这次训练？ |
| `training.purgeDesc` | 删掉后不能恢复。 |
| `training.actionAdd` | 记一次训练 |
| `training.actionDelete` | 删一次训练 |
| `training.actionUpdate` | 改训练记录 |
| `assistant.action.training` | 训练 |

规则：

- 占位符 `{n}` `{date}` 在各语言中保持一致。
- 组件外用 `translate('training.xxx')`，模块内不写中文。
- 部位键固定英文，只在 i18n 里翻译，**不要存中文到数据库**。

---

## 12. 备份 / 导入导出 / 合并（汇总）

按 §5.9–§5.11 改完后，自查这几个行为：

| 场景 | 期望 |
| --- | --- |
| 导出整库 → 清库 → 导入 | 训练记录、动作、每组数字、备注、感受全部还原 |
| 旧备份（无 `trainings`） | 正常导入，训练块为空，不报错 |
| 只导训练 | 其他块一个字节不动 |
| 替换导入 | 先清 `healthTrainings` 再写，不残留旧数据 |
| 合并导入 | 同一天同 id 的记录按 `updatedAt` 判冲突，界面能选保留哪边 |
| 软删记录 | 导出时带 `deletedAt`，导入后仍在回收站 |

---

## 13. 测试

### 13.1 新增文件

| 文件 | 必测用例 |
| --- | --- |
| `trainingMath.test.ts` | 容量 = Σ 次数×负重；缺负重不进容量；空组不计；时长三种来源优先级；`gapDays` 今天 / 昨天 / 从未；`weekStartOf` 周一是起点 |
| `trainingPhrase.test.ts` | 合法 JSON；带 ```json 围栏；坏 JSON；动作空数组；负重越界置 null；日期非法回退今天 |
| `trainingPlan.test.ts` | 周几命中；今天已练不发；`nudgeAfterDays=0` 关闭；跨月断档天数 |
| `exerciseLibrary.test.ts` | 搜索按中文名与别名都能命中；结果不重复 |

### 13.2 必须扩的现有测试

| 文件 | 加什么 |
| --- | --- |
| `desktopImport.test.ts` | 真实 SQLite 往返：带 2 个动作 5 组 + 空值 + 备注的训练记录，导出写回后逐字段相等 |
| `normalize.test.ts` | 非法 kind、空动作名、负数负重、缺 id |
| `diaryBackup.test.ts` | 含训练记录的备份读写；旧备份缺字段 |
| `diaryMerge.test.ts` | 训练冲突识别与取舍 |
| `recordExport.test.ts` | 勾训练导出；空记录 |
| `recordImport.test.ts` | 只导训练；混合导入 |
| `assistantActionBuild.test.ts` | 训练 action 的合法 / 非法分支 |
| `assistantTools.test.ts` | `training_stats` 输出结构 |

### 13.3 运行

```bash
node package/run-tests.cjs
npm run typecheck
npm run lint
```

三项全绿再提交。涉及打包的行为不要在这里测，交给发版流程。

---

## 14. 分阶段实施

每阶段独立可交付、可提交，提交信息中文、不带 AI 标注。

### 阶段 1：数据层（不碰 UI）

1. `schema.ts` 加类型与 `trainingPlan`
2. `db.ts` 升到 15 加表
3. `store.ts` 加方法与数据形状
4. `dexieStore` / `sqliteStore` 双实现
5. `changes.ts` 白名单
6. `electron/database.cjs` 建表、语句、写入、导出、清空
7. `normalize.ts` 加 `pickTraining`
8. `desktopImport.test.ts` 往返用例

**验收**：测试里能存、查、软删、恢复、彻底删；`typecheck` 通过。

### 阶段 2：纯逻辑

`trainingMath.ts` / `exerciseLibrary.ts` / `trainingPlan.ts` + 三个测试文件。

**验收**：单测全绿，函数不依赖 React 与存储。

### 阶段 3：页面

路由、底部导航、`TrainingPage`、`TrainingForm`、详情、回收站、批量、空状态。

**验收**：三种入口都能落库；刷新后仍在；删除可撤销；换天正常。

### 阶段 4：备份与导入导出

`diaryBackup` / `recordExport` / `recordImport` / `diaryMerge` + 对应测试。

**验收**：§12 表格逐行过一遍。

### 阶段 5：AI

`trainingPhrase.ts` + 确认卡 + 四个助手工具 + 动作卡片 + 两个测试。

**验收**：一句话能记；助手能改能删能查；没配模型时提示清楚且不崩。

### 阶段 6：总结与提醒

当天 / 本周总结、AI 点评按钮、`trainingNotify.ts`、提醒设置面板、i18n 全量补齐。

**验收**：§15 清单。

---

## 15. 交付前自查清单

**功能**

- [ ] 三种入口都能记录，字段缺失不报错
- [ ] 列表按时间倒序，详情 / 编辑 / 删除 / 撤销 / 回收站 / 彻底删除都通
- [ ] 批量删除只软删，回收站能恢复
- [ ] 当天小结与本周总结数字与手算一致
- [ ] 一句话记：成功落库、失败保留原文、可改用手动
- [ ] 助手能记 / 改 / 删 / 查统计，动作卡片预览正确
- [ ] 计划提醒与断档提醒都能触发，关掉立刻不再收到
- [ ] 今天已练不催计划提醒

**数据**

- [ ] 训练记录进整库备份，导出→清库→导入无损
- [ ] 记录级导出与导入都认训练
- [ ] 合并导入能识别训练冲突
- [ ] 旧备份（无训练字段）能正常导入
- [ ] 软删记录导出后仍在回收站

**界面**

- [ ] 深浅主题下文字与徽标对比度正常
- [ ] 320px 宽度下日期栏、数字输入、组行不溢出
- [ ] 弹层走 `Modal`，安卓上不被底部导航压住
- [ ] 键盘弹起时输入框不被顶出屏幕
- [ ] 尊重 `prefers-reduced-motion`

**工程**

- [ ] `node package/run-tests.cjs` 全绿
- [ ] `npm run typecheck` 无错
- [ ] `npm run lint` 无错
- [ ] 九份语言表齐全，占位符一致
- [ ] 没有把 `.local/`、密钥、构建产物加进 git
- [ ] 没有顺手格式化全仓库，没有提交别人的未提交改动

---

## 16. 禁止事项与常见坑

**不要做**

- 不要新建第二套存储，也不要绕过 `DiaryStore` 直接操作 Dexie / SQLite。
- 不要给不同运动类型建独立表，不要拆 `exercises` / `sets`。
- 不要用必填校验拦住「只记了时长」的记录。
- 不要在组件里写死中文或存中文枚举到数据库。
- 不要在打开页面时自动调模型。
- 不要改 `package.json` 版本号、签名密钥、`.local/`。
- 不要为范围外功能（周期计划、计时器、设备直连）预留开关。

**已知坑**

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| 忘了加 `WRITE_METHODS` | 保存成功但页面不刷新 | 五个写方法全部登记 |
| SQLite 占位符与参数不对应 | `NOT NULL constraint failed` / 字段错位 | 14 列 14 参数逐列核对 |
| Dexie 改了旧版本号 | 老用户打不开库 | 只新增 `version(15)`，历史版本不动 |
| 忘记过滤 `deletedAt` | 回收站里的记录混进列表与统计 | 查询与统计函数都过滤 |
| 用 `new Date()` 算天数差 | 跨时区 / 夏令时差一天 | 用 `shiftDay` 与 `dateKey` 字符串 |
| 嵌套数组没序列化 | SQLite 里存成 `[object Object]` | 入库 `JSON.stringify`，出库 `JSON.parse`，空串兜底 `[]` |
| 只改了 dexie 实现 | 桌面端功能缺失 | 两个实现同时改，行为一致 |
| 备份漏了训练块 | 导出后训练消失 | `BackupData` / `BackupSections` / `exportAll` / `writeSections` 四处都加 |
| 通知 id 撞车 | 训练提醒覆盖称重提醒 | 用 77130 / 77131，避开 77120 |
| 取消通知只取消当前 id | 改计划后旧通知还在响 | 取消时覆盖所有用过的 id |

---

## 17. 参考

- 数据模型参考 wger（本项目已在 `docs/PROJECT-NOTES.md` 记过选型：workout + 营养 + 体重）。
- 记录链路照抄 `HealthSleep`：`schema.ts` → `store.ts` → `dexieStore.ts` / `sqliteStore.ts` → `electron/database.cjs` → `healthRepo.ts` → `useLiveQuery`。
- 通知照抄 `src/features/health/weighNotify.ts`。
- AI 写操作照抄现有 `add_sleep` 全链路，不要另起一套。
- 页面结构参考 `src/features/health/SleepsPage.tsx`（日期栏 + 列表 + 批量 + 操作条）。
