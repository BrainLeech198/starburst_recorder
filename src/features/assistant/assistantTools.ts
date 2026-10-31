/**
 * AI 助手能查的东西。
 *
 * 只读：这里没有一条函数会写库，AI 能做的就是把用户自己的记录翻出来看。
 * 每个工具都是「整库快照 + 参数」的纯函数，返回一段给模型看的文本；
 * 模型只能看到这段文本，看不到原始对象，也不会拿到 id 以外的敏感字段。
 */
import type { BackupData } from '@/core/db/store'
import type {
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthSleep,
} from '@/core/db/schema'
import { formatDateCn, isDateKey, shiftDay } from '@/core/utils/dateKey'
import { sleepMinutes, sleepParts } from '@/features/health/sleepMath'

/** 一次工具执行需要的东西；today 由调用方注入，纯函数不自己看时钟 */
export interface ToolRunContext {
  data: BackupData
  today: string
}

/** OpenAI function calling 的工具声明 */
export interface AssistantToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const DATE_ARGS = {
  from: { type: 'string', description: '开始日期，YYYY-MM-DD（含）' },
  to: { type: 'string', description: '结束日期，YYYY-MM-DD（含）' },
} as const

export const ASSISTANT_READ_TOOLS: AssistantToolSpec[] = [
  {
    name: 'query_day',
    description: '按日期看用户这一天的完整记录：天气、日记、随记、摄入、睡眠、收支。',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: '日期，YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'search_diary',
    description: '按关键词或日期区间查日记正文。关键词为空时按日期区间列出最近的日记。',
    parameters: {
      type: 'object',
      properties: {
        ...DATE_ARGS,
        keyword: { type: 'string', description: '关键词，可不填' },
      },
    },
  },
  {
    name: 'search_stamps',
    description: '按关键词或日期区间查随记（一天里随手记下的小事，带具体时刻）。',
    parameters: {
      type: 'object',
      properties: {
        ...DATE_ARGS,
        keyword: { type: 'string', description: '关键词，可不填' },
      },
    },
  },
  {
    name: 'intake_stats',
    description: '统计一段时间的饮食摄入：每天合计热量、区间日均、最常吃的食物。',
    parameters: {
      type: 'object',
      properties: { ...DATE_ARGS },
    },
  },
  {
    name: 'sleep_stats',
    description: '统计一段时间的睡眠：有几夜、平均时长、平均质量、每晚的起止时刻。',
    parameters: {
      type: 'object',
      properties: { ...DATE_ARGS },
    },
  },
  {
    name: 'finance_stats',
    description: '统计一段时间的收支：合计金额和逐笔明细，可按关键词过滤。',
    parameters: {
      type: 'object',
      properties: {
        ...DATE_ARGS,
        keyword: { type: 'string', description: '关键词，可不填' },
      },
    },
  },
  {
    name: 'profile_stats',
    description: '看身体档案和最近的称重记录（体重趋势、TDEE、目标热量）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_food',
    description:
      '在食物库里按名称查食物，拿到 foodId 和每 100g 营养。要记饮食时先用它查，别自己猜热量。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '食物名关键词，可不填（不填时列出前 25 条）' },
      },
    },
  },
]

/**
 * 会写数据的工具。模型调用它们时不会立刻写库，
 * 而是变成一张「待确认卡片」，等用户点确认后才执行。
 */
export const ASSISTANT_ACTION_TOOLS: AssistantToolSpec[] = [
  {
    name: 'remember',
    description:
      '把用户想让你长期记住的事（偏好、目标、习惯、重要事实）放进待确认卡片。用户确认后才会记住。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '一句话，例如「不吃香菜」「目标体重 65kg」' },
        kind: {
          type: 'string',
          enum: ['preference', 'goal', 'habit', 'fact'],
          description: '记忆分类：偏好 / 目标 / 习惯 / 事实',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_finance',
    description: '记一笔收支，放进待确认卡片。只用于用户明确说要记账的时候，不要替用户编数字。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，不填就是今天' },
        direction: { type: 'string', enum: ['expense', 'income'], description: '支出还是收入' },
        name: { type: 'string', description: '项目名，例如「午饭」' },
        amount: { type: 'number', description: '金额，正数' },
        note: { type: 'string', description: '备注，可不填' },
        category: {
          type: 'string',
          description: '分类 id，可不填。支出：food/transport/shopping/home/health/fun/study/social/other；收入：salary/bonus/invest/gift/otherIncome',
        },
      },
      required: ['name', 'amount'],
    },
  },
  {
    name: 'add_stamp',
    description: '记一条随记（一天里发生的小事），放进待确认卡片。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，不填就是今天' },
        time: { type: 'string', description: '时刻 HH:MM，不填就是现在' },
        content: { type: 'string', description: '随记内容' },
      },
      required: ['content'],
    },
  },
  {
    name: 'add_diary',
    description: '写一篇日记，放进待确认卡片。只在用户明确让你写的时候用。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，不填就是今天' },
        content: { type: 'string', description: '日记正文' },
      },
      required: ['content'],
    },
  },
  {
    name: 'add_sleep',
    description: '记一夜睡眠，放进待确认卡片。date 是起床那天；当天已有记录时会覆盖。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '起床那天 YYYY-MM-DD，不填就是今天' },
        bedtime: { type: 'string', description: '入睡时刻 HH:MM' },
        wakeTime: { type: 'string', description: '起床时刻 HH:MM' },
        quality: { type: 'number', description: '睡眠质量 1–5，可不填' },
        note: { type: 'string', description: '备注，可不填' },
      },
      required: ['bedtime', 'wakeTime'],
    },
  },
  {
    name: 'add_weigh',
    description: '记一次体重，放进待确认卡片。需要先有身体档案。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，不填就是今天' },
        weightKg: { type: 'number', description: '体重，公斤' },
      },
      required: ['weightKg'],
    },
  },
  {
    name: 'add_intake',
    description:
      '记一笔饮食，放进待确认卡片。优先传食物库的 foodId 和克数；食物库没有时，必须由用户给出热量才能手记。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，不填就是今天' },
        time: { type: 'string', description: '时刻 HH:MM，不填就是现在' },
        foodId: { type: 'string', description: '食物库 id（先用 search_food 查）' },
        name: { type: 'string', description: '食物名；没有 foodId 时必填' },
        grams: { type: 'number', description: '吃了多少克' },
        kcal: { type: 'number', description: '没有 foodId 时的热量（千卡）' },
        protein: { type: 'number', description: '蛋白质克数，可不填' },
        carbs: { type: 'number', description: '碳水克数，可不填' },
        fat: { type: 'number', description: '脂肪克数，可不填' },
      },
      required: ['grams'],
    },
  },
]

export const ASSISTANT_TOOLS: AssistantToolSpec[] = [
  ...ASSISTANT_READ_TOOLS,
  ...ASSISTANT_ACTION_TOOLS,
]

const ACTION_NAMES = new Set(ASSISTANT_ACTION_TOOLS.map((spec) => spec.name))

/** 这个工具是「写」还是「读」：写的只出确认卡片，不直接落库 */
export function isAssistantActionTool(name: string) {
  return ACTION_NAMES.has(name)
}

/** 区间最宽 366 天，避免模型传 2000-01-01 把整库翻一遍 */
const MAX_RANGE_DAYS = 366
/** 单个工具结果最多这么多字，超了就截断并提示 */
const MAX_RESULT_CHARS = 2400

function argText(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 把模型给的 from/to 收成一个合法区间。
 * 缺省是最近 7 天；to 晚于今天就按今天算；from 太早就砍到上限。
 */
export function resolveRange(
  from: string,
  to: string,
  today: string,
): { from: string; to: string } {
  const end = isDateKey(to) && to <= today ? to : today
  const startCandidate = isDateKey(from) && from <= end ? from : shiftDay(end, -6)
  const floor = shiftDay(end, -(MAX_RANGE_DAYS - 1))
  const start = startCandidate < floor ? floor : startCandidate
  return { from: start, to: end }
}

function inRange(dateKey: string, from: string, to: string) {
  return dateKey >= from && dateKey <= to
}

function clip(text: string, max: number) {
  const body = text.trim()
  return body.length > max ? `${body.slice(0, max)}…` : body
}

function matches(text: string, keyword: string) {
  return keyword === '' || text.toLowerCase().includes(keyword.toLowerCase())
}

function diaryLine(item: DiaryEntry) {
  return `${formatDateCn(item.dateKey)} [${item.code}] ${clip(item.content, 400)}`
}

function stampLine(item: DiaryStamp) {
  return `${formatDateCn(item.dateKey)} ${item.time} [${item.code}] ${clip(item.content, 200)}`
}

function financeLine(item: FinanceEntry) {
  const note = item.note.trim()
  const kind = item.kind === 'income' ? '收入' : '支出'
  return `${formatDateCn(item.dateKey)} ${kind} ${item.name} ${item.amount} 元${note ? `（${note}）` : ''}`
}

function intakeLine(item: HealthIntake) {
  return `${item.time} ${item.name} ${Math.round(item.kcal)} 千卡`
}

function sleepLine(item: HealthSleep) {
  const parts = sleepParts(sleepMinutes(item.bedtime, item.wakeTime))
  return `${formatDateCn(item.dateKey)} ${item.bedtime}→${item.wakeTime}，${parts.h} 小时 ${parts.m} 分${
    item.quality === null ? '' : `，质量 ${item.quality}/5`
  }${item.note.trim() ? `，备注：${clip(item.note, 80)}` : ''}`
}

function sumKcal(items: HealthIntake[]) {
  return Math.round(items.reduce((sum, item) => sum + item.kcal, 0))
}

/** 一天一张小卡片：只写有内容的项，别把「没有」也列一遍 */
function dayBlock(
  dateKey: string,
  data: BackupData,
): string[] {
  const lines = [formatDateCn(dateKey)]
  const day = data.days.find((item) => item.dateKey === dateKey)
  if (day?.weather) lines.push(`天气：${day.weather}`)

  const entries = data.entries.filter(
    (item) => item.deletedAt === null && item.dateKey === dateKey && item.content.trim() !== '',
  )
  if (entries.length > 0) lines.push(`日记：${entries.map(diaryLine).join(' ／ ')}`)

  const stamps = data.stamps
    .filter((item) => item.deletedAt === null && item.dateKey === dateKey)
    .sort((a, b) => (a.time < b.time ? -1 : 1))
  if (stamps.length > 0) lines.push(`随记：${stamps.map(stampLine).join('；')}`)

  const intakes = data.intakes
    .filter((item) => item.deletedAt === null && item.dateKey === dateKey)
    .sort((a, b) => (a.time < b.time ? -1 : 1))
  if (intakes.length > 0) {
    const total = sumKcal(intakes)
    lines.push(`摄入：合计 ${total} 千卡；${intakes.map(intakeLine).join('；')}`)
  }

  const sleep = data.sleeps.find((item) => item.deletedAt === null && item.dateKey === dateKey)
  if (sleep) lines.push(`睡眠：${sleepLine(sleep)}`)

  const finance = data.finance.filter(
    (item) => item.deletedAt === null && item.dateKey === dateKey,
  )
  if (finance.length > 0) lines.push(`收支：${finance.map(financeLine).join('；')}`)

  if (lines.length === 1) lines.push('这一天没有任何记录。')
  return lines
}

function intakeStats(from: string, to: string, data: BackupData) {
  const items = data.intakes.filter(
    (item) => item.deletedAt === null && inRange(item.dateKey, from, to),
  )
  if (items.length === 0) return `${formatDateCn(from)} 到 ${formatDateCn(to)}：没有任何摄入记录。`

  const byDay = new Map<string, HealthIntake[]>()
  for (const item of items) {
    const list = byDay.get(item.dateKey) ?? []
    list.push(item)
    byDay.set(item.dateKey, list)
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  const total = sumKcal(items)
  const avg = Math.round(total / days.length)
  const names = new Map<string, number>()
  for (const item of items) names.set(item.name, (names.get(item.name) ?? 0) + 1)
  const top = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return [
    `${formatDateCn(from)} 到 ${formatDateCn(to)}：共 ${items.length} 笔，合计 ${total} 千卡，有记录的 ${days.length} 天日均 ${avg} 千卡。`,
    `常吃：${top.map(([name, count]) => `${name}（${count} 次）`).join('、')}`,
    '逐日：',
    ...days.map(([dateKey, list]) => `${dateKey} ${sumKcal(list)} 千卡`),
  ].join('\n')
}

function sleepStats(from: string, to: string, data: BackupData) {
  const items = data.sleeps.filter(
    (item) => item.deletedAt === null && inRange(item.dateKey, from, to),
  )
  if (items.length === 0) return `${formatDateCn(from)} 到 ${formatDateCn(to)}：没有任何睡眠记录。`

  const minutes = items.map((item) => sleepMinutes(item.bedtime, item.wakeTime))
  const avg = Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length)
  const parts = sleepParts(avg)
  const rated = items.filter((item) => item.quality !== null)
  const avgQuality =
    rated.length === 0
      ? null
      : (rated.reduce((sum, item) => sum + (item.quality ?? 0), 0) / rated.length).toFixed(1)

  return [
    `${formatDateCn(from)} 到 ${formatDateCn(to)}：${items.length} 夜，平均 ${parts.h} 小时 ${parts.m} 分${
      avgQuality === null ? '' : `，平均质量 ${avgQuality}/5`
    }。`,
    ...items
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
      .map(sleepLine),
  ].join('\n')
}

function financeStats(from: string, to: string, keyword: string, data: BackupData) {
  const items = data.finance.filter(
    (item) =>
      item.deletedAt === null &&
      inRange(item.dateKey, from, to) &&
      matches(`${item.name} ${item.note}`, keyword),
  )
  if (items.length === 0) return `${formatDateCn(from)} 到 ${formatDateCn(to)}：没有符合条件的收支记录。`

  const total = items.reduce((sum, item) => sum + item.amount, 0)
  return [
    `${formatDateCn(from)} 到 ${formatDateCn(to)}：${items.length} 笔，合计 ${Math.round(total * 100) / 100} 元。`,
    ...items
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
      .map(financeLine),
  ].join('\n')
}

function profileStats(data: BackupData) {
  const profile = data.profile
  if (!profile) return '用户还没有填写身体档案。'
  const weighIns = [...(profile.weighIns ?? [])].sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  )
  const lines: string[] = []
  if (profile.sex) lines.push(`性别：${profile.sex === 'male' ? '男' : '女'}`)
  if (profile.age !== null) lines.push(`年龄：${profile.age} 岁`)
  if (profile.heightCm !== null) lines.push(`身高：${profile.heightCm} cm`)
  if (profile.weightKg !== null) lines.push(`最新体重：${profile.weightKg} kg`)
  if (profile.tdee !== null) lines.push(`维持热量（TDEE）：${profile.tdee} 千卡`)
  if (profile.targetKcal !== null) lines.push(`目标热量：${profile.targetKcal} 千卡`)
  if (profile.proteinTarget !== null) lines.push(`蛋白质目标：${profile.proteinTarget} g`)
  if (profile.idealBedtime && profile.idealWakeTime) {
    lines.push(`理想作息：${profile.idealBedtime} → ${profile.idealWakeTime}`)
  }
  if (profile.note.trim()) lines.push(`自述：${clip(profile.note, 300)}`)
  if (lines.length === 0) lines.push('档案基本是空的。')

  if (weighIns.length === 0) {
    lines.push('还没有称重记录。')
  } else {
    lines.push('称重记录（从旧到新）：')
    for (const item of weighIns.slice(-10)) {
      lines.push(`${item.dateKey} ${item.weightKg} kg`)
    }
    const first = weighIns[0]
    const last = weighIns[weighIns.length - 1]
    if (weighIns.length > 1) {
      const delta = Math.round((last.weightKg - first.weightKg) * 10) / 10
      lines.push(`这段时间共变化 ${delta > 0 ? '+' : ''}${delta} kg。`)
    }
  }
  return lines.join('\n')
}

function foodLine(food: HealthFood) {
  const serving =
    food.servingName && food.servingGrams
      ? `；常用份量「${food.servingName}」约 ${food.servingGrams} g`
      : ''
  return `${food.name}（foodId=${food.id}）每 100g：${Math.round(food.kcal)} 千卡，蛋白 ${food.protein} g，碳水 ${food.carbs} g，脂肪 ${food.fat} g${serving}`
}

function searchFood(keyword: string, data: BackupData) {
  const foods = data.foods.filter(
    (item) => item.deletedAt === null && matches(item.name, keyword),
  )
  if (foods.length === 0) {
    return keyword === ''
      ? '食物库里还没有食物。'
      : `食物库里没有名字含「${keyword}」的食物。`
  }
  const picked = foods.slice(0, 25)
  return [
    keyword === '' ? `食物库共 ${foods.length} 条，先列 ${picked.length} 条：` : `找到 ${picked.length} 条：`,
    ...picked.map(foodLine),
    '以上 foodId 只用于工具参数，不要念给用户。',
  ].join('\n')
}

/** 工具执行器：名字不认识就返回一句人话，不让模型拿着空结果瞎编 */
export function runAssistantTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRunContext,
): string {
  const from = argText(args, 'from')
  const to = argText(args, 'to')
  const keyword = argText(args, 'keyword')
  const range = resolveRange(from, to, ctx.today)

  let text: string
  switch (name) {
    case 'query_day': {
      const date = argText(args, 'date')
      if (!isDateKey(date)) {
        text = '日期格式不对，需要 YYYY-MM-DD。'
        break
      }
      text = dayBlock(date, ctx.data).join('\n')
      break
    }
    case 'search_diary': {
      const items = ctx.data.entries
        .filter(
          (item) =>
            item.deletedAt === null &&
            inRange(item.dateKey, range.from, range.to) &&
            matches(item.content, keyword) &&
            item.content.trim() !== '',
        )
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
        .slice(0, 40)
      text =
        items.length === 0
          ? `${formatDateCn(range.from)} 到 ${formatDateCn(range.to)}：没有符合条件的日记。`
          : `${formatDateCn(range.from)} 到 ${formatDateCn(range.to)}：找到 ${items.length} 篇。\n${items
              .map(diaryLine)
              .join('\n')}`
      break
    }
    case 'search_stamps': {
      const items = ctx.data.stamps
        .filter(
          (item) =>
            item.deletedAt === null &&
            inRange(item.dateKey, range.from, range.to) &&
            matches(item.content, keyword),
        )
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0))
        .slice(0, 60)
      text =
        items.length === 0
          ? `${formatDateCn(range.from)} 到 ${formatDateCn(range.to)}：没有符合条件的随记。`
          : `${formatDateCn(range.from)} 到 ${formatDateCn(range.to)}：找到 ${items.length} 条。\n${items
              .map(stampLine)
              .join('\n')}`
      break
    }
    case 'intake_stats':
      text = intakeStats(range.from, range.to, ctx.data)
      break
    case 'sleep_stats':
      text = sleepStats(range.from, range.to, ctx.data)
      break
    case 'finance_stats':
      text = financeStats(range.from, range.to, keyword, ctx.data)
      break
    case 'profile_stats':
      text = profileStats(ctx.data)
      break
    case 'search_food':
      text = searchFood(keyword, ctx.data)
      break
    default:
      text = `没有叫 ${name} 的工具。`
  }

  return clip(text, MAX_RESULT_CHARS)
}
