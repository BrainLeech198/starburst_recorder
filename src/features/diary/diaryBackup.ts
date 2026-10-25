/**
 * 全量备份文件的形状与校验。
 *
 * 为什么单独定一个形状，而不是复用日记页那份「导出选中」的 JSON：
 *   - 备份必须带上天气（diaryDays）。日记页那份是按天拼给人和 AI 看的，本来就没有天气这一块，
 *     拿它当备份恢复出来会丢天气。
 *   - 备份要能自证身份：带 app 标记和版本号，才能对用户说清「这份文件不是星芒记录者导出的」。
 *   - 备份要把回收站里的东西也带上（deletedAt 原样保留），删掉的东西也是你的数据。
 *
 * v2 起按「日记 / 健康 / 经济」分块：导出时只写勾选的块，导入时只写勾选的块。
 * v1 是扁平结构（只有日记），读到时自动当成 diary 一块，老备份仍能恢复。
 *
 * 校验刻意宽容：坏条目单独剔掉并报数，而不是整份拒绝——
 * 不该因为你备份里有一条脏数据，就让你丢掉整个备份。
 */
import type {
  DiaryDay,
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
} from '@/core/db/schema'
import {
  pickDay,
  pickEntry,
  pickFinance,
  pickFood,
  pickIntake,
  pickMeal,
  pickPreset,
  pickProfile,
  pickStamp,
  rows,
  bag,
} from '@/core/db/normalize'
import type { ExportFile } from './diaryExport'

const BACKUP_APP = 'starburst-recorder'

/**
 * 备份里其实有两个版本号，职责不同：
 *
 * - version：**文件摆法**的版本。1 是扁平的（entries / stamps / days 直接放顶层），
 *   2 起收进 sections 里。以后再动整体结构才升它。
 * - schemaVersion：**每行长什么样**的版本。加字段、改字段含义才升它。
 *   行级校验在 core/db/normalize.ts，旧版本的行会先在那儿补齐再进库，
 *   所以读旧备份永远不需要写一堆 if（version < 3）。
 *
 * 兼容口径（写给以后改这里的人）：
 *   - 读：不看版本号，只看字段。缺的补默认、坏的丢行、多的忽略。
 *   - 写：永远写最新形状，并把两个版本号都带上，方便以后定位。
 *   - 于是「新应用读旧备份」不需要代码，「旧应用读新备份」也不至于整份读不出来。
 */
const BACKUP_VERSION = 2
const SCHEMA_VERSION = 1

/** 备份里的三块：日记、健康、经济 */
export type BackupSection = 'diary' | 'health' | 'finance'

export const ALL_SECTIONS: BackupSection[] = ['diary', 'health', 'finance']

export interface BackupPayload {
  entries: DiaryEntry[]
  stamps: DiaryStamp[]
  days: DiaryDay[]
  /** 预设库（常用人物 / 地名），跟着日记块走 */
  presets: DiaryPreset[]
  profile: HealthProfile | null
  foods: HealthFood[]
  meals: HealthMeal[]
  intakes: HealthIntake[]
  finance: FinanceEntry[]
}

export function emptyPayload(): BackupPayload {
  return {
    entries: [],
    stamps: [],
    days: [],
    presets: [],
    profile: null,
    foods: [],
    meals: [],
    intakes: [],
    finance: [],
  }
}

/** 只保留选中块的内容；没选的块清空，导出和快照都靠它 */
export function onlySections(payload: BackupPayload, sections: BackupSection[]): BackupPayload {
  const keep = new Set(sections)
  return {
    entries: keep.has('diary') ? payload.entries : [],
    stamps: keep.has('diary') ? payload.stamps : [],
    days: keep.has('diary') ? payload.days : [],
    presets: keep.has('diary') ? payload.presets : [],
    profile: keep.has('health') ? payload.profile : null,
    foods: keep.has('health') ? payload.foods : [],
    meals: keep.has('health') ? payload.meals : [],
    intakes: keep.has('health') ? payload.intakes : [],
    finance: keep.has('finance') ? payload.finance : [],
  }
}

/** 某一块里有多少东西，导出/导入的选择框上显示 */
export function sectionSize(payload: BackupPayload, section: BackupSection): number {
  if (section === 'diary')
    return (
      payload.entries.length +
      payload.stamps.length +
      payload.days.length +
      payload.presets.length
    )
  if (section === 'health') {
    return (
      (payload.profile ? 1 : 0) +
      payload.foods.length +
      payload.meals.length +
      payload.intakes.length
    )
  }
  return payload.finance.length
}

/** 文件里实际有内容的块 */
export function sectionsOf(payload: BackupPayload): BackupSection[] {
  return ALL_SECTIONS.filter((section) => sectionSize(payload, section) > 0)
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 打成一份可以下载的备份文件。导入前自动存的那份用 kind 区分文件名，免得和手动导出的混在一起 */
export function buildBackup(
  payload: BackupPayload,
  kind = '备份',
  sections: BackupSection[] = ALL_SECTIONS,
): ExportFile {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`
  const data = onlySections(payload, sections)
  const keep = new Set(sections)
  return {
    label: '备份 JSON',
    filename: `星芒记录者-${kind}-${stamp}.json`,
    mime: 'application/json',
    content: JSON.stringify(
      {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: now.toISOString(),
        sections: {
          ...(keep.has('diary')
            ? {
                diary: {
                  entries: data.entries,
                  stamps: data.stamps,
                  days: data.days,
                  presets: data.presets,
                },
              }
            : {}),
          ...(keep.has('health')
            ? {
                health: {
                  profile: data.profile,
                  foods: data.foods,
                  meals: data.meals,
                  intakes: data.intakes,
                },
              }
            : {}),
          ...(keep.has('finance') ? { finance: { entries: data.finance } } : {}),
        },
      },
      null,
      2,
    ),
  }
}

export interface BackupReadResult {
  ok: boolean
  /** 读不出来时的人话解释 */
  error: string
  payload: BackupPayload
  /** 文件里实际有内容的块，导入时要让用户勾选 */
  sections: BackupSection[]
  /** 格式不对、被剔掉的条数 */
  skipped: number
}

function fail(error: string): BackupReadResult {
  return { ok: false, error, payload: emptyPayload(), sections: [], skipped: 0 }
}

/** 读一份备份文本，校验并挑出可用的数据 */
export function readBackup(text: string): BackupReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('这个文件不是 JSON，或者内容已经坏了。请选星芒记录者导出的 .json 备份文件。')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('这个文件的内容不是一份备份。请选星芒记录者导出的 .json 备份文件。')
  }

  const root = raw as Record<string, unknown>
  // v1 是扁平的（entries / stamps / days），v2 起都在 sections 里
  const sectionsBag = bag(root.sections)
  const legacy = Object.keys(sectionsBag).length === 0
  const diaryBag = legacy ? root : bag(sectionsBag.diary)
  const healthBag = legacy ? {} : bag(sectionsBag.health)
  const financeBag = legacy ? {} : bag(sectionsBag.finance)

  const rawEntries = rows(diaryBag.entries)
  const rawStamps = rows(diaryBag.stamps)
  const rawDays = rows(diaryBag.days)
  const rawPresets = rows(diaryBag.presets)
  const rawFoods = rows(healthBag.foods)
  const rawMeals = rows(healthBag.meals)
  const rawIntakes = rows(healthBag.intakes)
  const rawFinance = rows(financeBag.entries)

  const entries = rawEntries.map(pickEntry).filter((item): item is DiaryEntry => item !== null)
  const stamps = rawStamps.map(pickStamp).filter((item): item is DiaryStamp => item !== null)
  const days = rawDays.map(pickDay).filter((item): item is DiaryDay => item !== null)
  const presets = rawPresets
    .map(pickPreset)
    .filter((item): item is DiaryPreset => item !== null)
  const profile = pickProfile(healthBag.profile)
  const foods = rawFoods.map(pickFood).filter((item): item is HealthFood => item !== null)
  const meals = rawMeals.map(pickMeal).filter((item): item is HealthMeal => item !== null)
  const intakes = rawIntakes.map(pickIntake).filter((item): item is HealthIntake => item !== null)
  const finance = rawFinance
    .map(pickFinance)
    .filter((item): item is FinanceEntry => item !== null)

  const payload: BackupPayload = {
    entries,
    stamps,
    days,
    presets,
    profile,
    foods,
    meals,
    intakes,
    finance,
  }

  const present = sectionsOf(payload)
  if (present.length === 0) {
    return fail('这份文件里没有任何能认出来的数据，可能不是星芒记录者导出的备份。')
  }

  const rawTotal =
    rawEntries.length +
    rawStamps.length +
    rawDays.length +
    rawPresets.length +
    rawFoods.length +
    rawMeals.length +
    rawIntakes.length +
    rawFinance.length +
    (healthBag.profile ? 1 : 0)
  const keptTotal =
    entries.length + stamps.length + days.length + presets.length + foods.length + meals.length + intakes.length + finance.length + (profile ? 1 : 0)

  return {
    ok: true,
    error: '',
    payload,
    sections: present,
    skipped: Math.max(0, rawTotal - keptTotal),
  }
}
