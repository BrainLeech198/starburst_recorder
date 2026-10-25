import { describe, expect, it } from 'vitest'
import { parseFoodAnalysis } from './foodVision'

/**
 * 模型输出没法控制，所以这里专门测「脏回答」：
 * 代码块、带单位的字符串、套一层 per100g、离谱数值，都要收敛成能用的数字。
 */
describe('parseFoodAnalysis', () => {
  it('读标准 JSON', () => {
    const guess = parseFoodAnalysis(
      '{"name":"白米饭","grams":200,"kcal":116,"protein":2.6,"carbs":25.9,"fat":0.3,"servingName":"一碗","servingGrams":200,"matched":""}',
    )
    expect(guess).toEqual({
      name: '白米饭',
      grams: 200,
      kcal: 116,
      protein: 2.6,
      carbs: 25.9,
      fat: 0.3,
      servingName: '一碗',
      servingGrams: 200,
      matched: '',
    })
  })

  it('剥掉代码块', () => {
    const guess = parseFoodAnalysis('```json\n{"name":"鸡胸肉","grams":150,"kcal":165}\n```')
    expect(guess?.name).toBe('鸡胸肉')
    expect(guess?.grams).toBe(150)
    expect(guess?.kcal).toBe(165)
  })

  it('接受带单位的字符串数字', () => {
    const guess = parseFoodAnalysis('{"name":"牛奶","grams":"250g","kcal":"54kcal","protein":"3.3g"}')
    expect(guess?.grams).toBe(250)
    expect(guess?.kcal).toBe(54)
    expect(guess?.protein).toBe(3.3)
  })

  it('兼容套了一层 per100g 的回答', () => {
    const guess = parseFoodAnalysis(
      '{"name":"燕麦","grams":40,"per100g":{"kcal":389,"protein":16.9,"carbs":66.3,"fat":6.9}}',
    )
    expect(guess?.kcal).toBe(389)
    expect(guess?.protein).toBe(16.9)
  })

  it('缺名字就当没认出来', () => {
    expect(parseFoodAnalysis('{"grams":100,"kcal":100}')).toBeNull()
    expect(parseFoodAnalysis('{"name":"   "}')).toBeNull()
  })

  it('不是 JSON 就当没认出来', () => {
    expect(parseFoodAnalysis('看起来像一碗面')).toBeNull()
  })

  it('离谱的数值会被夹回合理区间', () => {
    const guess = parseFoodAnalysis('{"name":"炸鸡","grams":99999,"kcal":10000,"protein":500}')
    expect(guess?.grams).toBe(5000)
    expect(guess?.kcal).toBe(900)
    expect(guess?.protein).toBe(100)
  })

  it('只有份量名没克数时，份量克数留空', () => {
    const guess = parseFoodAnalysis('{"name":"汤","grams":300,"servingName":"一碗"}')
    expect(guess?.servingName).toBe('一碗')
    expect(guess?.servingGrams).toBeNull()
  })

  it('没给克数时默认按 100g', () => {
    expect(parseFoodAnalysis('{"name":"苹果","kcal":52}')?.grams).toBe(100)
  })
})
