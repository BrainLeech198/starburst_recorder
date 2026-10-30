/**
 * 记录级 JSON 的导入：读回「单条导出 / 挑选记录导出」生成的文件（kind: 'records'）。
 *
 * 和 diaryBackup.readBackup 的分工：
 *   - readBackup 认整库备份（sections 结构 / v1 扁平日记），走设置页的合并 / 替换流程；
 *   - 这里认记录导出——各类记录数组直接放顶层，外加 weights（它们平时住在身体档案里）。
 *
 * 合并口径：同 id 覆盖；睡眠、称重额外按「同一天覆盖」对齐——
 * 从别的设备导回来的记录 id 不一样，靠 dateKey 对齐才不会在同一天挂两行。
 * 校验刻意宽容，跟备份一个口径：坏行剔掉报数，不整份拒绝。
 */
import type {
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
  HealthProfile,
  HealthSleep,
  WeighIn,
} from '@/core/db/schema'
import {
  pickEntry,
  pickFinance,
  pickIntake,
  pickSleep,
  pickStamp,
  pickWeighIns,
  rows,
} from '@/core/db/normalize'
import type { BackupSections, ImportStats } from '@/core/db/store'
import { zeroStats } from '@/core/db/store'
import type { RecordKind } from './recordExport'
import { emptyProfile } from '@/features/health/healthMath'

/**
 * store 在用的时候才动态取：模块顶层不碰 IndexedDB，
 * 这样纯解析部分（readRecordsFile 等）在 Node 单测里也能 import。
 */
async function importSections(sections: BackupSections): Promise<ImportStats> {
  const { store } = await import('@/core/db')
  return store.importSections(sections)
}

async function exportAllData() {
  const { store } = await import('@/core/db')
  return store.exportAllData()
}

/** 一份记录导出文件里认出来的全部内容；没包含的种类是空数组 */
export interface RecordsFile {
  entries: DiaryEntry[]
  stamps: DiaryStamp[]
  intakes: HealthIntake[]
  sleeps: HealthSleep[]
  weights: WeighIn[]
  finance: FinanceEntry[]
}

export type RecordsRead =
  | { ok: true; file: RecordsFile; skipped: number }
  | { ok: false; error: string }

/** 只看不解析记录：给设置页用来分流「这是记录导出还是整库备份」 */
export function isRecordsFile(text: string): boolean {
  try {
    const root = JSON.parse(text) as unknown
    if (!root || typeof root !== 'object') return false
    const meta = root as Record<string, unknown>
    return meta.app === 'starburst-recorder' && meta.kind === 'records'
  } catch {
    return false
  }
}

export function readRecordsFile(text: string): RecordsRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'not-records' }
  const root = parsed as Record<string, unknown>
  if (root.app !== 'starburst-recorder' || root.kind !== 'records') {
    return { ok: false, error: 'not-records' }
  }

  const skipped = { n: 0 }
  const collect = <T>(value: unknown, pick: (raw: unknown) => T | null): T[] =>
    rows(value)
      .map((raw) => {
        const picked = pick(raw)
        if (picked === null) skipped.n += 1
        return picked
      })
      .filter((item): item is T => item !== null)

  // 称重行的解析走 pickWeighIns：它顺手做排序去重，不过它没有坏行计数，这里自己数
  const rawWeights = rows(root.weights)
  const weights = pickWeighIns(rawWeights)
  skipped.n += rawWeights.length - weights.length

  // 先把各数组挑完再组装返回值：skipped 在 collect 里累加，先写进对象会丢计数
  const file: RecordsFile = {
    entries: collect(root.entries, pickEntry),
    stamps: collect(root.stamps, pickStamp),
    intakes: collect(root.intakes, pickIntake),
    sleeps: collect(root.sleeps, pickSleep),
    weights,
    finance: collect(root.finance, pickFinance),
  }
  return { ok: true, skipped: skipped.n, file }
}

export interface RecordsImportResult {
  /** importSections 的原始统计，设置页汇总用 */
  stats: ImportStats
  /** 睡眠按「同 id 或同一天」算的覆盖数，比按 id 准 */
  sleeps: { total: number; overwritten: number }
  weights: { total: number; overwritten: number }
}

/**
 * 把记录文件并进去。kinds 限定这次认哪几种：
 * 记录页只导自己那类，设置页全导。没选中的种类原样忽略。
 */
export async function importRecords(
  file: RecordsFile,
  kinds: RecordKind[],
): Promise<RecordsImportResult> {
  const want = new Set(kinds)
  const local = await exportAllData()

  // 睡眠按天对齐：同一天已有记录就借它的 id，导入变成覆盖而不是并列两行
  let sleeps: HealthSleep[] = []
  let sleepsOverwritten = 0
  if (want.has('sleep') && file.sleeps.length > 0) {
    const byDay = new Map(
      local.sleeps.filter((item) => !item.deletedAt).map((item) => [item.dateKey, item]),
    )
    const seenDays = new Set<string>()
    sleeps = []
    for (const sleep of file.sleeps) {
      if (seenDays.has(sleep.dateKey)) continue
      seenDays.add(sleep.dateKey)
      const sameDay = byDay.get(sleep.dateKey)
      if (sameDay) {
        sleepsOverwritten += 1
        sleeps.push(sameDay.id === sleep.id ? sleep : { ...sleep, id: sameDay.id })
      } else {
        sleeps.push(sleep)
      }
    }
  }

  // 称重住在身体档案里：按天并进现有档案；还没建过档案就垫一份最简的
  let profile: HealthProfile | null = null
  let weights: WeighIn[] = []
  let weightsOverwritten = 0
  if (want.has('weight') && file.weights.length > 0) {
    const current = local.profile ?? null
    const existing = current?.weighIns ?? []
    const existingDays = new Set(existing.map((item) => item.dateKey))
    weightsOverwritten = file.weights.filter((item) => existingDays.has(item.dateKey)).length
    const merged = new Map(existing.map((item) => [item.dateKey, item] as const))
    for (const item of file.weights) merged.set(item.dateKey, item)
    // pickWeighIns 的形状约束（新的在前、最多 120 条）在合并后也要守住
    weights = pickWeighIns([...merged.values()])
    const base = current ?? emptyProfile()
    profile = {
      ...base,
      weighIns: weights,
      weightKg: weights[0]?.weightKg ?? null,
      weightAt: weights[0] ? Date.now() : null,
      updatedAt: Date.now(),
    }
  }

  const entries = want.has('diary') ? file.entries : []
  const stamps = want.has('stamp') ? file.stamps : []
  const intakes = want.has('intake') ? file.intakes : []
  const finance = want.has('finance') ? file.finance : []

  const sections: BackupSections = {}
  if (entries.length > 0 || stamps.length > 0) {
    // 记录导出里没有 days / presets，这两个字段空着就行
    sections.diary = { entries, stamps, days: [], presets: [] }
  }
  if (intakes.length > 0 || sleeps.length > 0 || profile) {
    sections.health = { profile, foods: [], meals: [], intakes, sleeps }
  }
  if (finance.length > 0) sections.finance = { entries: finance }

  const stats =
    sections.diary || sections.health || sections.finance
      ? await importSections(sections)
      : null

  return {
    stats: stats ?? zeroStats(),
    sleeps: { total: sleeps.length, overwritten: sleepsOverwritten },
    weights: { total: weights.length, overwritten: weightsOverwritten },
  }
}

/** 这份文件里有没有指定种类的记录（页面用它决定报「没有可导入内容」还是真的导） */
export function recordsCount(file: RecordsFile, kinds: RecordKind[]): number {
  let n = 0
  for (const kind of kinds) {
    if (kind === 'diary') n += file.entries.length
    else if (kind === 'stamp') n += file.stamps.length
    else if (kind === 'intake') n += file.intakes.length
    else if (kind === 'sleep') n += file.sleeps.length
    else if (kind === 'weight') n += file.weights.length
    else if (kind === 'finance') n += file.finance.length
  }
  return n
}
