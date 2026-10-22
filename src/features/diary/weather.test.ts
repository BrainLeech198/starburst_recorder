import { describe, expect, it } from 'vitest'
import {
  joinWeather,
  normalizeWeather,
  parseWeather,
  weatherIcon,
  weatherIcons,
  weatherLabel,
} from './weather'

describe('normalizeWeather', () => {
  it('把「晴天」「小雨」这类说法收敛成天气词', () => {
    expect(normalizeWeather('晴天')).toBe('晴')
    expect(normalizeWeather('小雨')).toBe('雨')
    expect(normalizeWeather('阴天')).toBe('阴')
    expect(normalizeWeather('雷阵雨')).toBe('雷')
    expect(normalizeWeather('大风')).toBe('风')
    expect(normalizeWeather('多云转晴')).toBe('多云')
  })

  it('认不出的说法与空值返回空串', () => {
    expect(normalizeWeather('')).toBe('')
    expect(normalizeWeather('不知道')).toBe('')
  })
})

describe('parseWeather', () => {
  it('把一天里的天气链拆开', () => {
    expect(parseWeather('晴→雨→阴')).toEqual(['晴', '雨', '阴'])
    expect(parseWeather(' 晴 → 雨 ')).toEqual(['晴', '雨'])
  })

  it('空值与多余分隔符都当成没有', () => {
    expect(parseWeather(null)).toEqual([])
    expect(parseWeather(undefined)).toEqual([])
    expect(parseWeather('')).toEqual([])
    expect(parseWeather('晴→→雨')).toEqual(['晴', '雨'])
  })
})

describe('拼接与文案', () => {
  it('拼回去还能原样拆开', () => {
    expect(joinWeather([])).toBe('')
    expect(parseWeather(joinWeather(['晴', '雨']))).toEqual(['晴', '雨'])
  })

  it('天气链换成中文句子', () => {
    expect(weatherLabel(['晴', '雨', '阴'])).toBe('晴转雨转阴')
  })
})

describe('weatherIcon', () => {
  it('按关键词找图标，认不出返回空串', () => {
    expect(weatherIcon('晴')).toBe('☀️')
    expect(weatherIcon('雷')).toBe('⛈️')
    expect(weatherIcon('多云')).toBe('⛅')
    expect(weatherIcon('流星')).toBe('')
  })

  it('天气链图标跳过认不出的状态', () => {
    expect(weatherIcons(['晴', '未知', '雨'])).toBe('☀️→🌧️')
  })
})
