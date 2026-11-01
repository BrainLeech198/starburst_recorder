/**
 * 把健康应用的原始样本收成本应用认的体重与睡眠。
 *
 * 纯函数：不碰插件、不碰数据库，Node 里可以直接单测。
 * 只认样本里的起止时刻、数值、单位和睡眠状态，其余字段一概不看。
 */
import type { SleepWakeEvent, WeighIn } from '@/core/db/schema'
import { toDateKey } from '@/core/utils/dateKey'
import { round2 } from './healthMath'
import { sortWakeEvents } from './sleepMath'

/** 插件给出的睡眠状态 */
export type DeviceSleepState = 'inBed' | 'asleep' | 'awake' | 'rem' | 'deep' | 'light'

/** 插件返回的一条样本，只保留这里用得上的字段 */
export interface DeviceSample {
  dataType: string
  value: number
  unit: string
  startDate: string
  endDate: string
  sourceName?: string
  sleepState?: DeviceSleepState
  stages?: { startDate: string; endDate: string; stage: DeviceSleepState }[]
}

/** 一段睡眠至少要这么久才算一夜，零星的午睡会被丢掉 */
const MIN_NIGHT_MINUTES = 180
/** 同一段觉里断开超过这么久，就当作两段（午睡不会被拼进夜觉） */
const MAX_GAP_MS = 2 * 60 * 60 * 1000
/** 分段按「开始后 6 小时」归夜：凌晨的段和前一晚落在同一个日期 */
const NIGHT_SHIFT_MS = 6 * 60 * 60 * 1000
/** 体重最多留这么多条，跟身体档案的上限一致 */
const MAX_WEIGH_INS = 120
/** 一夜最多记这么多次夜醒，跟睡眠弹窗的上限一致 */
const MAX_WAKE_EVENTS = 20

const ASLEEP_STATES: DeviceSleepState[] = ['asleep', 'rem', 'deep', 'light']

export interface ImportedWeight extends WeighIn {
  /** 记下这次体重的是哪台设备 / 哪个应用 */
  source: string | null
}

export interface ImportedSleep {
  dateKey: string
  bedtime: string
  wakeTime: string
  /** 这一夜真正睡着的分钟数（各段并集，不含中间的清醒） */
  minutes: number
  wakeEvents: SleepWakeEvent[]
  /** 样本来自哪个应用，弹窗里标一下 */
  source: string | null
}

function clockOf(ms: number): string {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function minutesOf(start: number, end: number): number {
  return (end - start) / 60000
}

/**
 * 体重样本按天收成一条：同一天有多条时取最新的那条；
 * 不合理的读数（单位换算后不在 20–400 kg）直接丢掉。
 */
export function weighInsFromSamples(samples: DeviceSample[]): ImportedWeight[] {
  const byDay = new Map<string, ImportedWeight>()
  for (const sample of samples) {
    if (sample.dataType !== 'weight') continue
    const start = Date.parse(sample.startDate)
    if (!Number.isFinite(start) || !Number.isFinite(sample.value) || sample.value <= 0) continue
    // Health Connect 一般给公斤；个别来源给克，这里一并换算
    const kg = sample.unit === 'gram' ? sample.value / 1000 : sample.value
    if (kg < 20 || kg > 400) continue
    const dateKey = toDateKey(new Date(start))
    const existing = byDay.get(dateKey)
    if (existing && existing.createdAt >= start) continue
    byDay.set(dateKey, {
      dateKey,
      weightKg: round2(kg),
      createdAt: start,
      source: sample.sourceName ?? null,
    })
  }
  return [...byDay.values()]
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, MAX_WEIGH_INS)
}

interface SleepSegment {
  start: number
  end: number
  state: DeviceSleepState
  source: string | null
}

/** 样本可能是「整段睡眠」，也可能是「逐阶段的分段」，这里统一拆成段 */
function segmentsFromSamples(samples: DeviceSample[]): SleepSegment[] {
  const segments: SleepSegment[] = []
  const push = (
    startDate: string,
    endDate: string,
    state: DeviceSleepState | undefined,
    source: string | null,
  ) => {
    const start = Date.parse(startDate)
    const end = Date.parse(endDate)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
    segments.push({ start, end, state: state ?? 'asleep', source })
  }
  for (const sample of samples) {
    if (sample.dataType !== 'sleep') continue
    if (Array.isArray(sample.stages) && sample.stages.length > 0) {
      for (const stage of sample.stages) {
        push(stage.startDate, stage.endDate, stage.stage, sample.sourceName ?? null)
      }
    } else {
      push(sample.startDate, sample.endDate, sample.sleepState, sample.sourceName ?? null)
    }
  }
  return segments.sort((a, b) => a.start - b.start)
}

/** 把重叠的分段并起来：插件同时给整段和分阶段数据时不会重复计时 */
function unionRanges(segments: SleepSegment[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  for (const segment of segments) {
    const last = ranges[ranges.length - 1]
    if (last && segment.start <= last.end) {
      last.end = Math.max(last.end, segment.end)
    } else {
      ranges.push({ start: segment.start, end: segment.end })
    }
  }
  return ranges
}

/** 中间断开太久的并集拆成几段，跨夜的大断档不会被当成连续睡眠 */
function splitByGap(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  const sessions: { start: number; end: number }[] = []
  for (const range of ranges) {
    const last = sessions[sessions.length - 1]
    if (last && range.start - last.end <= MAX_GAP_MS) {
      last.end = Math.max(last.end, range.end)
    } else {
      sessions.push({ ...range })
    }
  }
  return sessions
}

/**
 * 睡眠样本按夜收成一条：dateKey 是起床那天，就寝 / 起床取整夜的起止时刻，
 * 中间的清醒段收成夜醒事件；时长不到三小时的段直接跳过。
 */
export function sleepsFromSamples(samples: DeviceSample[]): ImportedSleep[] {
  const segments = segmentsFromSamples(samples)
  const asleep = segments.filter((item) => ASLEEP_STATES.includes(item.state))
  // 有的手环只给「躺在床上」的整段、没有分阶段数据，这时退一步按它计时
  const usable = asleep.length > 0 ? asleep : segments.filter((item) => item.state === 'inBed')
  if (usable.length === 0) return []

  const byNight = new Map<string, SleepSegment[]>()
  for (const segment of usable) {
    const key = toDateKey(new Date(segment.start + NIGHT_SHIFT_MS))
    const list = byNight.get(key) ?? []
    list.push(segment)
    byNight.set(key, list)
  }

  const byDate = new Map<string, ImportedSleep>()
  for (const list of byNight.values()) {
    for (const session of splitByGap(unionRanges(list))) {
      const inside = list.filter(
        (item) => item.start >= session.start && item.end <= session.end,
      )
      const minutes = unionRanges(inside).reduce(
        (sum, range) => sum + minutesOf(range.start, range.end),
        0,
      )
      if (minutes < MIN_NIGHT_MINUTES) continue
      const dateKey = toDateKey(new Date(session.end))
      const current = byDate.get(dateKey)
      if (current && current.minutes >= minutes) continue
      const bedtime = clockOf(session.start)
      const awake = segments
        .filter(
          (item) => item.state === 'awake' && item.start >= session.start && item.end <= session.end,
        )
        .slice(0, MAX_WAKE_EVENTS)
      byDate.set(dateKey, {
        dateKey,
        bedtime,
        wakeTime: clockOf(session.end),
        minutes: Math.round(minutes),
        wakeEvents: sortWakeEvents(
          awake.map((item) => ({
            time: clockOf(item.start),
            minutes: Math.round(minutesOf(item.start, item.end)),
          })),
          bedtime,
        ),
        source: list[0]?.source ?? null,
      })
    }
  }
  return [...byDate.values()].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
}
