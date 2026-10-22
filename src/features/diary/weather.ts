/** 可选天气：连续点选就是"一天里变化过的天气"，比如 晴→雨→阴 */
export const WEATHER_PRESETS = ['晴', '雨', '阴', '多云', '雪', '风']

/**
 * 把模型回的「晴天」「小雨」「大风」收敛成我们的天气词。
 * 顺序有讲究：先判复合词，再判单字，免得「雷阵雨」被当成「雨」。
 */
export function normalizeWeather(raw: string): string {
  const text = raw.trim()
  if (text === '') return ''
  if (text.includes('雷')) return '雷'
  if (text.includes('雪')) return '雪'
  if (text.includes('雨')) return '雨'
  if (text.includes('多云')) return '多云'
  if (text.includes('阴')) return '阴'
  if (text.includes('风')) return '风'
  if (text.includes('晴')) return '晴'
  return ''
}

/** 天气状态对应的图标 */
const WEATHER_ICONS: [string, string][] = [
  ['雪', '❄️'],
  ['雨', '🌧️'],
  ['阴', '☁️'],
  ['云', '⛅'],
  ['风', '🍃'],
  ['雷', '⛈️'],
  ['晴', '☀️'],
]

/**
 * 库里存成 '晴→雨→阴' 这种串：一眼看得懂，老数据（就一个"晴"）也能直接解析，
 * 不用改表结构、不用迁移。
 */
export function parseWeather(weather: string | null | undefined): string[] {
  if (!weather) return []
  return weather
    .split('→')
    .map((state) => state.trim())
    .filter(Boolean)
}

export function joinWeather(states: string[]): string {
  return states.join('→')
}

export function weatherIcon(state: string): string {
  return WEATHER_ICONS.find(([keyword]) => state.includes(keyword))?.[1] ?? ''
}

/** '☀️→🌧️→☁️'，认不出的状态跳过 */
export function weatherIcons(states: string[]): string {
  return states.map(weatherIcon).filter(Boolean).join('→')
}

/** '晴转雨转阴' */
export function weatherLabel(states: string[]): string {
  return states.join('转')
}
