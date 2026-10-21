/**
 * 按天查天气：Open-Meteo，免费、不用注册、不用 key。
 *
 * 只做三件事：
 *   1. 记住查天气用的地点（自动定位一次，或者自己搜一个城市）
 *   2. 把一个日期查成我们自己的天气词（晴 / 雨 / 阴 / 多云 / 雪 / 雷）
 *   3. 失败时给出人话原因
 *
 * 为什么不自动写库：天气查错、定位偏了都很常见，最终由用户在弹窗里
 * 点「填上」并确认才落库，避免悄悄改掉已经写好的天气。
 */

const PLACE_KEY = 'sb_weather_place'
/** 预报接口能回查最近 92 天；更早的日期走历史存档接口 */
const FORECAST_WINDOW_DAYS = 90

export interface WeatherPlace {
  lat: number
  lon: number
  /** 给用户看的地点名，比如「杭州 · 浙江 · 中国」或「当前位置」 */
  label: string
  source: 'geo' | 'city'
}

/** 查到的结果：code 是 WMO 原始码，state 是落到我们天气链上的词 */
export interface DayWeather {
  state: string
  code: number
}

export function loadWeatherPlace(): WeatherPlace | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WeatherPlace>
    if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number') return null
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      label: typeof parsed.label === 'string' && parsed.label ? parsed.label : '上次的地点',
      source: parsed.source === 'geo' ? 'geo' : 'city',
    }
  } catch {
    return null
  }
}

export function saveWeatherPlace(place: WeatherPlace) {
  localStorage.setItem(PLACE_KEY, JSON.stringify(place))
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

/** 定位失败时统一给一句能指导下一步的话 */
function locateMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return '定位权限被拒绝了。也可以在下面搜一个城市。'
  }
  if (error.code === error.TIMEOUT) {
    return '定位超时了。也可以在下面搜一个城市。'
  }
  return '这次没定位成功。也可以在下面搜一个城市。'
}

/** 浏览器/WebView 的定位；手机端要先在系统里允许定位 */
export function locatePlace(): Promise<WeatherPlace> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('这台设备不支持定位。可以在下面搜一个城市。'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: '当前位置',
          source: 'geo',
        })
      },
      (error) => reject(new Error(locateMessage(error))),
      { timeout: 8000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false },
    )
  })
}

interface GeoResult {
  name?: string
  latitude?: number
  longitude?: number
  country?: string
  admin1?: string
}

/** 地名 → 候选地点。Open-Meteo 的 geocoding 支持中文 */
export async function searchPlaces(name: string): Promise<WeatherPlace[]> {
  const keyword = name.trim()
  if (keyword === '') return []

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
        source: 'city' as const,
      }
    })
}

/** 和今天差几天：负数表示过去 */
function daysFromToday(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) throw new Error('日期格式不对，查不了天气。')
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

/** 查某一天的主天气。近期走预报接口，更早的走历史存档接口 */
export async function fetchDayWeather(dateKey: string, place: WeatherPlace): Promise<DayWeather> {
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
  return { state, code }
}
