import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toDateKey } from '@/core/utils/dateKey'

/**
 * 天气查询的编排逻辑：AI 优先、失败静默兜底。
 * 这里只关心「走哪条路、结果标什么来源」，所以 AI 与 fetch 都替换掉。
 */
const aiConfig = vi.hoisted(() => ({
  isConfigured: vi.fn(() => true),
  loadAiConfig: vi.fn(() => ({ baseUrl: 'https://ai.test/v1', apiKey: 'key', model: 'model' })),
}))

const aiClient = vi.hoisted(() => ({
  chat: vi.fn(),
  pickReply: vi.fn((body: string) => body),
}))

vi.mock('@/features/ai/aiConfig', () => aiConfig)
vi.mock('@/features/ai/aiClient', () => aiClient)

import { askWeather, findWeatherPlace, stateFromWeatherCode } from './weatherQuery'

const today = toDateKey(new Date())

const fetchMock = vi.fn()

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

const hangzhou = { name: '杭州', latitude: 30.29, longitude: 120.16, admin1: '浙江', country: '中国' }

/** 程序兜底需要的两次请求：先解析地点，再查天气码 */
function stubProgramWeather(code: number) {
  fetchMock
    .mockResolvedValueOnce(okJson({ results: [hangzhou] }))
    .mockResolvedValueOnce(okJson({ daily: { weather_code: [code] } }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  aiClient.chat.mockReset()
  aiConfig.isConfigured.mockReset().mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('askWeather', () => {
  it('AI 查到就直接用，不再碰程序接口', async () => {
    aiClient.chat.mockResolvedValue({ ok: true, status: 200, body: '{"weather":"晴"}', ms: 12 })

    expect(await askWeather('杭州', today)).toEqual({ state: '晴', source: 'ai' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AI 明确回空就静默换成程序，并标明来源', async () => {
    aiClient.chat.mockResolvedValue({ ok: true, status: 200, body: '{"weather":""}', ms: 12 })
    stubProgramWeather(61)

    expect(await askWeather('杭州', today)).toEqual({
      state: '雨',
      source: 'api',
      place: '杭州 · 浙江 · 中国',
    })
  })

  it('没配模型时跳过 AI', async () => {
    aiConfig.isConfigured.mockReturnValue(false)
    stubProgramWeather(0)

    expect(await askWeather('杭州', today)).toEqual({ state: '晴', source: 'api', place: '杭州 · 浙江 · 中国' })
    expect(aiClient.chat).not.toHaveBeenCalled()
  })

  it('AI 请求本身报错也照样兜底', async () => {
    aiClient.chat.mockRejectedValue(new Error('IPC 断开了'))
    stubProgramWeather(2)

    expect(await askWeather('杭州', today)).toEqual({ state: '多云', source: 'api', place: '杭州 · 浙江 · 中国' })
  })

  it('AI 超时不等，按兜底处理', async () => {
    vi.useFakeTimers()
    aiClient.chat.mockReturnValue(new Promise(() => {}))
    stubProgramWeather(0)

    const pending = askWeather('杭州', today)
    await vi.advanceTimersByTimeAsync(12_000)

    expect(await pending).toEqual({ state: '晴', source: 'api', place: '杭州 · 浙江 · 中国' })
  })

  it('地点为空直接提示，不浪费一次请求', async () => {
    await expect(askWeather('  ', today)).rejects.toThrow('先填一个地点')
    expect(aiClient.chat).not.toHaveBeenCalled()
  })
})

describe('findWeatherPlace', () => {
  it('带行政后缀查不到时自动去掉再试', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ results: [] }))
      .mockResolvedValueOnce(okJson({ results: [hangzhou] }))

    const place = await findWeatherPlace('杭州市')
    expect(place.label).toBe('杭州 · 浙江 · 中国')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain(encodeURIComponent('杭州'))
  })

  it('几种写法都查不到时说清楚换个写法', async () => {
    fetchMock.mockResolvedValue(okJson({ results: [] }))
    await expect(findWeatherPlace('不存在的地方')).rejects.toThrow('换个写法')
  })
})

describe('stateFromWeatherCode', () => {
  it.each([
    [0, '晴'],
    [1, '晴'],
    [2, '多云'],
    [3, '阴'],
    [45, '阴'],
    [48, '阴'],
    [51, '雨'],
    [67, '雨'],
    [80, '雨'],
    [82, '雨'],
    [71, '雪'],
    [77, '雪'],
    [85, '雪'],
    [86, '雪'],
    [95, '雷'],
    [99, '雷'],
    [4, ''],
    [50, ''],
    [70, ''],
    [90, ''],
  ])('WMO %i → %s', (code, expected) => {
    expect(stateFromWeatherCode(code)).toBe(expected)
  })
})
