import { describe, expect, it } from 'vitest'
import { parseMealPhrase } from './mealPhrase'

/**
 * 一句话拆项同样没法控制模型输出，这里测「脏回答」：
 * 代码块、平铺 / 嵌套两种营养写法、带单位的字符串、缺失项、离谱数值。
 */
describe('parseMealPhrase', () => {
  it('读标准 items', () => {
    const items = parseMealPhrase(
      '{"items":[{"name":"米饭","matched":"","unit":"拳","count":1,"grams":150,"per100g":{"kcal":116,"protein":2.6,"carbs":25.9,"fat":0.3}},{"name":"卤鸡腿","matched":"卤鸡腿","unit":"个","count":1,"grams":110,"per100g":{"kcal":200,"protein":18,"carbs":2,"fat":13}}]}',
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      name: '米饭',
      unit: '拳',
      count: 1,
      grams: 150,
      kcal: 116,
      protein: 2.6,
      carbs: 25.9,
      fat: 0.3,
      matched: '',
    })
    expect(items[1].matched).toBe('卤鸡腿')
    expect(items[1].grams).toBe(110)
  })

  it('剥掉代码块', () => {
    const items = parseMealPhrase(
      '```json\n{"items":[{"name":"可乐","unit":"杯","count":1,"grams":330,"kcal":43}]}\n```',
    )
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('可乐')
    expect(items[0].grams).toBe(330)
  })

  it('兼容平铺和嵌套两种营养写法', () => {
    const items = parseMealPhrase(
      '{"items":[{"name":"燕麦","grams":40,"kcal":389,"protein":16.9},{"name":"牛奶","grams":250,"per100g":{"kcal":54,"protein":3.3}}]}',
    )
    expect(items[0].kcal).toBe(389)
    expect(items[1].protein).toBe(3.3)
  })

  it('接受 0.8 拳和带单位的字符串', () => {
    const items = parseMealPhrase(
      '{"items":[{"name":"花菜","unit":"拳","count":"0.8","grams":"120g","kcal":"24kcal","protein":"2g"}]}',
    )
    expect(items[0].count).toBe(0.8)
    expect(items[0].grams).toBe(120)
    expect(items[0].kcal).toBe(24)
    expect(items[0].protein).toBe(2)
  })

  it('缺名字的项丢掉，全缺就当没认出来', () => {
    expect(parseMealPhrase('{"items":[{"grams":100,"kcal":100}]}')).toEqual([])
    expect(parseMealPhrase('{"items":"一碗面"}')).toEqual([])
    expect(parseMealPhrase('看不出来')).toEqual([])
  })

  it('离谱的数值会被夹回合理区间', () => {
    const items = parseMealPhrase(
      '{"items":[{"name":"炸鸡","grams":99999,"count":1000,"kcal":10000,"protein":500}]}',
    )
    expect(items[0].grams).toBe(5000)
    expect(items[0].count).toBe(99)
    expect(items[0].kcal).toBe(900)
    expect(items[0].protein).toBe(100)
  })
})
