import { describe, expect, it } from 'vitest'
import { COMMON_EXERCISES, EXERCISE_LIBRARY, findExercise, searchExercises } from './exerciseLibrary'

describe('动作库搜索', () => {
  it('中文名能搜到', () => {
    expect(searchExercises('卧推').map((item) => item.name)).toContain('卧推')
    expect(searchExercises('深蹲')[0].name).toBe('深蹲')
  })

  it('英文别名也能搜到', () => {
    expect(searchExercises('bench').map((item) => item.name)).toContain('卧推')
    expect(searchExercises('squat').map((item) => item.name)).toContain('深蹲')
    expect(searchExercises('plank').map((item) => item.name)).toContain('平板支撑')
  })

  it('同一个动作只出现一次', () => {
    const names = searchExercises('press').map((item) => item.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('空关键词返回默认列表，且不超过上限', () => {
    expect(searchExercises('', 5)).toHaveLength(5)
    expect(searchExercises('', 100)).toHaveLength(EXERCISE_LIBRARY.length)
  })

  it('常用动作都能在库里找到', () => {
    expect(COMMON_EXERCISES).toHaveLength(8)
    expect(COMMON_EXERCISES.every((item) => item !== undefined)).toBe(true)
  })

  it('按名字或别名能补全类型与部位', () => {
    expect(findExercise('硬拉')).toMatchObject({ kind: 'strength', muscle: 'back' })
    expect(findExercise('running')).toMatchObject({ name: '跑步', kind: 'cardio' })
    expect(findExercise('不存在的动作')).toBeUndefined()
  })
})
