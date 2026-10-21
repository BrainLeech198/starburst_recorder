/**
 * 按天查天气：AI 为主，程序兜底。
 *
 *   1. 先用已配置的 AI 模型联网查，要求它只回 {"weather":"晴"}
 *   2. AI 没配、超时、报错或明确回空，就静默改用 Open-Meteo 直接查
 *   3. 地点是自由文本，程序兜底时会先解析成经纬度（自动去「市 / 区 / 县」后缀）
 *
 * 为什么不自动写库：天气查错、地点有歧义都很常见，最终由用户在弹窗里
 * 点「填上」并确认才落库，避免悄悄改掉已经写好的天气。
 */
import { chat, pickReply } from '../ai/aiClient'
import { isConfigured, loadAiConfig } from '../ai/aiConfig'

const PLACE_KEY = 'sb_weather_place'
/** 预报接口能回查最近 92 天；更早的日期走历史存档接口 */
const FORECAST_WINDOW_DAYS = 90
/** AI 最多等这么久，超时直接走程序兜底，别让用户干等 */
const AI_TIMEOUT_MS = 12_000
/** 天气词全集，跟 weather.ts 的 WEATHER_PRESETS 一致 */
const WEATHER_WORDS = ['晴', '多云', '阴', '雨', '雪', '雷']
/** 行政区划后缀，从长到短，去掉后才能被 geocoding 认出来 */
const PLACE_SUFFIXES = [
  '特别行政区',
  '自治区',
  '自治州',
  '自治县',
  '市辖区',
  '地区',
  '省',
  '市',
  '区',
  '县',
  '州',
  '盟',
  '旗',
]

export interface WeatherPlace {
  lat: number
  lon: number
  /** 给用户看的地点名，比如「杭州 · 浙江 · 中国」 */
  label: string
}

/** 最终的查询结果 */
export interface DayWeather {
  state: string
  /** ai = 模型联网查；api = 程序兜底 */
  source: 'ai' | 'api'
  /** 程序兜底时解析到的地点，用来让用户确认没选错 */
  place?: string
}

/** 上次输入的地点。老版本存的是 {lat, lon, label}，这里能读就顺手迁移 */
export function loadWeatherPlace(): string {
  try {
    const raw = (localStorage.getItem(PLACE_KEY) ?? '').trim()
    if (raw === '') return ''
    if (!raw.startsWith('{')) return raw
    const parsed = JSON.parse(raw) as { label?: unknown }
    const label = typeof parsed.label === 'string' ? parsed.label.trim() : ''
    // 定位得到的「当前位置」没法当自由文本用，直接丢掉
    return label === '当前位置' ? '' : label
  } catch {
    return ''
  }
}

export function saveWeatherPlace(place: string) {
  localStorage.setItem(PLACE_KEY, place.trim())
}

/** WMO 天气码 → 我们自己的天气词。认不出的码返回空串 */
export function stateFromWeatherCode(code: number): string {
  if (code === 0 || code === 1) return '晴'
  if (code === 2) return '多云'
  if (code === 3 || code === 45 || code === 48) return '阴'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '雨'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪'
  if (code >= 95) return '雷'
  return ''
}

/** 日期拆成「年月日」，让 AI 不用自己猜格式 */
function dateParts(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) throw new Error('日期格式不对，查不了天气。')
  return { year, month, day }
}

function weatherPrompt(place: string, dateKey: string) {
  const { year, month, day } = dateParts(dateKey)
  return [
    `请联网查询 ${year} 年 ${month} 月 ${day} 日「${place}」的天气。`,
    '这一天如果是过去日期，请查当天的历史天气；如果是今天或未来，请查天气预报。',
    '只返回一个 JSON 对象，不要解释、不要代码块，格式固定为：',
    '{"weather":"晴"}',
    'weather 只能从「晴、多云、阴、雨、雪、雷」里选一个最接近的词。',
    '如果实在查不到，返回 {"weather":""}。',
  ].join('\n')
}

/** AI 可能回「晴天」「小雨」这类词，收敛到我们天气链上的六个词 */
function normalizeWeather(raw: string): string {
  const text = raw.trim()
  if (WEATHER_WORDS.includes(text)) return text
  if (text.includes('雷')) return '雷'
  if (text.includes('雪')) return '雪'
  if (text.includes('雨')) return '雨'
  if (text.includes('多云')) return '多云'
  if (text.includes('阴')) return '阴'
  if (text.includes('晴')) return '晴'
  return ''
}

/** 从模型回复里抠天气词：优先按 JSON 读，读不出再按整段文字兜底 */
function parseWeatherReply(reply: string): string {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (json) {
    try {
      const data = JSON.parse(json) as { weather?: unknown }
      if (typeof data.weather === 'string') {
        const state = normalizeWeather(data.weather)
        if (state !== '') return state
      }
    } catch {
      // 不是合法 JSON，交给下面的整段兜底
    }
  }
  return normalizeWeather(reply)
}

/** 给 AI 的请求加一层超时，超时就当没查到 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    task,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/**
 * 让 AI 联网查。任何失败都返回空串，由调用方决定兜底——
 * 对用户来说「AI 查不到」不是错误，只是换条路。
 */
async function askAi(place: string, dateKey: string): Promise<string> {
  const config = loadAiConfig()
  if (!isConfigured(config)) return ''

  const result = await withTimeout(
    chat({
      baseUrl: config.baseUrl.trim(),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
      messages: [
        {
          role: 'system',
          content:
            '你是一个天气查询助手。你必须联网搜索后再回答，只输出规定的 JSON，不要输出任何多余内容。',
        },
        { role: 'user', content: weatherPrompt(place, dateKey) },
      ],
    }),
    AI_TIMEOUT_MS,
  )

  if (!result || !result.ok) return ''
  const reply = pickReply(result.body)
  return reply === '' ? '' : parseWeatherReply(reply)
}

/** 去掉一个行政区划后缀：「杭州市」→「杭州」 */
function stripSuffix(name: string) {
  for (const suffix of PLACE_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return name.slice(0, -suffix.length)
    }
  }
  return name
}

/** 一次输入可能试几个写法：原样、旧地点里的第一段、去掉后缀的版本 */
function placeCandidates(input: string) {
  const list: string[] = []
  const add = (value: string) => {
    const name = value.trim()
    if (name !== '' && !list.includes(name)) list.push(name)
  }

  add(input)
  // 老版本地点是「杭州 · 浙江 · 中国」，第一段就是城市
  add(input.split('·')[0])
  for (const base of [...list]) add(stripSuffix(base))
  return list
}

interface GeoResult {
  name?: string
  latitude?: number
  longitude?: number
  country?: string
  admin1?: string
}

/** 地名 → 候选地点。Open-Meteo 的 geocoding 支持中文 */
async function searchPlaces(keyword: string): Promise<WeatherPlace[]> {
  let response: Response
  try {
    response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(keyword)}` +
        '&count=6&language=zh&format=json',
    )
  } catch {
    throw new Error('连不上天气服务，检查一下网络再试。')
  }
  if (!response.ok) {
    throw new Error(`天气服务出错了（${response.status}），过一会儿再试。`)
  }

  const data = (await response.json()) as { results?: GeoResult[] }
  return (data.results ?? [])
    .filter(
      (item): item is Required<Pick<GeoResult, 'name' | 'latitude' | 'longitude'>> & GeoResult =>
        typeof item.name === 'string' &&
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number',
    )
    .map((item) => {
      // 重名的城市很多，把省/国家带上才分得清
      const parts = [item.name, item.admin1, item.country].filter(
        (part, index, all): part is string =>
          typeof part === 'string' && part !== '' && all.indexOf(part) === index,
      )
      return {
        lat: item.latitude,
        lon: item.longitude,
        label: parts.join(' · '),
      }
    })
}

/** 自由输入的地名 → 一个确定的地点；几种写法都查不到才报错 */
export async function findWeatherPlace(input: string): Promise<WeatherPlace> {
  const target = input.trim()
  if (target === '') throw new Error('先填一个地点，比如 杭州、洛杉矶、京都。')

  for (const keyword of placeCandidates(target)) {
    const results = await searchPlaces(keyword)
    if (results.length > 0) return results[0]
  }
  throw new Error(`没找到「${target}」，换个写法再试，比如只写城市名。`)
}

/** 和今天差几天：负数表示过去 */
function daysFromToday(dateKey: string) {
  const { year, month, day } = dateParts(dateKey)
  const target = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

async function readWeatherCode(url: string): Promise<number | null> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('连不上天气服务，检查一下网络再试。')
  }
  if (!response.ok) {
    throw new Error(`天气服务出错了（${response.status}），过一会儿再试。`)
  }
  const data = (await response.json()) as {
    daily?: { weather_code?: (number | null)[] }
  }
  const code = data.daily?.weather_code?.[0]
  return typeof code === 'number' ? code : null
}

/** 程序兜底：查某一天的主天气。近期走预报接口，更早的走历史存档接口 */
async function fetchProgramWeather(dateKey: string, place: WeatherPlace): Promise<string> {
  const offset = daysFromToday(dateKey)
  const query =
    `latitude=${place.lat}&longitude=${place.lon}` +
    `&daily=weather_code&timezone=auto&start_date=${dateKey}&end_date=${dateKey}`

  const forecast = `https://api.open-meteo.com/v1/forecast?${query}`
  const archive = `https://archive-api.open-meteo.com/v1/archive?${query}`

  let code = offset >= -FORECAST_WINDOW_DAYS ? await readWeatherCode(forecast) : null
  // 预报接口回查不到时（日期太靠前或太靠后），再试历史接口
  if (code === null && offset < 0) code = await readWeatherCode(archive)
  if (code === null) {
    throw new Error('没查到这一天的天气，可能日期太早或太新。可以手动点天气，或者换个地点再试。')
  }

  const state = stateFromWeatherCode(code)
  if (state === '') {
    throw new Error(`查到了天气码 ${code}，但认不出对应哪种天气，先手动选一下。`)
  }
  return state
}

/**
 * 查某一天、某个地点的天气：先 AI，失败再程序兜底。
 * 只有两条路都失败时才抛错，错误里说的是程序兜底为什么没查到。
 */
export async function askWeather(place: string, dateKey: string): Promise<DayWeather> {
  const target = place.trim()
  if (target === '') throw new Error('先填一个地点，比如 杭州、洛杉矶、京都。')

  const aiState = await askAi(target, dateKey)
  if (aiState !== '') return { state: aiState, source: 'ai' }

  // AI 没配置、超时、报错或明确回空，都换程序查
  const resolved = await findWeatherPlace(target)
  const state = await fetchProgramWeather(dateKey, resolved)
  return { state, source: 'api', place: resolved.label }
}
