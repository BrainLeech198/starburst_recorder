import { describe, expect, it } from 'vitest'
import type { AssistantAction } from './assistantActionBuild'
import { applyEdits, draftOf, draftValid, editFields } from './assistantActionEdit'

const INTAKE: AssistantAction = {
  kind: 'intake',
  dateKey: '2026-11-03',
  time: '12:30',
  foodId: null,
  name: '米饭',
  grams: 150,
  kcal: 174,
  protein: 3.9,
  carbs: 38.9,
  fat: 0.5,
}

describe('卡片就地编辑', () => {
  it('初值就是动作里的当前值', () => {
    expect(draftOf(INTAKE)).toEqual({ name: '米饭', grams: '150', kcal: '174', time: '12:30' })
  })

  it('改克数和热量，其余字段保持原样', () => {
    const next = applyEdits(INTAKE, { ...draftOf(INTAKE), grams: '250', kcal: '290' })
    expect(next).toMatchObject({
      kind: 'intake',
      name: '米饭',
      grams: 250,
      kcal: 290,
      protein: 3.9,
      time: '12:30',
    })
  })

  it('数字不合法时拒绝保存', () => {
    expect(applyEdits(INTAKE, { ...draftOf(INTAKE), grams: '0' })).toBeNull()
    expect(applyEdits(INTAKE, { ...draftOf(INTAKE), grams: 'abc' })).toBeNull()
  })

  it('必填项为空时校验不通过', () => {
    expect(draftValid(editFields(INTAKE), { name: '', grams: '150', kcal: '174', time: '' })).toBe(
      false,
    )
    expect(draftValid(editFields(INTAKE), draftOf(INTAKE))).toBe(true)
  })

  it('改记录类动作留空表示不改', () => {
    const action: AssistantAction = {
      kind: 'financeEdit',
      code: 'F1',
      dateKey: '2026-11-03',
      name: '午饭',
      amount: 28,
    }
    expect(applyEdits(action, { name: '', amount: '30' })).toMatchObject({
      name: '午饭',
      amount: 30,
    })
  })

  it('删除类动作没有可编辑字段', () => {
    const action: AssistantAction = {
      kind: 'financeDelete',
      code: 'F1',
      dateKey: '2026-11-03',
      name: '午饭',
      amount: 28,
    }
    expect(editFields(action)).toEqual([])
    expect(applyEdits(action, {})).toBeNull()
  })

  it('食物待确认卡可以改全套每百克营养，允许真实的 0 营养值', () => {
    const action: AssistantAction = {
      kind: 'foodCreate',
      name: '蒸蛋',
      kcal: 70,
      protein: 6,
      carbs: 0,
      fat: 4,
      servingName: null,
      servingGrams: null,
    }
    const draft = { ...draftOf(action), protein: '6.5', servingName: '一碗', servingGrams: '180' }

    expect(draftValid(editFields(action), draft)).toBe(true)
    expect(applyEdits(action, draft)).toMatchObject({
      kind: 'foodCreate', name: '蒸蛋', kcal: 70, protein: 6.5, carbs: 0, fat: 4,
      servingName: '一碗', servingGrams: 180,
    })
  })

  it('套餐草稿能改成分和克数，并拒绝空套餐', () => {
    const action: AssistantAction = {
      kind: 'mealCreate',
      name: '蛋包饭',
      items: [
        { foodId: 'egg', name: '鸡蛋', grams: 50 },
        { foodId: 'ham', name: '火腿丁', grams: 20 },
      ],
    }
    const draft = {
      ...draftOf(action),
      name: '蛋包饭（加火腿丁）',
      items: JSON.stringify([
        { foodId: 'egg', name: '鸡蛋', grams: 60 },
        { foodId: 'ham', name: '火腿丁', grams: 25 },
      ]),
    }

    expect(draftValid(editFields(action), draft)).toBe(true)
    expect(applyEdits(action, draft)).toMatchObject({
      kind: 'mealCreate',
      name: '蛋包饭（加火腿丁）',
      items: [
        { foodId: 'egg', name: '鸡蛋', grams: 60 },
        { foodId: 'ham', name: '火腿丁', grams: 25 },
      ],
    })
    expect(draftValid(editFields(action), { ...draft, items: '[]' })).toBe(false)
    expect(applyEdits(action, { ...draft, items: '[]' })).toBeNull()
  })
})
