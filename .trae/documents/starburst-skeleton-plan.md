# 《星芒记录者》全框架骨架 — 实施方案

## Context

用户（个人开发者）想做一个解决"工作学习太忙、没时间复盘自己生活"的日常工具《星芒记录者》。核心亮点是**内置 AI Agent**：用户随手记录，AI 自动整理、分析、出报告。

本项目当前是**完全空白的工作区**（无 git、无代码）。本方案只覆盖第一个里程碑——**搭建可运行、能点击、四个模块都有占位、本地存储与 AI 网关打通的最小闭环**，功能细节后续再逐个深化。

### 已确认决策（不可推翻）

| 维度 | 决定 |
|---|---|
| 平台 | Android APK（Capacitor）+ Windows 桌面（Tauri 2），两端复用同一套 Web 代码 |
| 技术栈 | React + Vite + TypeScript + TailwindCSS |
| 存储 | 纯本地优先，IndexedDB（Dexie），一键导出 ZIP 迁移 |
| AI | 多提供商网关：预设若干 + 支持自定义 base URL / API Key，Key 只存本地 |
| 范围 | 先搭全框架骨架 |

### 四个功能模块（骨架阶段只做占位 + 结构）

1. **日记** — 一天多篇；照片→AI 整理进日记
2. **健康** — 睡眠时长；一天多个时间戳的心情；体重（空腹基准）；每餐热量/成分；**食物预存表 + 份量系数自动换算**；吃前问 AI
3. **经济** — 每日收支 + 分类/原因/备注；花前问 AI
4. **AI 助手** — 随时问答个人数据；定时生成日/周/月/年报，报告可勾选组件（趋势图 / 个性化评价 / 累计图），支持单领域与横向对比

---

## 一、三条必须先钉死的硬约束

这三条如果不从第一个 commit 就固定，后期会导致**用户数据全部失联**，务必写入 README 的「永不修改清单」。

1. **`androidScheme` 与 `appId` 一经确定不得更改**。Capacitor 中改变 scheme 等同于换域名，IndexedDB / localStorage 立即无法访问。`capacitor.config.ts` 里把 `server.androidScheme: 'https'` 显式写出（不用默认值隐式依赖）。
2. **Tauri 的 `identifier` 与 `useHttpsScheme` 同样不得更改**。Tauri 官方文档明确警告：Windows 上改变该值会迁移 IndexedDB / cookies 的存放位置，旧数据无法访问。
3. **AI 请求不能走浏览器 `fetch`**。WebView 的 origin 是 `https://localhost`（Capacitor）或 `http://tauri.localhost`（Tauri），直连 `api.deepseek.com` / `api.openai.com` 会被 CORS 拦截。因此 AI 网关**必须经过平台 HTTP 适配层**（CapacitorHttp / `@tauri-apps/plugin-http`）走原生网络栈。这条直接决定下面 AI 网关的接口设计。

---

## 二、目录结构

采用 **feature-based（按模块）+ 一层薄横切 `core`**。四个模块彼此独立、后续逐个深化，而 db / ai / platform / backup 是全局共用，收在 `core` 可避免 feature 之间互相 import。

```
d:\File\claude\starburst_recorder\
├─ index.html
├─ vite.config.ts                 # react 插件 + @tailwindcss/vite + dev 期 AI 代理
├─ tsconfig.json / tsconfig.node.json
├─ capacitor.config.ts            # ★ 钉死 androidScheme / appId / webDir
├─ src-tauri\                     # Tauri 2 壳（Cargo.toml / tauri.conf.json / capabilities\）
├─ android\                       # npx cap add android 生成
└─ src\
   ├─ main.tsx
   ├─ App.tsx                     # 路由 + Provider 组合
   ├─ index.css                   # 只写 @import "tailwindcss"; + @theme
   ├─ app\
   │  ├─ router.tsx               # createHashRouter（★ 壳内必须用 hash 路由）
   │  ├─ layout\AppShell.tsx      # 手机=底部 TabBar，桌面断点=左侧 rail（同一组件）
   │  └─ providers\AppProviders.tsx
   ├─ core\                       # 平台无关基础设施，横切关注点全在这
   │  ├─ db\
   │  │  ├─ schema.ts             # ★ Dexie 表结构 + 索引（唯一真相源）
   │  │  ├─ db.ts                 # 单例、版本升级、启动请求 persist()
   │  │  └─ repo\baseRepo.ts      # 通用 CRUD + 软删除 + 时间戳自动维护
   │  ├─ platform\                # ★ 平台适配层，两端差异全部收敛于此
   │  │  ├─ detect.ts             # isCapacitor / isTauri / isWeb
   │  │  ├─ http.ts               # ★ aiFetch()：原生 HTTP → fetch 分派（绕 CORS 的唯一入口）
   │  │  ├─ secrets.ts            # ★ API Key 存取：SecurePreferences / Stronghold / localStorage
   │  │  ├─ fsio.ts               # saveBytes / pickBytes：分享面板 / SAF / Tauri dialog+fs
   │  │  ├─ camera.ts             # 拍照 → { base64, mime, blob }
   │  │  └─ persist.ts            # navigator.storage.persist()
   │  ├─ ai\
   │  │  ├─ types.ts              # ★ AiGateway / AiAdapter / AiCallContext 接口
   │  │  ├─ presets.ts            # DeepSeek / OpenAI / OpenRouter / 自定义 预填
   │  │  ├─ gateway.ts            # 网关实现：选 provider、重试、流式、用量
   │  │  ├─ adapters\openaiCompat.ts   # /chat/completions + vision + SSE 解析
   │  │  ├─ prompts\              # 各模块 system prompt 模板
   │  │  ├─ schema\jsonSchema.ts  # 结构化输出契约
   │  │  └─ tasks\                # 面向业务：diary.fromPhoto / health.canIEat / finance.canIAfford / assistant.askData / report.generate
   │  ├─ backup\
   │  │  ├─ export.ts             # 收集 → fflate 流式打包 → fsio.saveBytes
   │  │  ├─ import.ts             # pickBytes → 校验 manifest → 事务 bulkPut
   │  │  └─ manifest.ts           # schemaVersion / appVersion / counts / checksum
   │  └─ utils\ (dateKey.ts, money.ts, nutrition.ts, id.ts)
   ├─ features\
   │  ├─ diary\    pages\{DiaryPage,DiaryEditPage,PhotoToDiaryPage}.tsx
   │  ├─ health\   pages\{SleepPage,MoodPage,WeightPage,MealPage,CanIEatPage}.tsx
   │  │            food\{ FoodPicker, PortionInput, foodRepo.ts, portion.ts }   # ★ 预存表+系数换算
   │  ├─ finance\  pages\{FinancePage,FinanceEditPage,CanIAffordPage}.tsx
   │  ├─ assistant\pages\{ChatPage,ReportsPage,ReportBuilderPage}.tsx
   │  │            blocks\registry.ts   # ★ 报告"可勾选组件"注册表
   │  └─ settings\ pages\{SettingsPage,AiProviderPage,DataPage}.tsx
   └─ shared\
      ├─ ui\       Button / Card / Sheet / Field / EmptyState / StatCard / Chart
      └─ hooks\    useLiveData.ts (薄封装 dexie-react-hooks)
```

**两条架构约定**（防止后期换存储层或换模型时大改）：
- `features/*/repo.ts` 是模块内唯一操作 db 的地方，组件**不允许**直接 `db.table.add()`。
- `core/ai/tasks/*` 是业务与模型的唯一接口面，组件**不直接拼 messages**。

---

## 三、数据模型

统一基类：`id`（ULID，时间有序）、`createdAt` / `updatedAt`（epoch ms）、`deletedAt: number | null`（软删除，导入导出与撤销都需要）、`dateKey: 'YYYY-MM-DD'`（**按设备本地时区派生的日期键**，所有"按天聚合"一律用它，不要用 timestamp 做日界判断）。

### 日记 / 附件

```ts
interface DiaryEntry extends BaseRow {
  dateKey: string;              // 同一天多篇，按 createdAt 排序
  title?: string;
  content: string;              // markdown
  tags: string[];
  moodScore?: number;
  photoIds: string[];
  source: 'manual' | 'ai-from-photo' | 'ai-organize';
  aiMeta?: { providerId: string; model: string; generatedAt: number; rawText?: string };
}

interface Attachment extends BaseRow {
  refType: 'diary' | 'meal' | 'weight'; refId: string;
  mime: string; size: number;
  blob: Blob;                   // Dexie 原生支持 Blob，比 base64 省约 33% 空间
  sha256?: string;
}
```
> 图片存 **Blob**，只在发送给模型的瞬间转 base64，不要把 base64 写进 IndexedDB。

### 健康

```ts
interface SleepRecord extends BaseRow {
  dateKey: string;              // 归属"起床日"
  bedTime: number | null; wakeTime: number | null;
  durationMin: number;          // 手填或由 bed/wake 计算，聚合主用字段
  quality?: 1|2|3|4|5; awakenings?: number; note?: string;
}

interface MoodEntry extends BaseRow {   // 一天 N 个时间戳（核心能力）
  at: number; dateKey: string;
  valence: number;              // -5..+5
  energy?: 1|2|3|4|5;
  tags: string[]; trigger?: string; note?: string;
}

interface WeightRecord extends BaseRow {
  at: number; dateKey: string;
  weightKg: number; bodyFatPct?: number;
  fasting: boolean;             // 默认 true
  baseline: 'daily' | 'weekly' | null;   // 周一空腹 → 'weekly'，用于趋势区分
  note?: string;
}
```

### 食物预存表与份量系数换算 ★

这是健康模块最关键的机制，必须在数据模型里表达清楚。

```ts
interface Nutrition {
  kcal: number; proteinG: number; fatG: number; carbG: number;
  fiberG?: number; sodiumMg?: number;
}
interface PortionPreset {
  id: string;
  label: string;                // '一碗' / '一个'
  amount: number;               // 折算基准量，如 150
  unit: 'g' | 'ml' | 'piece';
  multiplier: number;           // = amount / FoodItem.baseAmount，预计算存下
}
interface FoodItem extends BaseRow {
  name: string;                 // 规范名，如 '白米饭'
  aliases: string[];            // 入库时统一 lower/trim
  baseAmount: number;           // 基准份量，如 100
  baseUnit: 'g' | 'ml' | 'piece';
  nutritionPerBase: Nutrition;  // ★ 每 baseAmount 的营养，系数换算的锚点
  portionPresets: PortionPreset[];
  defaultPortionId?: string;
  isFavorite: boolean;
  usageCount: number; lastUsedAt: number;   // "猜你要吃"排序
  source: 'manual' | 'ai-estimated' | 'user-edited';   // AI 估的需在 UI 打标待确认
}
```

**换算规则**：一切以 `nutritionPerBase` + `baseAmount` 为唯一基准。用户三种输入形态统一归一到 `multiplier`：
1. 选预设「1.5 碗」→ `multiplier = 1.5 × preset.multiplier`
2. 给绝对量「150g 米饭」→ `multiplier = 150 / baseAmount`
3. 给倍数「半份」→ `multiplier = 0.5`

若判定"同种食物、份量变化"，**只改 `multiplier`，不新建 FoodItem**。同种判定顺序：规范化名/别名精确匹配 → `usageCount` 加权模糊匹配（自实现 Levenshtein）→ 都不中才问 AI 兜底。

**落库必须快照**：

```ts
interface MealItem {
  foodId: string;
  foodNameSnapshot: string;
  portionId?: string; portionLabel?: string;
  multiplier: number;           // ★ 系数
  resolvedAmount: number;       // = multiplier × baseAmount
  nutritionSnapshot: Nutrition; // ★ 已按系数换算的实际摄入
}
interface MealRecord extends BaseRow {
  at: number; dateKey: string;
  mealType: 'breakfast'|'lunch'|'dinner'|'snack';
  items: MealItem[];
  foodIds: string[];            // ★ 冗余提取，仅用于 multiEntry 索引反查
  totalNutrition: Nutrition;
  hungerBefore?: 1|2|3|4|5;
  reason?: string; note?: string; photoIds: string[];
  aiAsk?: { question: string; answer: string; verdict: 'ok'|'caution'|'avoid'; providerId: string; model: string; at: number };
}
```
> 快照是必须的：否则 FoodItem 日后改名或修订营养值，"上周摄入"的历史数据会跟着漂移。

### 经济

```ts
interface FinanceCategory {
  id: string; name: string; type: 'expense'|'income';
  icon?: string; parentId: string | null; order: number; isSystem: boolean;
}
interface FinanceRecord extends BaseRow {
  at: number; dateKey: string;
  type: 'expense' | 'income';
  amountMinor: number;          // ★ 以"分"为单位的整数，绝不用浮点
  currency: string;             // 'CNY'
  categoryId: string; categoryPath: string[];   // 快照路径，防分类改名
  reason?: string;              // 为什么花（用户强调的字段）
  merchant?: string; payMethod?: string; note?: string;
  tags: string[];
  aiAsk?: { question: string; answer: string; verdict: 'ok'|'caution'|'warn'; providerId: string; model: string; at: number };
}
```

### AI 配置与报告

```ts
interface AiProviderConfig extends BaseRow {
  presetId: 'deepseek'|'openai'|'openrouter'|'custom';
  label: string;
  baseUrl: string;              // 用户可改
  model: string; visionModel?: string;
  supportsVision: boolean;
  keyRef: string;               // ★ 指向 secret store 的条目名，绝不存明文
  extraHeaders?: Record<string, string>;
  isDefault: boolean;
}
interface Report extends BaseRow {
  kind: 'daily'|'weekly'|'monthly'|'yearly'|'domain'|'compare';
  rangeStart: string; rangeEnd: string;
  domains: ('diary'|'health'|'finance')[];
  components: string[];         // ★ 用户勾选：'chart.weightTrend' / 'text.evaluation' / 'chart.cumulativeSpend' ...
  status: 'draft'|'generating'|'ready'|'failed';
  content: string; snapshot: unknown;
  providerId: string; model: string; generatedAt: number;
}
```

### Dexie 表结构

```ts
this.version(1).stores({
  diaryEntries:      'id, dateKey, createdAt, deletedAt, *tags',
  attachments:       'id, [refType+refId], createdAt',
  sleepRecords:      'id, dateKey, at, deletedAt',
  moodEntries:       'id, dateKey, at, deletedAt, *tags',
  weightRecords:     'id, dateKey, at, deletedAt, [baseline+dateKey]',
  foodItems:         'id, name, *aliases, lastUsedAt, usageCount, deletedAt',
  mealRecords:       'id, dateKey, at, deletedAt, *foodIds',
  financeRecords:    'id, dateKey, at, deletedAt, categoryId, *tags, [type+dateKey]',
  financeCategories: 'id, type, order',
  aiProviders:       'id, isDefault, presetId',
  reports:           'id, kind, [kind+rangeStart], generatedAt',
  appMeta:           'key',
});
```
> `*tags` / `*aliases` / `*foodIds` 是 multiEntry 索引，**只对顶层数组字段生效**，所以 `mealRecords.foodIds` 必须冗余。`deletedAt` 建索引用于过滤"未删除"集合。

---

## 四、AI 网关抽象

目标：provider-agnostic、支持"预设 + 自定义 baseUrl/key"、文本与多模态、结构化输出；且**密钥永不入库、永不进导出包、永不进日志**。

```ts
export type AiPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; base64: string };   // 只在发送瞬间转 base64
export interface AiMessage { role: 'system'|'user'|'assistant'; content: AiPart[] }

export interface AiChatRequest {
  messages: AiMessage[];
  model?: string;               // 可覆盖默认（如走 visionModel）
  temperature?: number; maxTokens?: number;
  responseFormat?: { type: 'json_object' } | { type: 'json_schema'; schema: unknown };
  stream?: boolean;
  taskTag?: string;             // 'health.canIEat' / 'diary.fromPhoto'，用于日志与用量归类
  timeoutMs?: number;
}
export interface AiChatResponse {
  id: string; text: string; json?: unknown;
  providerId: string; model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

// ★ 密钥与 HTTP 由外部注入 —— 这是绕 CORS 与防泄露的结构性保证
export interface AiHttpClient {
  request(input: { url: string; method: 'POST'|'GET'; headers: Record<string,string>;
                   body?: string; signal?: AbortSignal }):
    Promise<{ status: number; headers: Record<string,string>; text: string }>;
  stream?(input: { /* 同上 */; onChunk: (s: string) => void }): Promise<void>;
}
export interface AiCallContext {
  config: AiProviderConfig;
  apiKey: string;               // 运行时从 secret store 取出，函数返回后不留引用
  http: AiHttpClient;           // ★ 平台分派：CapacitorHttp / plugin-http / fetch
  signal?: AbortSignal;
  onDelta?: (d: { text: string }) => void;
}

export interface AiAdapter {
  id: 'openai-compat';
  capabilities: { text: boolean; vision: boolean; stream: boolean; jsonSchema: boolean; listModels: boolean };
  chat(req: AiChatRequest, ctx: AiCallContext): Promise<AiChatResponse>;
  listModels?(ctx: AiCallContext): Promise<string[]>;   // 用于"测试连接"
}

// ★ 业务唯一入口
export interface AiGateway {
  listProviders(): Promise<AiProviderConfig[]>;
  saveProvider(cfg: Omit<AiProviderConfig,'keyRef'> & { keyRef?: string }, apiKey?: string): Promise<AiProviderConfig>;
  setDefault(id: string): Promise<void>;
  deleteProvider(id: string): Promise<void>;
  testConnection(cfg: AiProviderConfig, apiKey: string):
    Promise<{ ok: boolean; models?: string[]; error?: string }>;
  chat(req: AiChatRequest, opts?: { providerId?: string; purpose?: 'text' | 'vision' }): Promise<AiChatResponse>;
  chatStream(req: AiChatRequest, onDelta: (d:{text:string})=>void, opts?): Promise<AiChatResponse>;
}
```

**骨架期只实现一个 `openai-compat` 适配器**。DeepSeek / OpenAI / OpenRouter 的差异只是 baseUrl + model 预填 + 能力开关，这与"预设多个提供商 + 允许自定义 base URL/key"的要求完全对齐，不引入多协议复杂度。

**业务调用示例**（组件层永远只看到这一层）：

```ts
// 吃之前问 AI
await ai.chat({
  taskTag: 'health.canIEat',
  responseFormat: { type: 'json_schema', schema: CanIEatSchema },
  messages: [
    { role: 'system', content: [{ type:'text', text: prompt.canIEat(profile) }] },
    { role: 'user',   content: [{ type:'text', text: JSON.stringify({ food, portionLabel, recentMeals }) }] },
  ],
}, { purpose: 'text' });

// 照片 → 日记（多模态）
await ai.chat({
  taskTag: 'diary.fromPhoto',
  responseFormat: { type: 'json_object' },
  messages: [
    { role:'system', content:[{ type:'text', text: prompt.diaryFromPhoto(tone) }] },
    { role: 'user', content: [
      { type:'text',  text: '把这张照片整理成今天的日记，保留我原话口吻。' },
      { type:'image', mime: photo.mime, base64: photo.base64 },
    ]},
  ],
});
```

**Key 存储方案**

| 平台 | 方案 |
|---|---|
| Android (Capacitor) | `capacitor-secure-preferences`（EncryptedSharedPreferences）；**绝不用 `@capacitor/preferences`**（明文） |
| Windows (Tauri) | `tauri-plugin-stronghold`（加密文件）；`plugin-store` 明文，禁用于 key |
| Web (dev / PWA) | `localStorage` + UI 明示"仅供开发，不安全"黄色警告 |

**防泄露四条硬规则**：① Key 只经 `core/platform/secrets.ts` 读写，配置表只存 `keyRef`；② Key 不进任何 Dexie 表，因此导出包天然不含它，导出前仍扫一遍 manifest 做断言；③ 日志只记 `baseUrl + model + taskTag + token 数`，headers 做 `sk-***last4` 脱敏；④ 网关内部不把 key 写入任何持久化的 error 对象。

---

## 五、打包方案与关键实现细节

### IndexedDB 可靠性（已核实结论）

| 场景 | 结论 | 真实风险 |
|---|---|---|
| Android WebView | 基本可靠。数据在 app 私有目录，升级保留、卸载清除 | 官方 Storage 指南明确写 WebView 的存储**会被 OS 在空间紧张时回收**；`navigator.storage.persist()` 在 Android 上可用，标记后即豁免 LRU 淘汰。用户的"清除数据"、第三方清理软件会抹掉；**改 `androidScheme`/`appId` 等于换 origin → 全部丢失** |
| Tauri (Windows) | 最可靠。WebView2 独立 profile 目录，不受浏览器清理影响 | 改 `identifier` / `useHttpsScheme` 会换目录 → 数据"消失"；清理 AppData 的软件仍可能删；WebView2 Runtime 缺失时起不来 |

**据此三条落地要求**：
1. 启动即调用 `navigator.storage.persist()`，把结果写进 `appMeta`，在「数据」页显示持久化状态。
2. DB 名 `starburst`、`appId`、`identifier`、`androidScheme`、`useHttpsScheme` 在 commit 1 定死，写入 README「永不修改清单」。
3. **导出/导入是兜底方案，不是可选项**，骨架就做成主路径入口（设置页顶部 + 首次启动提示），并诚实提示用户"别清应用数据"。

### 导出 / 导入 ZIP 的两端实现（最易踩坑的一段）

- **打包库选 `fflate`**（gzip 后约 9KB，性能最优；JSZip 约 100KB 且慢约 2.5 倍）。用其流式 `Zip` 逐条 push，避免全表 JSON 一次性进内存（图片多时会炸）。
- **包结构**：`manifest.json`（schemaVersion / appVersion / exportedAt / 各表 counts / sha256）+ `data/<table>.json`（一表一文件）+ `media/<attachmentId>.<ext>`。
- **Android 保存**：targetSdk 36 下不能写任意路径（scoped storage）。先 `@capacitor/filesystem` 写 `Directory.Cache` 临时 zip，再用**系统分享面板**（`@capacitor/share`，走 FileProvider，无需任何存储权限）或 `@capgo/capacitor-file-sharer` 落 Downloads（内部走 MediaStore）。**不要**申请 `WRITE_EXTERNAL_STORAGE` / `MANAGE_EXTERNAL_STORAGE`（Play 审核会拒，Android 11+ 也不再需要）。
- **Android 读取（导入）**：`@capawesome/capacitor-file-picker` 用 SAF 选 zip → 读为 blob → fflate unzip。不要试图访问 `Android/data/`（Android 11+ 已禁止）。
- **Tauri 保存/读取**：`@tauri-apps/plugin-dialog` 的 `save()` / `open()` 拿路径，`@tauri-apps/plugin-fs` 的 `writeFile` / `readFile`。capabilities **按需开权限**：`dialog:allow-save`、`dialog:allow-open`、`fs:allow-write-file`、`fs:allow-read-file`，并用 `$DOWNLOAD` / `$DOCUMENT` 限定范围，**不要**开 `fs:default` 全权。
- **Web（dev）**：导出用 Blob + `<a download>`；导入用 `<input type="file">`。
- **导入写入策略**：先校验 manifest（版本、counts、checksum），再在 `db.transaction('rw', ...)` 内 `bulkPut`，用 `id` 幂等。提供"合并 / 覆盖"，默认合并；**覆盖前强制自动备份当前数据**。

### 打包两条附加要求

- 路由用 `createHashRouter`（`file://` 与自定义 scheme 下 history 路由刷新会 404，hash 路由在 Capacitor / Tauri / Web 三端都稳）。
- `vite.config.ts` 设 `build.target: 'es2021'`（Android WebView 与旧版 WebView2 可能不认更新语法）；`base` 保持默认 `/`。

### Windows 桌面选型：Tauri 2（推荐）

体积约 3–10MB vs Electron 约 120–200MB；空闲内存约 30–50MB vs 约 185–220MB。同一套 `dist/` 直接复用，`plugin-http` / `plugin-dialog` / `plugin-fs` / `plugin-stronghold` 已官方化，骨架需要的四件事（发请求、存 key、选路径、写文件）全部覆盖。代价：需 Rust ≥1.77 工具链，Win10 需 WebView2 Runtime（Win11 预装）。
> 若用户明确"完全不想碰 Rust"，退路是 Electron + electron-builder，但代价是约 10 倍体积。

---

## 六、依赖与版本（已用 npm 实测确认，2026-10）

| 包 | 版本 | 说明 |
|---|---|---|
| react / react-dom | 19.3.1 | |
| vite | 8.3.4 | Vite 8 起统一用 Rolldown |
| @vitejs/plugin-react | 6.1.2 | |
| typescript | 7.0.2 | 原生编译器，类型检查显著更快；若插件出现兼容问题，回退 `6.x` 是安全退路 |
| tailwindcss / @tailwindcss/vite | 4.3.3 | **配置方式已变**：不再生成 `tailwind.config.js` + `postcss.config.js`。改为 CSS-first —— `vite.config.ts` 里 `plugins: [tailwindcss()]`，`src/index.css` 只写 `@import "tailwindcss";`，主题用 `@theme { --color-*: ... }`。**网上的 v3 教程已过时，不要照抄** |
| dexie | 4.4.6 | Dexie 4 提供 live query 缓存与自动 schema 检测 |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` 当状态源，多数页面无需额外状态库 |
| react-router | 8.4.0 | 用 `createHashRouter`；只需 `react-router` 单包，不再需要 `react-router-dom` |
| zustand | 5.0.15 | 只存 UI 全局态（AI 面板开合、当前 provider、主题） |
| fflate | 0.8.3 | ZIP |
| dayjs | 1.11.23 | `dateKey` 派生与格式化，比 date-fns 轻 |
| ulid | 3.0.2 | 时间有序 id |
| recharts | 3.10.1 | 图表：React 声明式、SVG，与 Tailwind 生态贴合。趋势图/累计图够用；上到万级数据点或要桑基图时再局部引入 ECharts |
| @capacitor/core / cli | 8.5.3 | targetSdk 36 / API 24+ |
| @tauri-apps/api / cli | 2.12.4 / 2.12.3 | Rust ≥1.77 |

骨架阶段**不引入**：shadcn/ui CLI 全量组件（先自研 4–5 个 Tailwind 原子组件）、TanStack Query（Dexie live query 已够）、i18n 框架、任何云端 SDK。

---

## 七、实施步骤（git 里程碑，每次提交都是可运行的稳定态）

第 0 步：`git init` + `.gitignore`（`dist/`、`node_modules/`、`android/` 构建产物、`src-tauri/target/`）+ `.editorconfig`，并入 commit 1。

| # | commit | 内容 | 该 commit 的"可运行"定义 |
|---|---|---|---|
| 1 | `chore: 初始化 Vite + React + TS + Tailwind v4 骨架` | 清理 Vite 模板；接入 `@tailwindcss/vite`；`index.css` 写 `@import "tailwindcss";` + `@theme` 品牌色；初始化 git | `npm run dev` 打开页面，用 Tailwind 类渲染的标题证明样式生效 |
| 2 | `chore: 工程规范与路径别名` | ESLint + Prettier + Vitest（先写一个 `dateKey` 单测）+ `@/` 别名 + tsconfig 严格模式 | `npm run lint` / `test` / `build` 三绿 |
| 3 | `feat(shell): AppShell 与四模块占位页` | `createHashRouter`；底部 TabBar（桌面断点切左侧 rail）；日记/健康/经济/AI 助手 + 设置共五个页面 | **能点击切换五个页面** |
| 4 | `feat(db): Dexie schema v1 与 repo 基础层` | 第二节全部表；`baseRepo`（软删除 / 时间戳）；`platform/persist.ts` 请求 `persist()`；设置页加"数据库自检"卡片（显示版本与各表 count） | 写一条记录 → F5 → 数据还在；DevTools 可见 `starburst` 库 |
| 5 | `feat(ai): AI 网关与 OpenAI 兼容适配器` | `ai/types.ts` / `gateway.ts` / `adapters/openaiCompat.ts` / `presets.ts`；`platform/secrets.ts`（Web 走 localStorage + 黄色警告）；AI 提供商配置页 + "测试连接"按钮；vite dev proxy 便于浏览器调试 | 填 key 点"测试连接"返回模型列表；若被 CORS 挡，给出明确文案引导到 App/桌面端验证 |
| 6 | `feat(platform): 平台适配层与两端接入` | `detect.ts` / `http.ts`（CapacitorHttp → plugin-http → fetch 三路分派）/ `camera.ts` / `fsio.ts` 骨架；Capacitor 与 Tauri 依赖先装不建壳 | Web 端一切照旧可跑；`aiFetch` 留好原生分支 |
| 7 | `feat(backup): 导出 ZIP` | `backup/export.ts` + `manifest.ts`；fflate 流式打包；`fsio.saveBytes`（Web 先落地） | 设置页点"导出"→ 下载 zip → 解压能看到 manifest + data + media |
| 8 | `feat(backup): 导入 ZIP 与恢复` | `import.ts`：文件选择、manifest 校验、事务 bulkPut、"合并/覆盖 + 覆盖前自动备份" | 清空 IndexedDB → 导入 → 数据与计数一致恢复 |
| 9 | `chore(mobile): Capacitor Android 壳接入` | `npx cap add android` + `capacitor.config.ts` 钉死 `androidScheme/appId`；接 Share / FileSharer / SecurePreferences | 真机装 debug APK：四页面能点、能写库、导出可存 Downloads、**AI 直连成功无 CORS 报错** |
| 10 | `chore(desktop): Tauri 2 壳接入` | `tauri init`；capabilities 按需开权限；`plugin-http / dialog / fs / stronghold` | `npm run tauri build` 出 Windows 安装包，四模块与导出导入可用 |

> commit 3 / 4 / 5 / 7 是四个**能力里程碑**，9 / 10 是**平台里程碑**；每个都能独立运行，回滚任意一个不影响前面。骨架完成后，后续四个功能模块的细节即可并行推进。

---

## 八、验证方式

**跑起来**：`npm run dev`（浏览器，最快回归）→ `npm run build && npm run preview`（产物模式，模拟壳内加载）→ `npx cap run android` → `npm run tauri dev` / `npm run tauri build`。

**验证本地存储**
1. 设置页「数据库自检」卡片显示 Dexie `verno`、各表 `count()`、`navigator.storage.persisted()` 结果。
2. 写入 → F5 → 数据仍在；关闭浏览器重开 → 仍在；DevTools → Application → IndexedDB → `starburst` 可见各 objectStore 与索引。
3. 索引有效性：自检里跑 `db.foodItems.where('aliases').anyOf(['米饭'])`、`db.mealRecords.where('foodIds').anyOf([foodId])`、`db.financeRecords.where('[type+dateKey]').equals(['expense','2026-10-17'])`，有结果即证明三个关键索引可用。
4. **系数换算单测**（Vitest）：FoodItem(100g 基准 116kcal) + 「1.5 碗」(preset 150g) → 断言 `multiplier = 2.25`、`resolvedAmount = 225`、`nutritionSnapshot.kcal = 261`；再断言修改 FoodItem 后历史 MealRecord 快照不变。

**验证 AI 调用**
- 配置页填 baseUrl + key → "测试连接"（优先 `GET /models`，不支持则发一条 `max_tokens: 1` 的 chat）。
- 浏览器端若因 CORS 失败，UI 必须给出准确提示，并可用 `vite.config.ts` 的 `server.proxy` 作为**仅开发期**绕过（生产必须走原生 HTTP 通道）。
- 真机 / 桌面端直连应成功（原生网络栈无 CORS）。
- 多模态：用一张照片走 `diary.fromPhoto`，确认返回 JSON 可 parse 且正文写入 DiaryEntry（`source: 'ai-from-photo'`）。
- **安全检查**：导出 zip 后文本搜索 `sk-` 应零命中；错误日志中 `authorization` 已脱敏；断网时返回可读错误而非未捕获异常。

**验证打包与迁移闭环（最重要的端到端）**
Android 装 APK → 记录日记 / 餐食 / 收支 → 导出 zip 存 Downloads → 卸载 App（模拟换机）→ 重装 → 导入同一 zip → 数据条数与图片数量一致。
桌面端同样跑一遍，并做**跨端验证**：Android 导出的 zip 在 Windows 导入，图片能正常显示（靠 `media/<id>.<ext>` + manifest 的 mime 映射）。

---

## 九、关键文件（实施时优先落地）

- [schema.ts](file:///d:/File/claude/starburst_recorder/src/core/db/schema.ts) — Dexie 表与索引的唯一真相源，决定全部查询能力
- [types.ts](file:///d:/File/claude/starburst_recorder/src/core/ai/types.ts) — AiGateway / AiAdapter / AiCallContext 接口，密钥与 HTTP 的注入边界
- [http.ts](file:///d:/File/claude/starburst_recorder/src/core/platform/http.ts) — 绕 CORS 的唯一分派点
- [export.ts](file:///d:/File/claude/starburst_recorder/src/core/backup/export.ts) — 导出 ZIP：manifest + 流式打包 + 跨端落盘
- [capacitor.config.ts](file:///d:/File/claude/starburst_recorder/capacitor.config.ts) 与 [tauri.conf.json](file:///d:/File/claude/starburst_recorder/src-tauri/tauri.conf.json) — origin / identifier / scheme 的「永不修改清单」
