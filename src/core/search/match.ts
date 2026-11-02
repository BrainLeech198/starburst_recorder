/**
 * 全局搜索的匹配规则（纯函数）。
 *
 * 浏览器 / 安卓走 Dexie，桌面走主进程的 SQLite。桌面那份读得到这张表之外的
 * 东西，但 require 不了 TypeScript，所以在 `electron/database.cjs` 里照同样的
 * 规则写了一遍；`src/core/db/desktopSearch.test.ts` 拿同一批数据比对两边，
 * 谁改跑了立刻看得出来。
 *
 * 规则：
 * - 回收站里的记录（deletedAt 非空）一律不算，调用方不用先过滤。
 * - 关键词以 `#` 开头只按标签筛，且标签是精确匹配（`#工作` 不该带出「工作台」）。
 * - 其余按各组的文本字段做子串匹配，忽略大小写；标签也一起看。
 * - 收支的分类在库里只存 id，翻译由调用方做完再以 `categoryIds` 传进来，
 *   这里只把 id 当成一个值精确比对——搜正文搜不到分类名，是以前的问题。
 */
import type {
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthSleep,
  HealthTraining,
  ScheduleItem,
} from '@/core/db/schema'
import type { SearchResults } from '@/core/db/store'

/** 一次搜索要过的十张表 */
export interface SearchInput {
  entries: DiaryEntry[]
  stamps: DiaryStamp[]
  finance: FinanceEntry[]
  sleeps: HealthSleep[]
  intakes: HealthIntake[]
  foods: HealthFood[]
  meals: HealthMeal[]
  trainings: HealthTraining[]
  schedules: ScheduleItem[]
  presets: DiaryPreset[]
}

/** 结果还没回来时的空壳，页面用它兜底 */
export function emptySearchResults(): SearchResults {
  return {
    entries: [],
    stamps: [],
    finance: [],
    sleeps: [],
    intakes: [],
    trainings: [],
    schedules: [],
    foods: [],
    meals: [],
    presets: [],
    tags: [],
  }
}

type Row = { deletedAt: number | null }

/** 空关键词时也要回标签条，所以先各自过滤再判空 */
function live<T extends Row>(rows: T[]): T[] {
  return rows.filter((row) => row.deletedAt === null)
}

function text(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase()
}

/**
 * 汇总库里用到的标签：按出现次数倒序，同次数按名称排。
 * 只做展示用，不单独建标签表——标签跟着记录走，删记录就自然消失。
 */
export function collectTags(lists: string[][]): string[] {
  const counts = new Map<string, number>()
  for (const tags of lists) {
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .map(([tag]) => tag)
}

/** 日期倒序；同一天再按时刻、再按写入顺序 */
function byDateDesc(a: { dateKey: string }, b: { dateKey: string }) {
  return b.dateKey.localeCompare(a.dateKey)
}

function byCreatedDesc(a: { createdAt: number }, b: { createdAt: number }) {
  return b.createdAt - a.createdAt
}

/** 没有日期的库表（食物、套餐、预设）按名称排，和各自列表页一致 */
function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'zh')
}

/**
 * @param keyword 原始关键词，空串只回标签，`#` 开头按标签精确筛
 * @param categoryIds 关键词翻译成的收支分类 id；调用方负责翻译
 */
export function searchRows(
  input: SearchInput,
  keyword: string,
  categoryIds: string[] = [],
): SearchResults {
  const entries = live(input.entries)
  const stamps = live(input.stamps)
  const finance = live(input.finance)
  const sleeps = live(input.sleeps)
  const intakes = live(input.intakes)
  const foods = live(input.foods)
  const meals = live(input.meals)
  const trainings = live(input.trainings)
  const schedules = live(input.schedules)
  const presets = live(input.presets)

  const tags = collectTags([
    ...entries.map((item) => item.tags ?? []),
    ...stamps.map((item) => item.tags ?? []),
  ])
  const raw = keyword.trim()
  const empty: SearchResults = { ...emptySearchResults(), tags }
  if (raw === '') return empty

  const needle = raw.toLowerCase()
  const byTag = raw.startsWith('#')
  const tagNeedle = byTag ? needle.slice(1).trim() : needle
  if (byTag && tagNeedle === '') return empty

  const tagsHit = (rowTags: string[] | undefined) => {
    const list = rowTags ?? []
    return byTag
      ? list.some((tag) => tag.toLowerCase() === tagNeedle)
      : list.some((tag) => tag.toLowerCase().includes(needle))
  }
  const hit = (texts: (string | null | undefined)[], rowTags?: string[]) => {
    if (byTag) return tagsHit(rowTags)
    return texts.some((value) => text(value).includes(needle)) || tagsHit(rowTags)
  }

  return {
    tags,
    entries: entries
      .filter((item) => hit([item.content], item.tags))
      .sort((a, b) => byDateDesc(a, b) || byCreatedDesc(a, b)),
    stamps: stamps
      .filter((item) => hit([item.content], item.tags))
      .sort(
        (a, b) =>
          byDateDesc(a, b) || b.time.localeCompare(a.time) || byCreatedDesc(a, b),
      ),
    finance: finance
      .filter(
        (item) =>
          hit([item.name, item.note]) ||
          (!byTag && categoryIds.includes(item.category)),
      )
      .sort(
        (a, b) =>
          byDateDesc(a, b) || b.time.localeCompare(a.time) || byCreatedDesc(a, b),
      ),
    sleeps: sleeps.filter((item) => hit([item.note])).sort(byDateDesc),
    intakes: intakes
      .filter((item) =>
        hit([item.name, ...(item.components ?? []).map((part) => part.name)]),
      )
      .sort((a, b) => byDateDesc(a, b) || b.time.localeCompare(a.time) || byCreatedDesc(a, b)),
    trainings: trainings
      .filter((item) => {
        const exercises = item.exercises ?? []
        return hit([
          item.title,
          item.note,
          ...exercises.map((exercise) => exercise.name),
          ...exercises.map((exercise) => exercise.note),
        ])
      })
      .sort((a, b) => byDateDesc(a, b) || b.time.localeCompare(a.time) || byCreatedDesc(a, b)),
    schedules: schedules
      .filter((item) => hit([item.title, item.note]))
      .sort((a, b) => byDateDesc(a, b) || b.time.localeCompare(a.time) || byCreatedDesc(a, b)),
    foods: foods.filter((item) => hit([item.name])).sort(byName),
    meals: meals.filter((item) => hit([item.name])).sort(byName),
    presets: presets.filter((item) => hit([item.name])).sort(byName),
  }
}
