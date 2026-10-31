// 桌面端的本地数据库：SQLite（Electron 44 内置 Node 24 的 node:sqlite）。
//
// 为什么不在渲染进程里直连：文件系统访问、原生模块、锁都归主进程管；
// 渲染进程只通过 IPC 调用这里白名单里的方法，拿到的仍然是普通的 JSON 对象。
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS diaryEntries (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    dateKey TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    deletedAt INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_code ON diaryEntries(code);
  CREATE INDEX IF NOT EXISTS idx_entries_day ON diaryEntries(dateKey, createdAt);
  CREATE INDEX IF NOT EXISTS idx_entries_trash ON diaryEntries(deletedAt);

  CREATE TABLE IF NOT EXISTS diaryDays (
    dateKey TEXT PRIMARY KEY,
    weather TEXT,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS diaryStamps (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL DEFAULT '',
    dateKey TEXT NOT NULL,
    time TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_stamps_day ON diaryStamps(dateKey, time);
  CREATE INDEX IF NOT EXISTS idx_stamps_trash ON diaryStamps(deletedAt);

  -- 预设库：常用人物 / 常用地名，编辑日记时一键插入
  CREATE TABLE IF NOT EXISTS diaryPresets (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_code ON diaryPresets(code);
  CREATE INDEX IF NOT EXISTS idx_presets_kind ON diaryPresets(kind, name);
  CREATE INDEX IF NOT EXISTS idx_presets_trash ON diaryPresets(deletedAt);

  -- 健康：身体档案只有一行（id = 'me'）
  CREATE TABLE IF NOT EXISTS healthProfile (
    id TEXT PRIMARY KEY,
    sex TEXT,
    age REAL,
    heightCm REAL,
    weightKg REAL,
    weightAt INTEGER,
    activity TEXT,
    tdee REAL,
    targetKcal REAL,
    proteinTarget REAL,
    plan TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    weighDay INTEGER,
    weighTime TEXT NOT NULL DEFAULT '07:00',
    weighIns TEXT NOT NULL DEFAULT '[]',
    idealBedtime TEXT NOT NULL DEFAULT '23:00',
    idealWakeTime TEXT NOT NULL DEFAULT '07:00',
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS healthFoods (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    kcal REAL NOT NULL DEFAULT 0,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    servingName TEXT,
    servingGrams REAL,
    photo TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_foods_name ON healthFoods(name);
  CREATE INDEX IF NOT EXISTS idx_foods_trash ON healthFoods(deletedAt);

  CREATE TABLE IF NOT EXISTS healthIntakes (
    id TEXT PRIMARY KEY,
    code TEXT,
    dateKey TEXT NOT NULL,
    time TEXT NOT NULL,
    foodId TEXT,
    name TEXT NOT NULL,
    grams REAL NOT NULL DEFAULT 0,
    kcal REAL NOT NULL DEFAULT 0,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    mealId TEXT,
    components TEXT,
    tdeeSnapshot REAL,
    targetKcalSnapshot REAL,
    proteinTargetSnapshot REAL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_intakes_day ON healthIntakes(dateKey, time);
  CREATE INDEX IF NOT EXISTS idx_intakes_trash ON healthIntakes(deletedAt);

  -- 套餐：整体食物的组合，items 是 [{ foodId, grams }] 的 JSON
  CREATE TABLE IF NOT EXISTS healthMeals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_meals_name ON healthMeals(name);
  CREATE INDEX IF NOT EXISTS idx_meals_trash ON healthMeals(deletedAt);

  -- 睡眠：一夜一行，dateKey 是起床那天
  CREATE TABLE IF NOT EXISTS healthSleeps (
    id TEXT PRIMARY KEY,
    code TEXT,
    dateKey TEXT NOT NULL,
    bedtime TEXT NOT NULL,
    wakeTime TEXT NOT NULL,
    quality INTEGER,
    wakeEvents TEXT NOT NULL DEFAULT '[]',
    wakeCount INTEGER,
    wakeMinutes INTEGER,
    note TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_sleeps_day ON healthSleeps(dateKey);
  CREATE INDEX IF NOT EXISTS idx_sleeps_trash ON healthSleeps(deletedAt);

  -- 经济：占位表，真正的记账模型以后再加
  CREATE TABLE IF NOT EXISTS financeEntries (
    id TEXT PRIMARY KEY,
    dateKey TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_finance_day ON financeEntries(dateKey);
  CREATE INDEX IF NOT EXISTS idx_finance_trash ON financeEntries(deletedAt);
`

/**
 * images 在库里是一个 JSON 文本：读出来还原成数组，坏了就当空数组。
 * 图片本身是 dataURL，跟记录一起进备份，所以不另开表。
 */
function parseImages(value) {
  if (typeof value !== 'string' || value === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function imagesText(images) {
  return JSON.stringify(Array.isArray(images) ? images : [])
}

/** 同一份行数据在 IPC 里保持普通对象：主键字段名原样，deletedAt 统一成 null */
function entryRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    code: row.code,
    dateKey: row.dateKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    content: row.content,
    images: parseImages(row.images),
    deletedAt: row.deletedAt ?? null,
  }
}

function dayRow(row) {
  if (!row) return undefined
  return {
    dateKey: row.dateKey,
    weather: row.weather ?? null,
    updatedAt: row.updatedAt,
  }
}

function stampRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    code: row.code ?? '',
    dateKey: row.dateKey,
    time: row.time,
    content: row.content,
    images: parseImages(row.images),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/** 批量 IN 查询的占位符；空数组由调用方提前挡掉，SQLite 不接受 IN () */
function marks(count) {
  return Array.from({ length: count }, () => '?').join(',')
}

/** 预设库行：kind 只认 person / place，坏数据归到 person */
function presetRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    code: row.code ?? '',
    kind: row.kind === 'place' ? 'place' : 'person',
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/** IPC 里只接受 number / null，undefined 和 NaN 都不能进 SQLite */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function profileRow(row) {
  if (!row) return undefined
  return {
    id: 'me',
    sex: row.sex ?? null,
    age: num(row.age),
    heightCm: num(row.heightCm),
    weightKg: num(row.weightKg),
    weightAt: num(row.weightAt),
    activity: row.activity ?? null,
    tdee: num(row.tdee),
    targetKcal: num(row.targetKcal),
    proteinTarget: num(row.proteinTarget),
    plan: row.plan ?? '',
    note: row.note ?? '',
    weighDay: num(row.weighDay),
    weighTime: row.weighTime ?? '07:00',
    idealBedtime: row.idealBedtime ?? '23:00',
    idealWakeTime: row.idealWakeTime ?? '07:00',
    weighIns: weighInsFromDb(row.weighIns),
    updatedAt: row.updatedAt,
  }
}

/** 称重历史以 JSON 文本存：坏数据当空数组，字段不对的条目剔掉 */
function weighInsFromDb(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list)) return []
    return list
      .filter(
        (item) =>
          item &&
          typeof item.dateKey === 'string' &&
          Number.isFinite(Number(item.weightKg)),
      )
      .map((item) => ({
        dateKey: item.dateKey,
        weightKg: Number(item.weightKg),
        createdAt: num(item.createdAt) ?? 0,
      }))
      .slice(0, 120)
  } catch {
    return []
  }
}

function foodRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    code: row.code ?? '',
    name: row.name,
    kcal: num(row.kcal) ?? 0,
    protein: num(row.protein) ?? 0,
    carbs: num(row.carbs) ?? 0,
    fat: num(row.fat) ?? 0,
    servingName: row.servingName ?? null,
    servingGrams: num(row.servingGrams),
    photo: row.photo ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

function intakeRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    code: row.code ?? '',
    dateKey: row.dateKey,
    time: row.time,
    foodId: row.foodId ?? null,
    name: row.name,
    grams: num(row.grams) ?? 0,
    kcal: num(row.kcal) ?? 0,
    protein: num(row.protein) ?? 0,
    carbs: num(row.carbs) ?? 0,
    fat: num(row.fat) ?? 0,
    source: row.source ?? 'manual',
    mealId: row.mealId ?? null,
    components: componentsFromDb(row.components),
    tdeeSnapshot: num(row.tdeeSnapshot),
    targetKcalSnapshot: num(row.targetKcalSnapshot),
    proteinTargetSnapshot: num(row.proteinTargetSnapshot),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

function sleepRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    code: row.code ?? '',
    dateKey: row.dateKey,
    bedtime: row.bedtime,
    wakeTime: row.wakeTime,
    quality: num(row.quality),
    wakeEvents: wakeEventsFromDb(row.wakeEvents),
    wakeCount: num(row.wakeCount),
    wakeMinutes: num(row.wakeMinutes),
    note: row.note ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/** 夜醒事件：只认 { time: 'HH:MM', minutes: 非负整数 }，坏条目直接剔除 */
function wakeEventsFromDb(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list)) return []
    return list
      .filter(
        (item) =>
          item &&
          typeof item.time === 'string' &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) &&
          typeof item.minutes === 'number' &&
          Number.isFinite(item.minutes) &&
          item.minutes >= 0 &&
          item.minutes <= 1440,
      )
      .map((item) => ({ time: item.time, minutes: Math.floor(item.minutes) }))
  } catch {
    return []
  }
}

/** 套餐的组合项：只认 { foodId: string, grams: number }，坏数据当空 */
function mealItemsFromDb(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list)) return []
    return list
      .filter((item) => item && typeof item.foodId === 'string' && Number.isFinite(Number(item.grams)))
      .map((item) => ({ foodId: item.foodId, grams: Number(item.grams) }))
  } catch {
    return []
  }
}

/** 摄入的成分快照：没有就返回 null，页面据此判断要不要显示展开 */
function componentsFromDb(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list) || list.length === 0) return null
    return list.map((item) => ({
      foodId: typeof item?.foodId === 'string' ? item.foodId : null,
      name: String(item?.name ?? ''),
      grams: num(Number(item?.grams)) ?? 0,
      kcal: num(Number(item?.kcal)) ?? 0,
      protein: num(Number(item?.protein)) ?? 0,
      carbs: num(Number(item?.carbs)) ?? 0,
      fat: num(Number(item?.fat)) ?? 0,
    }))
  } catch {
    return null
  }
}

function mealRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    name: row.name,
    items: mealItemsFromDb(row.items),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/** 经济占位行：字段少，坏值统一兜底成空串 / 0 */
function financeRow(row) {
  if (!row) return undefined
  return {
    id: row.id,
    dateKey: row.dateKey,
    name: row.name ?? '',
    amount: num(row.amount) ?? 0,
    note: row.note ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/**
 * 打开（不存在就建）数据库，返回一个只有 `call` 和 `close` 的对象。
 * `call` 的方法名必须命中下面的白名单，渲染进程没法拼任意 SQL 进来。
 */
function createDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  // WAL：写入不阻塞读取，断电时也更容易恢复
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(SCHEMA)
  // 旧库补列：CREATE TABLE IF NOT EXISTS 不会给已经存在的表加列
  const intakeColumns = new Set(
    db.prepare('PRAGMA table_info(healthIntakes)').all().map((row) => row.name),
  )
  if (!intakeColumns.has('mealId')) db.exec('ALTER TABLE healthIntakes ADD COLUMN mealId TEXT')
  if (!intakeColumns.has('components')) db.exec('ALTER TABLE healthIntakes ADD COLUMN components TEXT')
  if (!intakeColumns.has('tdeeSnapshot')) db.exec('ALTER TABLE healthIntakes ADD COLUMN tdeeSnapshot REAL')
  if (!intakeColumns.has('targetKcalSnapshot'))
    db.exec('ALTER TABLE healthIntakes ADD COLUMN targetKcalSnapshot REAL')
  if (!intakeColumns.has('proteinTargetSnapshot'))
    db.exec('ALTER TABLE healthIntakes ADD COLUMN proteinTargetSnapshot REAL')
  const profileColumns = new Set(
    db.prepare('PRAGMA table_info(healthProfile)').all().map((row) => row.name),
  )
  if (!profileColumns.has('weighDay'))
    db.exec('ALTER TABLE healthProfile ADD COLUMN weighDay INTEGER')
  if (!profileColumns.has('weighTime'))
    db.exec("ALTER TABLE healthProfile ADD COLUMN weighTime TEXT NOT NULL DEFAULT '07:00'")
  if (!profileColumns.has('weighIns'))
    db.exec("ALTER TABLE healthProfile ADD COLUMN weighIns TEXT NOT NULL DEFAULT '[]'")
  if (!profileColumns.has('idealBedtime'))
    db.exec("ALTER TABLE healthProfile ADD COLUMN idealBedtime TEXT NOT NULL DEFAULT '23:00'")
  if (!profileColumns.has('idealWakeTime'))
    db.exec("ALTER TABLE healthProfile ADD COLUMN idealWakeTime TEXT NOT NULL DEFAULT '07:00'")
  const foodColumns = new Set(
    db.prepare('PRAGMA table_info(healthFoods)').all().map((row) => row.name),
  )
  if (!foodColumns.has('code')) db.exec('ALTER TABLE healthFoods ADD COLUMN code TEXT')
  if (!foodColumns.has('photo')) db.exec('ALTER TABLE healthFoods ADD COLUMN photo TEXT')
  if (!intakeColumns.has('code')) db.exec('ALTER TABLE healthIntakes ADD COLUMN code TEXT')
  const stampColumns = new Set(
    db.prepare('PRAGMA table_info(diaryStamps)').all().map((row) => row.name),
  )
  if (!stampColumns.has('code')) db.exec('ALTER TABLE diaryStamps ADD COLUMN code TEXT')
  // 日记与随记的图片字段：老库补一个空数组列，新写入直接带上
  if (!stampColumns.has('images'))
    db.exec("ALTER TABLE diaryStamps ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
  const entryColumns = new Set(
    db.prepare('PRAGMA table_info(diaryEntries)').all().map((row) => row.name),
  )
  if (!entryColumns.has('images'))
    db.exec("ALTER TABLE diaryEntries ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
  // 睡眠的夜醒次数 / 累计分钟：老库补两列，新库建表时就有
  const sleepColumns = new Set(
    db.prepare('PRAGMA table_info(healthSleeps)').all().map((row) => row.name),
  )
  if (!sleepColumns.has('wakeCount'))
    db.exec('ALTER TABLE healthSleeps ADD COLUMN wakeCount INTEGER')
  if (!sleepColumns.has('wakeMinutes'))
    db.exec('ALTER TABLE healthSleeps ADD COLUMN wakeMinutes INTEGER')
  if (!sleepColumns.has('wakeEvents'))
    db.exec("ALTER TABLE healthSleeps ADD COLUMN wakeEvents TEXT NOT NULL DEFAULT '[]'")
  // 旧记录补上 7 位短编号；新记录写入时自己带
  const fillCode = "substr(lower(hex(randomblob(4))), 1, 7)"
  db.exec(`UPDATE healthFoods SET code = ${fillCode} WHERE code IS NULL OR code = ''`)
  db.exec(`UPDATE healthIntakes SET code = ${fillCode} WHERE code IS NULL OR code = ''`)
  db.exec(`UPDATE diaryStamps SET code = ${fillCode} WHERE code IS NULL OR code = ''`)
  db.exec('PRAGMA user_version = 9')

  const q = {
    entriesOfDay: db.prepare(
      'SELECT * FROM diaryEntries WHERE dateKey = ? AND deletedAt IS NULL ORDER BY createdAt ASC',
    ),
    entryByCode: db.prepare('SELECT * FROM diaryEntries WHERE code = ? LIMIT 1'),
    updateContent: db.prepare(
      'UPDATE diaryEntries SET content = ?, images = ?, updatedAt = ? WHERE id = ?',
    ),
    removeEntry: db.prepare('UPDATE diaryEntries SET deletedAt = ? WHERE id = ?'),
    restoreEntry: db.prepare('UPDATE diaryEntries SET deletedAt = NULL WHERE id = ?'),
    dayInfo: db.prepare('SELECT * FROM diaryDays WHERE dateKey = ?'),
    upsertDay: db.prepare(
      `INSERT INTO diaryDays (dateKey, weather, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT(dateKey) DO UPDATE SET weather = excluded.weather, updatedAt = excluded.updatedAt`,
    ),
    stampsOfDay: db.prepare(
      'SELECT * FROM diaryStamps WHERE dateKey = ? AND deletedAt IS NULL ORDER BY time ASC',
    ),
    removeStamp: db.prepare('UPDATE diaryStamps SET deletedAt = ? WHERE id = ?'),
    restoreStamp: db.prepare('UPDATE diaryStamps SET deletedAt = NULL WHERE id = ?'),
    trashedEntries: db.prepare(
      'SELECT * FROM diaryEntries WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    trashedStamps: db.prepare(
      'SELECT * FROM diaryStamps WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    purgeEntry: db.prepare('DELETE FROM diaryEntries WHERE id = ?'),
    purgeStamp: db.prepare('DELETE FROM diaryStamps WHERE id = ?'),
    everyEntry: db.prepare('SELECT * FROM diaryEntries'),
    everyStamp: db.prepare('SELECT * FROM diaryStamps'),
    everyDay: db.prepare('SELECT * FROM diaryDays'),
    everyPreset: db.prepare('SELECT * FROM diaryPresets'),
    countEntries: db.prepare('SELECT COUNT(*) AS n FROM diaryEntries WHERE deletedAt IS NULL'),
    countStamps: db.prepare('SELECT COUNT(*) AS n FROM diaryStamps WHERE deletedAt IS NULL'),
    countFoods: db.prepare('SELECT COUNT(*) AS n FROM healthFoods WHERE deletedAt IS NULL'),
    countMeals: db.prepare('SELECT COUNT(*) AS n FROM healthMeals WHERE deletedAt IS NULL'),
    countIntakes: db.prepare('SELECT COUNT(*) AS n FROM healthIntakes WHERE deletedAt IS NULL'),
    allEntryIds: db.prepare('SELECT id FROM diaryEntries'),
    allStampIds: db.prepare('SELECT id FROM diaryStamps'),
    allDayKeys: db.prepare('SELECT dateKey FROM diaryDays'),
    allPresetIds: db.prepare('SELECT id FROM diaryPresets'),
    upsertEntry: db.prepare(
      `INSERT INTO diaryEntries (id, code, dateKey, createdAt, updatedAt, content, images, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         dateKey = excluded.dateKey,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         content = excluded.content,
         images = excluded.images,
         deletedAt = excluded.deletedAt`,
    ),
    upsertStamp: db.prepare(
      `INSERT INTO diaryStamps (id, code, dateKey, time, content, images, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         dateKey = excluded.dateKey,
         time = excluded.time,
         content = excluded.content,
         images = excluded.images,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),

    // ─────────── 预设库 ───────────
    diaryPresets: db.prepare(
      'SELECT * FROM diaryPresets WHERE deletedAt IS NULL ORDER BY kind ASC, name ASC',
    ),
    trashedPresets: db.prepare(
      'SELECT * FROM diaryPresets WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    upsertPreset: db.prepare(
      `INSERT INTO diaryPresets (id, code, kind, name, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         kind = excluded.kind,
         name = excluded.name,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),
    removePreset: db.prepare('UPDATE diaryPresets SET deletedAt = ? WHERE id = ?'),
    restorePreset: db.prepare('UPDATE diaryPresets SET deletedAt = NULL WHERE id = ?'),
    purgePreset: db.prepare('DELETE FROM diaryPresets WHERE id = ?'),
    purgeTrashedPresets: db.prepare('DELETE FROM diaryPresets WHERE deletedAt IS NOT NULL'),

    // ─────────── 健康 ───────────
    healthProfile: db.prepare("SELECT * FROM healthProfile WHERE id = 'me'"),
    upsertProfile: db.prepare(
      `INSERT INTO healthProfile
         (id, sex, age, heightCm, weightKg, weightAt, activity, tdee, targetKcal, proteinTarget, plan, note,
          weighDay, weighTime, weighIns, idealBedtime, idealWakeTime, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sex = excluded.sex,
         age = excluded.age,
         heightCm = excluded.heightCm,
         weightKg = excluded.weightKg,
         weightAt = excluded.weightAt,
         activity = excluded.activity,
         tdee = excluded.tdee,
         targetKcal = excluded.targetKcal,
         proteinTarget = excluded.proteinTarget,
         plan = excluded.plan,
         note = excluded.note,
         weighDay = excluded.weighDay,
         weighTime = excluded.weighTime,
         weighIns = excluded.weighIns,
         idealBedtime = excluded.idealBedtime,
         idealWakeTime = excluded.idealWakeTime,
         updatedAt = excluded.updatedAt`,
    ),
    healthFoods: db.prepare('SELECT * FROM healthFoods WHERE deletedAt IS NULL ORDER BY name ASC'),
    foodById: db.prepare('SELECT * FROM healthFoods WHERE id = ?'),
    upsertFood: db.prepare(
      `INSERT INTO healthFoods
         (id, code, name, kcal, protein, carbs, fat, servingName, servingGrams, photo, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         name = excluded.name,
         kcal = excluded.kcal,
         protein = excluded.protein,
         carbs = excluded.carbs,
         fat = excluded.fat,
         servingName = excluded.servingName,
         servingGrams = excluded.servingGrams,
         photo = excluded.photo,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),
    removeFood: db.prepare('UPDATE healthFoods SET deletedAt = ? WHERE id = ?'),
    trashedFoods: db.prepare(
      'SELECT * FROM healthFoods WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    restoreFood: db.prepare('UPDATE healthFoods SET deletedAt = NULL WHERE id = ?'),
    purgeFood: db.prepare('DELETE FROM healthFoods WHERE id = ?'),
    purgeTrashedFoods: db.prepare('DELETE FROM healthFoods WHERE deletedAt IS NOT NULL'),
    intakesOfDay: db.prepare(
      'SELECT * FROM healthIntakes WHERE dateKey = ? AND deletedAt IS NULL ORDER BY time ASC',
    ),
    intakeDays: db.prepare(
      'SELECT DISTINCT dateKey FROM healthIntakes WHERE deletedAt IS NULL',
    ),
    upsertIntake: db.prepare(
      `INSERT INTO healthIntakes
         (id, code, dateKey, time, foodId, name, grams, kcal, protein, carbs, fat, source, mealId, components, tdeeSnapshot, targetKcalSnapshot, proteinTargetSnapshot, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         dateKey = excluded.dateKey,
         time = excluded.time,
         foodId = excluded.foodId,
         name = excluded.name,
         grams = excluded.grams,
         kcal = excluded.kcal,
         protein = excluded.protein,
         carbs = excluded.carbs,
         fat = excluded.fat,
         source = excluded.source,
         mealId = excluded.mealId,
         components = excluded.components,
         tdeeSnapshot = excluded.tdeeSnapshot,
         targetKcalSnapshot = excluded.targetKcalSnapshot,
         proteinTargetSnapshot = excluded.proteinTargetSnapshot,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),
    removeIntake: db.prepare('UPDATE healthIntakes SET deletedAt = ? WHERE id = ?'),
    restoreIntake: db.prepare('UPDATE healthIntakes SET deletedAt = NULL WHERE id = ?'),
    trashedIntakes: db.prepare(
      'SELECT * FROM healthIntakes WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    purgeIntake: db.prepare('DELETE FROM healthIntakes WHERE id = ?'),
    purgeTrashedIntakes: db.prepare('DELETE FROM healthIntakes WHERE deletedAt IS NOT NULL'),
    sleepOfDay: db.prepare(
      'SELECT * FROM healthSleeps WHERE dateKey = ? AND deletedAt IS NULL LIMIT 1',
    ),
    sleepDays: db.prepare('SELECT DISTINCT dateKey FROM healthSleeps WHERE deletedAt IS NULL'),
    upsertSleep: db.prepare(
      `INSERT INTO healthSleeps
         (id, code, dateKey, bedtime, wakeTime, quality, wakeEvents, wakeCount, wakeMinutes, note, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         dateKey = excluded.dateKey,
         bedtime = excluded.bedtime,
         wakeTime = excluded.wakeTime,
         quality = excluded.quality,
         wakeEvents = excluded.wakeEvents,
         wakeCount = excluded.wakeCount,
         wakeMinutes = excluded.wakeMinutes,
         note = excluded.note,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),
    removeSleep: db.prepare('UPDATE healthSleeps SET deletedAt = ? WHERE id = ?'),
    restoreSleep: db.prepare('UPDATE healthSleeps SET deletedAt = NULL WHERE id = ?'),
    trashedSleeps: db.prepare(
      'SELECT * FROM healthSleeps WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    purgeSleep: db.prepare('DELETE FROM healthSleeps WHERE id = ?'),
    purgeTrashedSleeps: db.prepare('DELETE FROM healthSleeps WHERE deletedAt IS NOT NULL'),
    healthMeals: db.prepare('SELECT * FROM healthMeals WHERE deletedAt IS NULL ORDER BY name ASC'),
    trashedMeals: db.prepare(
      'SELECT * FROM healthMeals WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    ),
    upsertMeal: db.prepare(
      `INSERT INTO healthMeals (id, name, items, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         items = excluded.items,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),
    removeMeal: db.prepare('UPDATE healthMeals SET deletedAt = ? WHERE id = ?'),
    restoreMeal: db.prepare('UPDATE healthMeals SET deletedAt = NULL WHERE id = ?'),
    purgeMeal: db.prepare('DELETE FROM healthMeals WHERE id = ?'),
    purgeTrashedMeals: db.prepare('DELETE FROM healthMeals WHERE deletedAt IS NOT NULL'),

    // ─────────── 备份：整库导出用 ───────────
    everyFood: db.prepare('SELECT * FROM healthFoods'),
    everyMeal: db.prepare('SELECT * FROM healthMeals'),
    everyIntake: db.prepare('SELECT * FROM healthIntakes'),
    everySleep: db.prepare('SELECT * FROM healthSleeps'),
    everyFinance: db.prepare('SELECT * FROM financeEntries'),
    allFoodIds: db.prepare('SELECT id FROM healthFoods'),
    allMealIds: db.prepare('SELECT id FROM healthMeals'),
    allIntakeIds: db.prepare('SELECT id FROM healthIntakes'),
    allSleepIds: db.prepare('SELECT id FROM healthSleeps'),
    allFinanceIds: db.prepare('SELECT id FROM financeEntries'),

    // ─────────── 经济（占位） ───────────
    upsertFinance: db.prepare(
      `INSERT INTO financeEntries (id, dateKey, name, amount, note, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         dateKey = excluded.dateKey,
         name = excluded.name,
         amount = excluded.amount,
         note = excluded.note,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         deletedAt = excluded.deletedAt`,
    ),
  }

  function insertEntry(entry) {
    q.upsertEntry.run(
      entry.id,
      entry.code,
      entry.dateKey,
      entry.createdAt,
      entry.updatedAt,
      entry.content ?? '',
      imagesText(entry.images),
      entry.deletedAt ?? null,
    )
    return entryRow({ ...entry, deletedAt: entry.deletedAt ?? null })
  }

  function insertStamp(stamp) {
    q.upsertStamp.run(
      stamp.id,
      stamp.code ?? '',
      stamp.dateKey,
      stamp.time,
      stamp.content ?? '',
      imagesText(stamp.images),
      stamp.createdAt,
      stamp.updatedAt,
      stamp.deletedAt ?? null,
    )
    return stampRow({ ...stamp, deletedAt: stamp.deletedAt ?? null })
  }

  function savePreset(preset) {
    q.upsertPreset.run(
      preset.id,
      preset.code ?? '',
      preset.kind === 'place' ? 'place' : 'person',
      preset.name,
      preset.createdAt,
      preset.updatedAt,
      preset.deletedAt ?? null,
    )
    return presetRow({ ...preset, deletedAt: preset.deletedAt ?? null })
  }

  function saveProfile(profile) {
    q.upsertProfile.run(
      'me',
      profile.sex ?? null,
      num(profile.age),
      num(profile.heightCm),
      num(profile.weightKg),
      num(profile.weightAt),
      profile.activity ?? null,
      num(profile.tdee),
      num(profile.targetKcal),
      num(profile.proteinTarget),
      profile.plan ?? '',
      profile.note ?? '',
      num(profile.weighDay),
      profile.weighTime ?? '07:00',
      JSON.stringify(Array.isArray(profile.weighIns) ? profile.weighIns : []),
      profile.idealBedtime ?? '23:00',
      profile.idealWakeTime ?? '07:00',
      profile.updatedAt ?? Date.now(),
    )
    return profileRow(q.healthProfile.get())
  }

  function saveFood(food) {
    q.upsertFood.run(
      food.id,
      food.code ?? '',
      food.name,
      num(food.kcal) ?? 0,
      num(food.protein) ?? 0,
      num(food.carbs) ?? 0,
      num(food.fat) ?? 0,
      food.servingName ?? null,
      num(food.servingGrams),
      food.photo ?? null,
      food.createdAt,
      food.updatedAt,
      food.deletedAt ?? null,
    )
    return foodRow({ ...food, deletedAt: food.deletedAt ?? null })
  }

  function saveSleep(sleep) {
    q.upsertSleep.run(
      sleep.id,
      sleep.code ?? '',
      sleep.dateKey,
      sleep.bedtime,
      sleep.wakeTime,
      num(sleep.quality),
      JSON.stringify(Array.isArray(sleep.wakeEvents) ? sleep.wakeEvents : []),
      num(sleep.wakeCount),
      num(sleep.wakeMinutes),
      sleep.note ?? '',
      num(sleep.createdAt) ?? Date.now(),
      num(sleep.updatedAt) ?? Date.now(),
      num(sleep.deletedAt),
    )
    return sleep
  }

  function insertIntake(intake) {
    const components =
      Array.isArray(intake.components) && intake.components.length > 0
        ? intake.components
        : null
    q.upsertIntake.run(
      intake.id,
      intake.code ?? '',
      intake.dateKey,
      intake.time,
      intake.foodId ?? null,
      intake.name,
      num(intake.grams) ?? 0,
      num(intake.kcal) ?? 0,
      num(intake.protein) ?? 0,
      num(intake.carbs) ?? 0,
      num(intake.fat) ?? 0,
      intake.source ?? 'manual',
      intake.mealId ?? null,
      components ? JSON.stringify(components) : null,
      num(intake.tdeeSnapshot),
      num(intake.targetKcalSnapshot),
      num(intake.proteinTargetSnapshot),
      intake.createdAt,
      intake.updatedAt,
      intake.deletedAt ?? null,
    )
    // 回显直接用入参：components 本来就是数组，不能过 componentsFromDb（那个只吃 JSON 文本）
    return {
      ...intake,
      mealId: intake.mealId ?? null,
      components,
      tdeeSnapshot: num(intake.tdeeSnapshot),
      targetKcalSnapshot: num(intake.targetKcalSnapshot),
      proteinTargetSnapshot: num(intake.proteinTargetSnapshot),
      deletedAt: intake.deletedAt ?? null,
    }
  }

  function saveMeal(meal) {
    const items = Array.isArray(meal.items) ? meal.items : []
    q.upsertMeal.run(
      meal.id,
      meal.name,
      JSON.stringify(items),
      meal.createdAt,
      meal.updatedAt,
      meal.deletedAt ?? null,
    )
    // 同上：items 是数组，mealRow 是给数据库行用的，这里直接回显入参
    return {
      ...meal,
      items,
      deletedAt: meal.deletedAt ?? null,
    }
  }

  /** 合并食物时按克数换算营养，规则和渲染进程的 healthMath 一致 */
  function macrosFor(food, grams) {
    const ratio = Math.max(0, Number(grams) || 0) / 100
    const round1 = (value) => Math.round(value * 10) / 10
    return {
      kcal: Math.round(food.kcal * ratio),
      protein: round1(food.protein * ratio),
      carbs: round1(food.carbs * ratio),
      fat: round1(food.fat * ratio),
    }
  }

  function recalcPart(part, target) {
    return {
      ...part,
      foodId: target.id,
      name: target.name,
      ...macrosFor(target, part.grams),
    }
  }

  function sumParts(parts) {
    const round1 = (value) => Math.round(value * 10) / 10
    return parts.reduce(
      (total, part) => ({
        kcal: total.kcal + part.kcal,
        protein: round1(total.protein + part.protein),
        carbs: round1(total.carbs + part.carbs),
        fat: round1(total.fat + part.fat),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    )
  }

  /**
   * 把 source 并进 target：套餐换索引，摄入换引用并按 target 当前营养重算，
   * source 进回收站。同一套餐 / 同一笔里两份都在时保留两行，只换引用。
   */
  function mergeFoods(sourceId, targetId) {
    if (sourceId === targetId) return { intakes: 0, meals: 0 }
    const source = q.foodById.get(sourceId)
    const target = q.foodById.get(targetId)
    if (!source || !target || source.deletedAt !== null || target.deletedAt !== null) {
      throw new Error('merge: food not found')
    }
    const now = Date.now()
    const meals = q.everyMeal
      .all()
      .map(mealRow)
      .filter((meal) => meal.items.some((item) => item.foodId === sourceId))
    const intakes = q.everyIntake
      .all()
      .map(intakeRow)
      .filter(
        (row) =>
          row.foodId === sourceId ||
          (row.components ?? []).some((part) => part.foodId === sourceId),
      )

    db.exec('BEGIN IMMEDIATE')
    try {
      for (const meal of meals) {
        saveMeal({
          ...meal,
          items: meal.items.map((item) =>
            item.foodId === sourceId ? { ...item, foodId: targetId } : item,
          ),
          updatedAt: now,
        })
      }
      for (const row of intakes) {
        const parts = row.components ?? []
        let next = row
        if (parts.length > 0) {
          const nextParts = parts.map((part) =>
            part.foodId === sourceId ? recalcPart(part, target) : part,
          )
          next = { ...next, components: nextParts, ...sumParts(nextParts), updatedAt: now }
        }
        if (row.foodId === sourceId) {
          next =
            parts.length > 0
              ? { ...next, foodId: targetId, updatedAt: now }
              : {
                  ...next,
                  foodId: targetId,
                  name: target.name,
                  ...macrosFor(target, row.grams),
                  updatedAt: now,
                }
        }
        insertIntake(next)
      }
      q.removeFood.run(now, sourceId)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { intakes: intakes.length, meals: meals.length }
  }

  /** 整库导出：健康、经济都带上回收站里的行 */
  function exportAll() {
    return {
      entries: q.everyEntry.all().map(entryRow),
      stamps: q.everyStamp.all().map(stampRow),
      days: q.everyDay.all().map(dayRow),
      presets: q.everyPreset.all().map(presetRow),
      profile: profileRow(q.healthProfile.get()) ?? null,
      foods: q.everyFood.all().map(foodRow),
      meals: q.everyMeal.all().map(mealRow),
      intakes: q.everyIntake.all().map(intakeRow),
      sleeps: q.everySleep.all().map(sleepRow),
      finance: q.everyFinance.all().map(financeRow),
    }
  }

  /**
   * 分块导入：只写传进来的块，三块在一个事务里。
   * 覆盖数按导入前这个 id（或这一天）在不在库里算。
   * replace 为 true 时先清空本次涉及的块，再写回（快照替换）。
   */
  function writeSections(data, replace = false) {
    const diary = data && typeof data === 'object' ? data.diary : null
    const health = data && typeof data === 'object' ? data.health : null
    const finance = data && typeof data === 'object' ? data.finance : null

    const entries = Array.isArray(diary && diary.entries) ? diary.entries : []
    const stamps = Array.isArray(diary && diary.stamps) ? diary.stamps : []
    const days = Array.isArray(diary && diary.days) ? diary.days : []
    const presets = Array.isArray(diary && diary.presets) ? diary.presets : []
    const foods = Array.isArray(health && health.foods) ? health.foods : []
    const meals = Array.isArray(health && health.meals) ? health.meals : []
    const intakes = Array.isArray(health && health.intakes) ? health.intakes : []
    const sleeps = Array.isArray(health && health.sleeps) ? health.sleeps : []
    const finances = Array.isArray(finance && finance.entries) ? finance.entries : []
    const profile = health && health.profile ? health.profile : null

    const oldEntries = replace ? new Set() : new Set(q.allEntryIds.all().map((row) => row.id))
    const oldStamps = replace ? new Set() : new Set(q.allStampIds.all().map((row) => row.id))
    const oldDays = replace ? new Set() : new Set(q.allDayKeys.all().map((row) => row.dateKey))
    const oldPresets = replace ? new Set() : new Set(q.allPresetIds.all().map((row) => row.id))
    const oldFoods = replace ? new Set() : new Set(q.allFoodIds.all().map((row) => row.id))
    const oldMeals = replace ? new Set() : new Set(q.allMealIds.all().map((row) => row.id))
    const oldIntakes = replace ? new Set() : new Set(q.allIntakeIds.all().map((row) => row.id))
    const oldSleeps = replace ? new Set() : new Set(q.allSleepIds.all().map((row) => row.id))
    const oldFinance = replace ? new Set() : new Set(q.allFinanceIds.all().map((row) => row.id))
    const hadProfile = replace ? false : Boolean(q.healthProfile.get())

    db.exec('BEGIN IMMEDIATE')
    try {
      if (replace) {
        if (diary) {
          db.exec('DELETE FROM diaryEntries')
          db.exec('DELETE FROM diaryStamps')
          db.exec('DELETE FROM diaryDays')
          db.exec('DELETE FROM diaryPresets')
        }
        if (health) {
          db.exec('DELETE FROM healthProfile')
          db.exec('DELETE FROM healthFoods')
          db.exec('DELETE FROM healthMeals')
          db.exec('DELETE FROM healthIntakes')
          db.exec('DELETE FROM healthSleeps')
        }
        if (finance) db.exec('DELETE FROM financeEntries')
      }
      if (diary) {
        for (const entry of entries) {
          q.upsertEntry.run(
            entry.id,
            entry.code,
            entry.dateKey,
            entry.createdAt,
            entry.updatedAt,
            entry.content ?? '',
            imagesText(entry.images),
            entry.deletedAt ?? null,
          )
        }
        for (const stamp of stamps) {
          q.upsertStamp.run(
            stamp.id,
            stamp.code ?? '',
            stamp.dateKey,
            stamp.time,
            stamp.content ?? '',
            imagesText(stamp.images),
            stamp.createdAt,
            stamp.updatedAt,
            stamp.deletedAt ?? null,
          )
        }
        for (const day of days) {
          q.upsertDay.run(day.dateKey, day.weather ?? null, day.updatedAt)
        }
        for (const preset of presets) savePreset(preset)
      }
      if (health) {
        // 先档案，再食物、套餐、摄入：套餐引用食物，摄入引用套餐，顺序不能反
        if (profile) saveProfile(profile)
        for (const food of foods) saveFood(food)
        for (const meal of meals) saveMeal(meal)
        for (const intake of intakes) insertIntake(intake)
        for (const sleep of sleeps) saveSleep(sleep)
      }
      if (finance) {
        for (const item of finances) {
          q.upsertFinance.run(
            item.id,
            item.dateKey,
            item.name ?? '',
            num(item.amount) ?? 0,
            item.note ?? '',
            item.createdAt,
            item.updatedAt,
            item.deletedAt ?? null,
          )
        }
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    return {
      entries: { total: entries.length, overwritten: entries.filter((item) => oldEntries.has(item.id)).length },
      stamps: { total: stamps.length, overwritten: stamps.filter((item) => oldStamps.has(item.id)).length },
      days: { total: days.length, overwritten: days.filter((item) => oldDays.has(item.dateKey)).length },
      presets: { total: presets.length, overwritten: presets.filter((item) => oldPresets.has(item.id)).length },
      profile: { total: profile ? 1 : 0, overwritten: profile && hadProfile ? 1 : 0 },
      foods: { total: foods.length, overwritten: foods.filter((item) => oldFoods.has(item.id)).length },
      meals: { total: meals.length, overwritten: meals.filter((item) => oldMeals.has(item.id)).length },
      intakes: { total: intakes.length, overwritten: intakes.filter((item) => oldIntakes.has(item.id)).length },
      sleeps: { total: sleeps.length, overwritten: sleeps.filter((item) => oldSleeps.has(item.id)).length },
      finance: { total: finances.length, overwritten: finances.filter((item) => oldFinance.has(item.id)).length },
    }
  }

  /** ids 为空时直接返回 0：SQLite 的 IN () 是语法错误 */
  function modifyEntries(ids, setClause, values) {
    if (!Array.isArray(ids) || ids.length === 0) return 0
    const sql = `UPDATE diaryEntries SET ${setClause} WHERE id IN (${marks(ids.length)})`
    return Number(db.prepare(sql).run(...values, ...ids).changes)
  }

  function modifyStamps(ids, setClause, values) {
    if (!Array.isArray(ids) || ids.length === 0) return 0
    const sql = `UPDATE diaryStamps SET ${setClause} WHERE id IN (${marks(ids.length)})`
    return Number(db.prepare(sql).run(...values, ...ids).changes)
  }

  /** 健康三张表的批量软删 / 恢复；表名只由本文件传入 */
  function modifyHealthRows(table, ids, setClause, values) {
    if (!Array.isArray(ids) || ids.length === 0) return 0
    const sql = `UPDATE ${table} SET ${setClause} WHERE id IN (${marks(ids.length)})`
    return Number(db.prepare(sql).run(...values, ...ids).changes)
  }

  /** 一键清空整块：一个事务里删完，失败回滚；表名只由本文件传入 */
  function runClear(tables) {
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const table of tables) db.exec(`DELETE FROM ${table}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  /** 安全清空整块：统一软删进回收站，只动还没进回收站的记录 */
  function runTrash(tables) {
    const now = Date.now()
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const table of tables) {
        db.prepare(`UPDATE ${table} SET deletedAt = ? WHERE deletedAt IS NULL`).run(now)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function updateStamp(id, patch) {
    const sets = ['updatedAt = ?']
    const values = [Date.now()]
    // 只认时间、正文、图片这三样，别的一律忽略（渲染进程传来的对象不可全信）
    if (typeof patch?.time === 'string') {
      sets.push('time = ?')
      values.push(patch.time)
    }
    if (typeof patch?.content === 'string') {
      sets.push('content = ?')
      values.push(patch.content)
    }
    if (Array.isArray(patch?.images)) {
      sets.push('images = ?')
      values.push(imagesText(patch.images))
    }
    values.push(id)
    db.prepare(`UPDATE diaryStamps SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  const METHODS = {
    // ─────────── 日记 ───────────
    entriesOfDay: (dateKey) => q.entriesOfDay.all(dateKey).map(entryRow),
    entryByCode: (code) => entryRow(q.entryByCode.get(code)),
    insertEntry,
    updateContent: (id, content, images) => {
      q.updateContent.run(String(content ?? ''), imagesText(images), Date.now(), id)
    },
    removeEntry: (id) => {
      q.removeEntry.run(Date.now(), id)
    },
    removeEntries: (ids) => modifyEntries(ids, 'deletedAt = ?', [Date.now()]),
    restoreEntry: (id) => {
      q.restoreEntry.run(id)
    },
    restoreEntries: (ids) => modifyEntries(ids, 'deletedAt = NULL', []),
    moveEntries: (ids, dateKey) =>
      modifyEntries(ids, 'dateKey = ?, updatedAt = ?', [dateKey, Date.now()]),

    // ─────────── 某天的信息 ───────────
    dayInfo: (dateKey) => dayRow(q.dayInfo.get(dateKey)),
    setWeather: (dateKey, weather) => {
      q.upsertDay.run(dateKey, weather ?? null, Date.now())
    },

    // ─────────── 随记 ───────────
    stampsOfDay: (dateKey) => q.stampsOfDay.all(dateKey).map(stampRow),
    insertStamp,
    updateStamp,
    removeStamp: (id) => {
      q.removeStamp.run(Date.now(), id)
    },
    restoreStamp: (id) => {
      q.restoreStamp.run(id)
    },
    removeStamps: (ids) => modifyStamps(ids, 'deletedAt = ?', [Date.now()]),
    restoreStamps: (ids) => modifyStamps(ids, 'deletedAt = NULL', []),
    moveStamps: (ids, dateKey) =>
      modifyStamps(ids, 'dateKey = ?, updatedAt = ?', [dateKey, Date.now()]),

    // ─────────── 预设库 ───────────
    diaryPresets: () => q.diaryPresets.all().map(presetRow),
    trashedDiaryPresets: () => q.trashedPresets.all().map(presetRow),
    saveDiaryPreset: (preset) => savePreset(preset),
    removeDiaryPreset: (id) => {
      q.removePreset.run(Date.now(), id)
    },
    removeDiaryPresets: (ids) =>
      modifyHealthRows('diaryPresets', ids, 'deletedAt = ?', [Date.now()]),
    restoreDiaryPreset: (id) => {
      q.restorePreset.run(id)
    },
    restoreDiaryPresets: (ids) => modifyHealthRows('diaryPresets', ids, 'deletedAt = NULL', []),
    purgeDiaryPreset: (id) => {
      q.purgePreset.run(id)
    },
    purgeTrashedDiaryPresets: () => {
      q.purgeTrashedPresets.run()
    },

    // ─────────── 回收站 ───────────
    trashedEntries: () => q.trashedEntries.all().map(entryRow),
    trashedStamps: () => q.trashedStamps.all().map(stampRow),
    purgeEntry: (id) => {
      q.purgeEntry.run(id)
    },
    purgeStamp: (id) => {
      q.purgeStamp.run(id)
    },
    purgeEntries: (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return 0
      const result = db
        .prepare(`DELETE FROM diaryEntries WHERE id IN (${marks(ids.length)})`)
        .run(...ids)
      return Number(result.changes)
    },
    purgeStamps: (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return 0
      const result = db
        .prepare(`DELETE FROM diaryStamps WHERE id IN (${marks(ids.length)})`)
        .run(...ids)
      return Number(result.changes)
    },
    purgeTrashedEntries: () => {
      const result = db.prepare('DELETE FROM diaryEntries WHERE deletedAt IS NOT NULL').run()
      return Number(result.changes)
    },
    purgeTrashedStamps: () => {
      const result = db.prepare('DELETE FROM diaryStamps WHERE deletedAt IS NOT NULL').run()
      return Number(result.changes)
    },

    // ─────────── 备份 ───────────
    everyEntry: () => q.everyEntry.all().map(entryRow),
    everyStamp: () => q.everyStamp.all().map(stampRow),
    everyDay: () => q.everyDay.all().map(dayRow),
    totals: () => ({
      entries: Number(q.countEntries.get().n),
      stamps: Number(q.countStamps.get().n),
      foods: Number(q.countFoods.get().n),
      meals: Number(q.countMeals.get().n),
      intakes: Number(q.countIntakes.get().n),
    }),
    exportAllData: () => exportAll(),
    importSections: (data) => writeSections(data),
    replaceSections: (data) => writeSections(data, true),
    importBackup: (data) => writeSections({ diary: data }),
    clearDiaryData: () =>
      runClear(['diaryEntries', 'diaryStamps', 'diaryDays', 'diaryPresets']),
    clearHealthData: () =>
      runClear(['healthProfile', 'healthFoods', 'healthMeals', 'healthIntakes', 'healthSleeps']),
    clearFinanceData: () => runClear(['financeEntries']),
    trashDiaryData: () => runTrash(['diaryEntries', 'diaryStamps', 'diaryPresets']),
    trashHealthData: () => runTrash(['healthFoods', 'healthMeals', 'healthIntakes', 'healthSleeps']),
    trashFinanceData: () => runTrash(['financeEntries']),

    // ─────────── 健康 ───────────
    healthProfile: () => profileRow(q.healthProfile.get()),
    saveHealthProfile: (profile) => saveProfile(profile),
    healthFoods: () => q.healthFoods.all().map(foodRow),
    saveHealthFood: (food) => saveFood(food),
    mergeHealthFoods: (sourceId, targetId) => mergeFoods(sourceId, targetId),
    removeHealthFood: (id) => {
      q.removeFood.run(Date.now(), id)
    },
    removeHealthFoods: (ids) =>
      modifyHealthRows('healthFoods', ids, 'deletedAt = ?', [Date.now()]),
    trashedHealthFoods: () => q.trashedFoods.all().map(foodRow),
    restoreHealthFood: (id) => {
      q.restoreFood.run(id)
    },
    restoreHealthFoods: (ids) => modifyHealthRows('healthFoods', ids, 'deletedAt = NULL', []),
    purgeHealthFood: (id) => {
      q.purgeFood.run(id)
    },
    purgeTrashedHealthFoods: () => {
      q.purgeTrashedFoods.run()
    },
    intakesOfDay: (dateKey) => q.intakesOfDay.all(dateKey).map(intakeRow),
    intakeDays: () => q.intakeDays.all().map((row) => row.dateKey),
    insertIntake,
    removeIntake: (id) => {
      q.removeIntake.run(Date.now(), id)
    },
    removeIntakes: (ids) =>
      modifyHealthRows('healthIntakes', ids, 'deletedAt = ?', [Date.now()]),
    restoreIntake: (id) => {
      q.restoreIntake.run(id)
    },
    restoreIntakes: (ids) => modifyHealthRows('healthIntakes', ids, 'deletedAt = NULL', []),
    trashedIntakes: () => q.trashedIntakes.all().map(intakeRow),
    purgeIntake: (id) => {
      q.purgeIntake.run(id)
    },
    purgeTrashedIntakes: () => {
      q.purgeTrashedIntakes.run()
    },
    sleepOfDay: (dateKey) => sleepRow(q.sleepOfDay.get(dateKey)),
    sleepDays: () => q.sleepDays.all().map((row) => row.dateKey),
    saveHealthSleep: (sleep) => saveSleep(sleep),
    removeHealthSleep: (id) => {
      q.removeSleep.run(Date.now(), id)
    },
    restoreHealthSleep: (id) => {
      q.restoreSleep.run(id)
    },
    trashedHealthSleeps: () => q.trashedSleeps.all().map(sleepRow),
    purgeHealthSleep: (id) => {
      q.purgeSleep.run(id)
    },
    purgeTrashedHealthSleeps: () => {
      q.purgeTrashedSleeps.run()
    },
    healthMeals: () => q.healthMeals.all().map(mealRow),
    saveHealthMeal: (meal) => saveMeal(meal),
    removeHealthMeal: (id) => {
      q.removeMeal.run(Date.now(), id)
    },
    removeHealthMeals: (ids) =>
      modifyHealthRows('healthMeals', ids, 'deletedAt = ?', [Date.now()]),
    trashedHealthMeals: () => q.trashedMeals.all().map(mealRow),
    restoreHealthMeal: (id) => {
      q.restoreMeal.run(id)
    },
    restoreHealthMeals: (ids) => modifyHealthRows('healthMeals', ids, 'deletedAt = NULL', []),
    purgeHealthMeal: (id) => {
      q.purgeMeal.run(id)
    },
    purgeTrashedHealthMeals: () => {
      q.purgeTrashedMeals.run()
    },
  }

  return {
    file,
    /** 渲染进程的唯一入口；方法名必须是 METHODS 自己的键 */
    call(method, args) {
      if (typeof method !== 'string' || !Object.prototype.hasOwnProperty.call(METHODS, method)) {
        throw new Error(`unknown database method: ${String(method)}`)
      }
      return METHODS[method](...(Array.isArray(args) ? args : []))
    },
    close() {
      db.close()
    },
  }
}

module.exports = { createDatabase }
