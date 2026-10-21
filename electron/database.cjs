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
    dateKey TEXT NOT NULL,
    time TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_stamps_day ON diaryStamps(dateKey, time);
  CREATE INDEX IF NOT EXISTS idx_stamps_trash ON diaryStamps(deletedAt);
`

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
    dateKey: row.dateKey,
    time: row.time,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/** 批量 IN 查询的占位符；空数组由调用方提前挡掉，SQLite 不接受 IN () */
function marks(count) {
  return Array.from({ length: count }, () => '?').join(',')
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
  db.exec('PRAGMA user_version = 1')

  const q = {
    entriesOfDay: db.prepare(
      'SELECT * FROM diaryEntries WHERE dateKey = ? AND deletedAt IS NULL ORDER BY createdAt ASC',
    ),
    entryByCode: db.prepare('SELECT * FROM diaryEntries WHERE code = ? LIMIT 1'),
    updateContent: db.prepare('UPDATE diaryEntries SET content = ?, updatedAt = ? WHERE id = ?'),
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
    countEntries: db.prepare('SELECT COUNT(*) AS n FROM diaryEntries'),
    countStamps: db.prepare('SELECT COUNT(*) AS n FROM diaryStamps'),
    allEntryIds: db.prepare('SELECT id FROM diaryEntries'),
    allStampIds: db.prepare('SELECT id FROM diaryStamps'),
    allDayKeys: db.prepare('SELECT dateKey FROM diaryDays'),
    upsertEntry: db.prepare(
      `INSERT INTO diaryEntries (id, code, dateKey, createdAt, updatedAt, content, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         dateKey = excluded.dateKey,
         createdAt = excluded.createdAt,
         updatedAt = excluded.updatedAt,
         content = excluded.content,
         deletedAt = excluded.deletedAt`,
    ),
    upsertStamp: db.prepare(
      `INSERT INTO diaryStamps (id, dateKey, time, content, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         dateKey = excluded.dateKey,
         time = excluded.time,
         content = excluded.content,
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
      entry.deletedAt ?? null,
    )
    return entryRow({ ...entry, deletedAt: entry.deletedAt ?? null })
  }

  function insertStamp(stamp) {
    q.upsertStamp.run(
      stamp.id,
      stamp.dateKey,
      stamp.time,
      stamp.content ?? '',
      stamp.createdAt,
      stamp.updatedAt,
      stamp.deletedAt ?? null,
    )
    return stampRow({ ...stamp, deletedAt: stamp.deletedAt ?? null })
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

  function updateStamp(id, patch) {
    const sets = ['updatedAt = ?']
    const values = [Date.now()]
    // 只认这两个字段，别的一律忽略（渲染进程传来的对象不可全信）
    if (typeof patch?.time === 'string') {
      sets.push('time = ?')
      values.push(patch.time)
    }
    if (typeof patch?.content === 'string') {
      sets.push('content = ?')
      values.push(patch.content)
    }
    values.push(id)
    db.prepare(`UPDATE diaryStamps SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  const METHODS = {
    // ─────────── 日记 ───────────
    entriesOfDay: (dateKey) => q.entriesOfDay.all(dateKey).map(entryRow),
    entryByCode: (code) => entryRow(q.entryByCode.get(code)),
    insertEntry,
    updateContent: (id, content) => {
      q.updateContent.run(String(content ?? ''), Date.now(), id)
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
    }),
    importBackup: (data) => {
      const entries = Array.isArray(data?.entries) ? data.entries : []
      const stamps = Array.isArray(data?.stamps) ? data.stamps : []
      const days = Array.isArray(data?.days) ? data.days : []

      // 覆盖数 = 导入前库里已经有的条数
      const oldEntries = new Set(q.allEntryIds.all().map((row) => row.id))
      const oldStamps = new Set(q.allStampIds.all().map((row) => row.id))
      const oldDays = new Set(q.allDayKeys.all().map((row) => row.dateKey))

      db.exec('BEGIN IMMEDIATE')
      try {
        for (const entry of entries) {
          q.upsertEntry.run(
            entry.id,
            entry.code,
            entry.dateKey,
            entry.createdAt,
            entry.updatedAt,
            entry.content ?? '',
            entry.deletedAt ?? null,
          )
        }
        for (const stamp of stamps) {
          q.upsertStamp.run(
            stamp.id,
            stamp.dateKey,
            stamp.time,
            stamp.content ?? '',
            stamp.createdAt,
            stamp.updatedAt,
            stamp.deletedAt ?? null,
          )
        }
        for (const day of days) {
          q.upsertDay.run(day.dateKey, day.weather ?? null, day.updatedAt)
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
      }
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
